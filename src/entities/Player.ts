import Phaser from 'phaser';
import { COLLISION, PLAYER_MAX_X, PLAYER_MIN_X, PLAYER_SPEED, STEPS_PER_SECOND } from '../utils/Constants';
import { WEAPONS } from '../data/gameData';

const HIT_FLASH_MS = 90;
/** Matter wants px/step; PLAYER_SPEED is px/sec. */
const PLAYER_STEP_SPEED = PLAYER_SPEED / STEPS_PER_SECOND;
/** ~185px of rise (Matter's 0.01 air drag included): clears a 4-plank stack with room to spare. */
const JUMP_SPEED = 700;
const JUMP_STEP_SPEED = JUMP_SPEED / STEPS_PER_SECOND;
/** The 44px collider ends at centre + 22, so the probe runs from just inside the sole to 6px past it. */
const FOOT_PROBE_FROM = 17;
const FOOT_PROBE_TO = 28;
/**
 * px/step. A plank landing (restitution 0.04) can bounce the body up by about 0.5 px/step for a
 * frame or two, so only a faster climb is a flight. A jump starts at JUMP_SPEED / 60, ~11.7 px/step.
 */
const MAX_LANDING_BOUNCE = 1;
const HIT_FLASH_TINT = 0xff6a5a;

export class Player {
 /** Owns the collider and never rotates: a tilted box changes what the feet and the walls see. */
 readonly sprite: Phaser.Physics.Matter.Image;
 /** Carries the aim angle for the sprite, so the collider can stay upright. */
 private readonly view: Phaser.GameObjects.Image;
 private readonly scene: Phaser.Scene;
 private cursor: Phaser.Types.Input.Keyboard.CursorKeys;
 private keyA: Phaser.Input.Keyboard.Key | undefined;
 private keyD: Phaser.Input.Keyboard.Key | undefined;
 private keyW: Phaser.Input.Keyboard.Key | undefined;
 private fireTimer = 0;
 private flashUntil = 0;
 private readonly onFire: (angle: number) => void;

 constructor(scene: Phaser.Scene, x: number, y: number, onFire: (angle: number) => void) {
  this.scene = scene;
  this.onFire = onFire;
  this.sprite = scene.matter.add.image(x, y, 'player');
  this.sprite.setBody({ type: 'rectangle', width: 24, height: 44 });
  this.sprite.setFixedRotation();
  this.sprite.setCollisionCategory(COLLISION.PLAYER);
  this.sprite.setCollidesWith(COLLISION.ALL);
  this.sprite.setDepth(10);
  (this.sprite.body as MatterJS.BodyType).plugin.player = true;
  // Matter's setRotation turns the collider too, so the aim angle goes on a separate image.
  this.view = scene.add.image(x, y, 'player').setDepth(10);
  this.sprite.setVisible(false);

  this.cursor = scene.input.keyboard!.createCursorKeys();
  this.keyA = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
  this.keyD = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  this.keyW = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
 }

 update(delta: number): void {
  if (this.flashUntil !== 0 && this.scene.time.now >= this.flashUntil) {
   this.flashUntil = 0;
   this.view.clearTint();
  }

  const left = this.cursor.left.isDown || this.keyA!.isDown;
  const right = this.cursor.right.isDown || this.keyD!.isDown;
  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  this.sprite.setVelocityX(dir * PLAYER_STEP_SPEED);

  const x = Phaser.Math.Clamp(this.sprite.x, PLAYER_MIN_X, PLAYER_MAX_X);
  if (x !== this.sprite.x) this.sprite.setPosition(x, this.sprite.y);

  // Press edges only: a key held down must not fire a fresh jump frame after frame.
  const jump = Phaser.Input.Keyboard.JustDown(this.cursor.space)
   || Phaser.Input.Keyboard.JustDown(this.cursor.up)
   || Phaser.Input.Keyboard.JustDown(this.keyW!);
  if (jump && this.grounded()) this.sprite.setVelocityY(-JUMP_STEP_SPEED);

  const pointer = this.sprite.scene.input.activePointer;
  const angle = Math.atan2(pointer.y - this.sprite.y, pointer.x - this.sprite.x);
  this.view.setPosition(this.sprite.x, this.sprite.y).setRotation(angle);

  this.fireTimer -= delta;
  if (pointer.isDown && this.fireTimer <= 0) {
   this.fireTimer = 1000 / WEAPONS.survivor_pistol.fireRate;
   this.onFire(angle);
  }
 }

 /**
  * Matter's ray query over the world bodies: one short probe under the sole is the whole ground
  * test. The ray runs straight down the body centre, so a wall beside the player never grounds it.
  * Only a body the player collides with counts: sensors and zombies (which the player walks
  * through) are not floor, or every zombie in the horde would hand out an air jump.
  */
 private grounded(): boolean {
  const body = this.sprite.body as MatterJS.BodyType | null;
  if (body === null) return false;
  // Still climbing: an upward flight owns the body until gravity brings it back down.
  if (body.velocity.y < -MAX_LANDING_BOUNCE) return false;
  const world = this.scene.matter.world.localWorld as unknown as MatterJS.CompositeType;
  const x = body.position.x;
  const y = body.position.y;
  // Matter's ray pushes { body } collisions; Phaser's CollisionData type does not describe them.
  const hits = this.scene.matter.query.ray(
   world.bodies,
   { x, y: y + FOOT_PROBE_FROM },
   { x, y: y + FOOT_PROBE_TO },
  ) as unknown as Array<{ body: MatterJS.BodyType }>;
  // No collision groups exist here, so the category/mask test is Matter's whole canCollide rule.
  return hits.some((hit) => hit.body !== body && !hit.body.isSensor
   && (hit.body.collisionFilter.mask & body.collisionFilter.category) !== 0);
 }

 /** Damage feedback for the owning scene; the tint clears itself in update(). */
 flashHit(): void {
  this.flashUntil = this.scene.time.now + HIT_FLASH_MS;
  this.view.setTint(HIT_FLASH_TINT);
 }
}

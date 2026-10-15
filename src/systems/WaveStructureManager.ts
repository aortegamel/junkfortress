import Phaser from 'phaser';
import { BLAST_DAMAGE, BLAST_IMPULSE, BLAST_SHAKE, BLAST_SHAKE_MS, COLLISION, CRUSH_COOLDOWN_MS, CRUSH_MIN_VY, GROUND_ANCHOR_ID, MAX_BODY_VELOCITY, STEPS_PER_SECOND } from '../utils/Constants';
import { ITEM_DEFINITIONS } from '../data/items';
import type { ItemDefinition, Material } from '../data/items';
import { runStore } from '../state/runStore';
import { crushDamage } from '../utils/Crush';
import { explosionDamage } from '../utils/Explosion';
import { groundedNailObjects } from './StructureSystem';
import { sfx } from './Audio';
import type { Effects } from './Effects';
import type { ChainAnchor, ItemType, SavedBuildObject, SavedChain, SavedNail } from '../types/game';
import type { Zombie } from '../entities/Zombie';

export interface StructureTarget {
 id: string;
 x: number;
 y: number;
 angle: number;
 width: number;
 height: number;
 material: Material;
}

export interface ChainSegment {
 id: string;
 ax: number;
 ay: number;
 bx: number;
 by: number;
}

export interface StructureInfo {
 id: string;
 type: ItemType;
 material: Material;
 hp: number;
 maxHp: number;
 x: number;
 y: number;
 rotation: number;
 dynamic: boolean;
}

export interface BuildObjectPlugin {
 id: string;
 def: ItemDefinition;
 hp: number;
 maxHp: number;
 sprite: Phaser.Physics.Matter.Image | null;
 body: MatterJS.BodyType;
}

/** Phaser's pair typings omit `collision`, but Matter fills it in for collision events. */
interface CollisionPair {
 bodyA: MatterJS.BodyType;
 bodyB: MatterJS.BodyType;
 collision: { normal: { x: number; y: number } };
}

interface BodyRuntime {
 def: ItemDefinition;
 img: Phaser.Physics.Matter.Image;
 body: MatterJS.BodyType;
 plugin: BuildObjectPlugin;
 overlay: Phaser.GameObjects.Image | null;
 /** Live geometry handed to the bullet sweep; values refresh in refreshLive(). */
 target: StructureTarget;
 hp: number;
 maxHp: number;
 lastX: number;
 lastY: number;
 /** Body angle the saved nail and chain offsets were last written against. */
 anchorAngle: number;
}

interface ChainRuntime {
 id: string;
 objectAId: string;
 objectBId: string;
 constraint: MatterJS.ConstraintType;
 bodyA: MatterJS.BodyType;
 bodyB: MatterJS.BodyType;
 localAx: number;
 localAy: number;
 localBx: number;
 localBy: number;
 /** Body angles when the constraint was created; Matter rotates anchors by the delta since. */
 angleA: number;
 angleB: number;
 hp: number;
 segment: ChainSegment;
}

/** One end of a nail: an offset on a body, or an absolute point on the ground. */
interface NailEnd {
 /** Null for a ground end. */
 body: MatterJS.BodyType | null;
 objectId: string | null;
 x: number;
 y: number;
 /** Body angle the offset was saved at. The offset turns with the body after that. */
 refAngle: number;
 /** Live world position, refreshed in refreshLive(). */
 wx: number;
 wy: number;
}

interface NailRuntime {
 id: string;
 a: NailEnd;
 b: NailEnd;
 /** Null while the joint needs no solver work: a frozen ground group, or a ground nail. */
 constraint: MatterJS.ConstraintType | null;
}

const OBJECT_DEPTH = 5;
const OVERLAY_DEPTH = 5.5;
const CHAIN_DEPTH = 6;
/** Nails sit on the pieces they hold, so they draw above the damage overlay and below the chains. */
const NAIL_DEPTH = 5.8;
/** Matter velocity is px per 16.67ms step; crush and clamp tuning is authored in px/sec. */
const PX_PER_SECOND = STEPS_PER_SECOND;
const CRUSH_MIN_STEP_VY = CRUSH_MIN_VY / PX_PER_SECOND;
const MAX_STEP_SPEED = MAX_BODY_VELOCITY / PX_PER_SECOND;
const OVERLAY_DAMAGE_RATIO = 0.6;
const OVERLAY_MAX_ALPHA = 0.7;
const CHAIN_STIFFNESS = 0.9;
const CHAIN_DAMPING = 0.02;
const CHAIN_MIN_LENGTH = 4;
const CHAIN_LINE_WIDTH = 6;
const CHAIN_INNER_WIDTH = 2;
const CHAIN_DARK_COLOR = 0x2b2d31;
const CHAIN_LIGHT_COLOR = 0x8b939c;
const CHAIN_TICK_SPACING = 15;
const CHAIN_TICK_HALF = 4;
const CHAIN_ANCHOR_RADIUS = 3;
const CHAIN_ANCHOR_COLOR = 0x4a4f57;
const CHAIN_SNAP_BURSTS = 3;
const CHAIN_SNAP_SPARKS = 5;
const CHAIN_SNAP_SHAKE = 3;
/** A nail is a rigid joint: two free pieces hold their offsets until the joint breaks. */
const NAIL_STIFFNESS = 1;
const NAIL_DAMPING = 0.1;
const NAIL_LINE_WIDTH = 5;
const NAIL_HEAD_RADIUS = 3;
const NAIL_DARK_COLOR = 0x2b2d31;
const NAIL_HEAD_COLOR = 0xb9c0c8;
const WOOD_DEBRIS_COLOR = 0xa9803f;
const METAL_DEBRIS_COLOR = 0x9aa4ae;
const HIT_SPARKS = 4;
const HIT_SPLINTERS = 4;
/** Past this mass an object is "heavy": louder break, harder crush impact. */
const HEAVY_MASS_KG = 50;
const ANVIL_BREAK_SHAKE = 6;
const CRUSH_SHAKE = 8;
const CRUSH_SHAKE_MS = 160;
const CRUSH_DUST = 5;
/** Sub-pixel nudge that frees a released body from its old resting contact. */
const NUDGE = { x: 0, y: 0.5 };
/** Build mode and scene teardown have no zombies, so they share one empty provider. */
const NO_ZOMBIES: readonly Zombie[] = [];
const noZombies = (): readonly Zombie[] => NO_ZOMBIES;
/** Scratch vectors: the per-frame and per-hit paths must not allocate. */
const VELOCITY = { x: 0, y: 0 };
const ZERO_VELOCITY = { x: 0, y: 0 };
const POSITION = { x: 0, y: 0 };
const POINT = { x: 0, y: 0 };

export class WaveStructureManager {
 private readonly scene: Phaser.Scene;
 private readonly effects: Effects;
 private readonly zombies: () => readonly Zombie[];
 private readonly bodies = new Map<string, BodyRuntime>();
 private readonly chains = new Map<string, ChainRuntime>();
 private readonly nails = new Map<string, NailRuntime>();
 private readonly crushCooldowns = new Map<string, number>();
 private readonly chainLayer: Phaser.GameObjects.Graphics;
 private readonly nailLayer: Phaser.GameObjects.Graphics;
 private readonly targetList: StructureTarget[] = [];
 private readonly segmentList: ChainSegment[] = [];
 private readonly detachedIds: string[] = [];
 private refreshedAt = Number.NaN;

 constructor(scene: Phaser.Scene, opts: { effects: Effects; zombies?: () => readonly Zombie[] }) {
  this.scene = scene;
  this.effects = opts.effects;
  this.zombies = opts.zombies ?? noZombies;
  this.chainLayer = scene.add.graphics().setDepth(CHAIN_DEPTH);
  this.nailLayer = scene.add.graphics().setDepth(NAIL_DEPTH);
  scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollisionStart, this);
 }

 /** Spawns the saved build through the same reconcile path every later edit uses. */
 spawn(): void {
  this.syncBuild();
 }

 /**
  * Reconciles the saved build with the live bodies: spawns new pieces, drops returned ones, and
  * puts edited ones back where the store says they are. Untouched bodies keep their velocity, and
  * a build edit never plays destruction effects or counts as a loss.
  * ponytail: every lookup is a linear scan over the store, which is fine for a few dozen pieces on
  * an edit; index objects, chains and nails by id if a build ever gets much larger.
  */
 syncBuild(): void {
  const state = runStore.get();

  for (const id of [...this.bodies.keys()]) {
   if (!state.placedObjects.some((obj) => obj.id === id)) this.removeBody(id, false);
  }

  // An edited piece jumps to its saved pose with no leftover momentum; the rest are left alone.
  const moved = new Set<string>();
  for (const obj of state.placedObjects) {
   const rt = this.bodies.get(obj.id);
   if (rt === undefined) {
    this.spawnObject(obj);
    continue;
   }
   const angle = Phaser.Math.DegToRad(obj.rotation);
   const body = rt.body;
   if (body.position.x === obj.x && body.position.y === obj.y && body.angle === angle) continue;

   POSITION.x = obj.x;
   POSITION.y = obj.y;
   this.scene.matter.body.setPosition(body, POSITION);
   this.scene.matter.body.setAngle(body, angle);
   this.scene.matter.body.setVelocity(body, ZERO_VELOCITY);
   this.scene.matter.body.setAngularVelocity(body, 0);
   rt.anchorAngle = angle;
   moved.add(obj.id);
  }

  // A moved piece needs its attachments rebuilt: their saved ends are measured from its center.
  for (const [id, cr] of this.chains) {
   if (moved.has(cr.objectAId) || moved.has(cr.objectBId) || !state.chains.some((c) => c.id === id)) {
    this.removeChainRuntime(id);
   }
  }
  for (const chain of state.chains) {
   if (!this.chains.has(chain.id)) this.spawnChain(chain);
  }

  for (const [id, nr] of this.nails) {
   const onMoved = moved.has(nr.a.objectId ?? '') || moved.has(nr.b.objectId ?? '');
   if (onMoved || !state.nails.some((n) => n.id === id)) this.removeNailRuntime(id);
  }
  for (const nail of state.nails) {
   if (!this.nails.has(nail.id)) this.spawnNail(nail);
  }

  this.syncAnchoring();
  this.invalidateLive();
 }

 /** Copies live poses into the saved build while the player builds. Ground nail points never move. */
 syncBuildPoses(): void {
  const state = runStore.get();
  for (const obj of state.placedObjects) {
   const rt = this.bodies.get(obj.id);
   if (rt === undefined) continue;
   const body = rt.body;
   if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) continue;

   obj.x = body.position.x;
   obj.y = body.position.y;
   obj.rotation = Phaser.Math.RadToDeg(body.angle);

   // Saved nail and chain offsets are world-axis, so they turn with the piece they sit on.
   const turned = body.angle - rt.anchorAngle;
   if (turned === 0) continue;
   this.rotateAnchors(obj.id, turned);
   rt.anchorAngle = body.angle;
  }
 }

 getObjectImage(id: string): Phaser.Physics.Matter.Image | undefined {
  return this.bodies.get(id)?.img;
 }

 /** Drops every body, chain, and nail. The saved build stays in the store for the next scene. */
 dispose(): void {
  // Scene shutdown destroys the physics world first, leaving these maps pointing at dead bodies;
  // there is nothing left to remove, so only drop the runtime copies.
  if (this.scene.matter?.world == null) {
   this.bodies.clear();
   this.chains.clear();
   this.nails.clear();
   this.targetList.length = 0;
   this.segmentList.length = 0;
   this.chainLayer.destroy();
   this.nailLayer.destroy();
   return;
  }
  this.scene.matter.world.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollisionStart, this);
  for (const id of [...this.bodies.keys()]) this.removeBody(id, false);
  this.chainLayer.destroy();
  this.nailLayer.destroy();
 }

 /** Saved chain and nail anchors are offsets from a piece center, so a turn carries them around. */
 private rotateAnchors(objectId: string, delta: number): void {
  const state = runStore.get();
  for (const chain of state.chains) {
   if (chain.anchorA.objectId === objectId) turnAnchor(chain.anchorA, delta);
   if (chain.anchorB.objectId === objectId) turnAnchor(chain.anchorB, delta);
  }
  for (const nail of state.nails) {
   if (nail.anchorA.objectId === objectId) turnAnchor(nail.anchorA, delta);
   if (nail.anchorB.objectId === objectId) turnAnchor(nail.anchorB, delta);
  }
 }

 update(): void {
  this.refreshLive();
  this.renderChains();
  this.renderNails();
  this.updateBodies();
 }

 damageObject(id: string, amount: number, hit?: { x: number; y: number }): boolean {
  const rt = this.bodies.get(id);
  if (rt === undefined || amount <= 0) return false;

  rt.hp = Math.max(0, rt.hp - amount);
  rt.plugin.hp = rt.hp;
  runStore.updateObjectHp(id, rt.hp);
  this.updateDamageVisual(rt);

  const x = hit ? hit.x : rt.body.position.x;
  const y = hit ? hit.y : rt.body.position.y;
  if (rt.def.material === 'wood') {
   this.effects.splinters(x, y, HIT_SPLINTERS);
   sfx.woodHit();
  } else {
   this.effects.sparks(x, y, 0, -1, HIT_SPARKS);
   sfx.metalHit();
  }

  if (rt.hp > 0) return false;
  this.destroyObject(id);
  return true;
 }

 destroyObject(id: string): void {
  if (!this.bodies.has(id)) return;
  this.removeBody(id, true);
  this.syncAnchoring();
  this.invalidateLive();
 }

 /**
  * Drops a body and everything attached to it. `loud` keeps break effects and the loss count for
  * combat destruction; a build edit or a teardown only removes the runtime.
  */
 private removeBody(id: string, loud: boolean): void {
  const rt = this.bodies.get(id);
  if (rt === undefined) return;

  // Read the pose before the world drops the body: the break effects and a tank blast fire here.
  const x = rt.body.position.x;
  const y = rt.body.position.y;

  // Chains and nails die with their anchors, so detach them first and let the loads go.
  const detached = this.detachedIds;
  detached.length = 0;
  for (const [chainId, cr] of this.chains) {
   if (cr.objectAId === id || cr.objectBId === id) detached.push(chainId);
  }
  for (let i = 0; i < detached.length; i++) {
   if (loud) this.destroyChain(detached[i]);
   else this.removeChainRuntime(detached[i]);
  }
  detached.length = 0;
  for (const [nailId, nr] of this.nails) {
   if (nr.a.objectId === id || nr.b.objectId === id) detached.push(nailId);
  }
  for (let i = 0; i < detached.length; i++) this.removeNailRuntime(detached[i]);

  this.scene.matter.world.remove(rt.body);
  rt.img.destroy();
  if (rt.overlay !== null) rt.overlay.destroy();
  this.bodies.delete(id);
  const targetIndex = this.targetList.indexOf(rt.target);
  if (targetIndex !== -1) this.targetList.splice(targetIndex, 1);
  this.dropCrushCooldowns(id);
  if (!loud) return;

  // This also drops the saved nails that hung off the piece that just broke.
  runStore.recordStructureLost(id);

  const heavy = rt.def.massKg >= HEAVY_MASS_KG;
  if (rt.def.material === 'wood') {
   this.effects.debris(x, y, WOOD_DEBRIS_COLOR, heavy ? 16 : 10);
   this.effects.splinters(x, y, heavy ? 12 : 8);
   sfx.woodBreak();
  } else {
   this.effects.debris(x, y, METAL_DEBRIS_COLOR, heavy ? 14 : 8);
   this.effects.sparks(x, y, 0, -1, heavy ? 14 : 10);
   if (heavy) this.effects.shake(ANVIL_BREAK_SHAKE);
   sfx.metalBreak();
  }

  // A tank detonates where it broke. Build edits and teardown pass loud: false and never get here.
  if (rt.def.explodes === true) this.explode(x, y);
 }

 /**
  * One propane blast: a radial hit on zombies and pieces, plus a kick for live junk. A killed tank
  * comes back through damageObject -> destroyObject -> explode, so the recursion runs once per
  * exploding tank and is bounded by the piece count.
  */
 private explode(x: number, y: number): void {
  sfx.explosion();
  this.effects.blast(x, y, METAL_DEBRIS_COLOR);
  this.effects.shake(BLAST_SHAKE, BLAST_SHAKE_MS);

  // A dying zombie mutates the scene's live list, so iterate a copy of the provider result.
  const zombies = [...this.zombies()];
  for (let i = 0; i < zombies.length; i++) {
   const zombie = zombies[i];
   if (!zombie.alive) continue;
   const body = zombie.sprite.body as MatterJS.BodyType | null;
   if (body === null) continue;
   const px = body.position.x;
   const py = body.position.y;
   if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
   const damage = explosionDamage(Math.hypot(px - x, py - y));
   if (damage <= 0) continue;
   zombie.damage(damage, 'explosion');
  }

  // Collected first, applied after: a killed tank re-enters explode() mid-loop, so a shared scratch
  // array or a live this.bodies iteration would be clobbered by the nested blast.
  const ids: string[] = [];
  const damages: number[] = [];
  for (const rt of this.bodies.values()) {
   const body = rt.body;
   const px = body.position.x;
   const py = body.position.y;
   if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

   const damage = explosionDamage(Math.hypot(px - x, py - y));
   if (damage <= 0) continue;
   ids.push(rt.target.id);
   damages.push(damage);
   if (body.isStatic) continue;

   // Radial kick, clamped exactly like updateBodies does it.
   let dx = px - x;
   let dy = py - y;
   const distance = Math.hypot(dx, dy);
   if (distance === 0) {
    // A body on the exact centre has no direction: push it straight up.
    dx = 0;
    dy = -1;
   } else {
    dx /= distance;
    dy /= distance;
   }
   const kick = BLAST_IMPULSE * (damage / BLAST_DAMAGE);
   let vx = body.velocity.x + dx * kick;
   let vy = body.velocity.y + dy * kick;
   if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
    this.scene.matter.body.setVelocity(body, ZERO_VELOCITY);
    continue;
   }
   const speed = Math.hypot(vx, vy);
   if (speed > MAX_STEP_SPEED) {
    const k = MAX_STEP_SPEED / speed;
    vx *= k;
    vy *= k;
   }
   VELOCITY.x = vx;
   VELOCITY.y = vy;
   this.scene.matter.body.setVelocity(body, VELOCITY);
  }

  // Applying afterwards sends a chained tank through the normal damage path, so it detonates too.
  for (let i = 0; i < ids.length; i++) this.damageObject(ids[i], damages[i]);
 }

 damageChain(id: string, amount: number, hit?: { x: number; y: number }): boolean {
  const cr = this.chains.get(id);
  if (cr === undefined || amount <= 0) return false;

  cr.hp = Math.max(0, cr.hp - amount);
  runStore.updateChainHp(id, cr.hp);

  const x = hit ? hit.x : (cr.segment.ax + cr.segment.bx) / 2;
  const y = hit ? hit.y : (cr.segment.ay + cr.segment.by) / 2;
  this.effects.sparks(x, y, 0, -1, HIT_SPARKS);
  sfx.metalHit();

  if (cr.hp > 0) return false;
  this.destroyChain(id);
  return true;
 }

 destroyChain(id: string): void {
  const cr = this.chains.get(id);
  if (cr === undefined) return;

  // Sparks along the whole length so the snap reads even when the chain is off centre.
  const { ax, ay, bx, by } = cr.segment;
  this.removeChainRuntime(id);
  runStore.removeChain(id);
  runStore.recordStructureLost(id);

  sfx.chainSnap();
  for (let i = 0; i < CHAIN_SNAP_BURSTS; i++) {
   const t = (i + 1) / (CHAIN_SNAP_BURSTS + 1);
   this.effects.sparks(ax + (bx - ax) * t, ay + (by - ay) * t, 0, -1, CHAIN_SNAP_SPARKS);
  }
  this.effects.shake(CHAIN_SNAP_SHAKE);

  this.invalidateLive();
 }

 /** Drops a chain from the world without effects or loss statistics. */
 private removeChainRuntime(id: string): void {
  const cr = this.chains.get(id);
  if (cr === undefined) return;

  this.scene.matter.world.removeConstraint(cr.constraint);
  this.chains.delete(id);
  const segmentIndex = this.segmentList.indexOf(cr.segment);
  if (segmentIndex !== -1) this.segmentList.splice(segmentIndex, 1);
 }

 /** Drops a nail joint from the world without touching the saved build. */
 private removeNailRuntime(id: string): void {
  const nr = this.nails.get(id);
  if (nr === undefined) return;

  if (nr.constraint !== null) this.scene.matter.world.removeConstraint(nr.constraint);
  this.nails.delete(id);
 }

 getTargets(): readonly StructureTarget[] {
  this.refreshLive();
  return this.targetList;
 }

 getChainSegments(): readonly ChainSegment[] {
  this.refreshLive();
  return this.segmentList;
 }

 dynamicCount(): number {
  let count = 0;
  for (const rt of this.bodies.values()) {
   if (!rt.body.isStatic) count += 1;
  }
  return count;
 }

 chainCount(): number {
  return this.chains.size;
 }

 forEachObject(cb: (info: StructureInfo) => void): void {
  for (const rt of this.bodies.values()) {
   cb({
    id: rt.target.id,
    type: rt.def.id,
    material: rt.def.material,
    hp: rt.hp,
    maxHp: rt.maxHp,
    x: rt.body.position.x,
    y: rt.body.position.y,
    rotation: rt.body.angle,
    dynamic: !rt.body.isStatic,
   });
  }
 }

 private spawnObject(obj: SavedBuildObject): void {
  const def = ITEM_DEFINITIONS[obj.type];
  const img = this.scene.matter.add.image(obj.x, obj.y, obj.type, undefined, {
   shape: { type: 'rectangle', width: def.width, height: def.height },
   density: densityFor(def),
   friction: 0.6,
   frictionStatic: 0.9,
   restitution: 0.04,
  });
  // Every piece starts dynamic; syncAnchoring freezes the nail groups that reach the ground.
  img.setRotation(Phaser.Math.DegToRad(obj.rotation));
  img.setCollisionCategory(COLLISION.BUILD_OBJECT);
  img.setCollidesWith(COLLISION.ALL);
  img.setDepth(OBJECT_DEPTH);

  const body = img.body as MatterJS.BodyType;
  const plugin: BuildObjectPlugin = { id: obj.id, def, hp: obj.hp, maxHp: def.maxHp, sprite: img, body };
  body.plugin.buildObject = plugin;

  // Overlay art matches plank and metal sheet 1:1; the anvil stretches the dent tile.
  const overlay = this.scene.add
   .image(obj.x, obj.y, def.material === 'wood' ? 'crack' : 'dent')
   .setDisplaySize(def.width, def.height)
   .setRotation(Phaser.Math.DegToRad(obj.rotation))
   .setDepth(OVERLAY_DEPTH)
   .setAlpha(0)
   .setVisible(false);

  const target: StructureTarget = {
   id: obj.id,
   x: obj.x,
   y: obj.y,
   angle: body.angle,
   width: def.width,
   height: def.height,
   material: def.material,
  };
  const rt: BodyRuntime = {
   def,
   img,
   body,
   plugin,
   overlay,
   target,
   hp: obj.hp,
   maxHp: def.maxHp,
   lastX: obj.x,
   lastY: obj.y,
   anchorAngle: body.angle,
  };
  this.bodies.set(obj.id, rt);
  this.targetList.push(target);
  this.updateDamageVisual(rt);
 }

 private spawnChain(chain: SavedChain): void {
  const runtimeA = this.bodies.get(chain.anchorA.objectId);
  const runtimeB = this.bodies.get(chain.anchorB.objectId);
  if (runtimeA === undefined || runtimeB === undefined) {
   runStore.removeChain(chain.id);
   return;
  }

  const localAx = chain.anchorA.x;
  const localAy = chain.anchorA.y;
  const localBx = chain.anchorB.x;
  const localBy = chain.anchorB.y;
  const ax = runtimeA.body.position.x + localAx;
  const ay = runtimeA.body.position.y + localAy;
  const bx = runtimeB.body.position.x + localBx;
  const by = runtimeB.body.position.y + localBy;
  const length = Math.max(Math.hypot(bx - ax, by - ay), CHAIN_MIN_LENGTH);

  const constraint = this.scene.matter.add.constraint(runtimeA.body, runtimeB.body, length, CHAIN_STIFFNESS, {
   pointA: { x: localAx, y: localAy },
   pointB: { x: localBx, y: localBy },
   damping: CHAIN_DAMPING,
  });

  const segment: ChainSegment = { id: chain.id, ax, ay, bx, by };
  this.chains.set(chain.id, {
   id: chain.id,
   objectAId: chain.anchorA.objectId,
   objectBId: chain.anchorB.objectId,
   constraint,
   bodyA: runtimeA.body,
   bodyB: runtimeB.body,
   localAx,
   localAy,
   localBx,
   localBy,
   angleA: runtimeA.body.angle,
   angleB: runtimeB.body.angle,
   hp: chain.hp,
   segment,
  });
  this.segmentList.push(segment);
 }

 private spawnNail(nail: SavedNail): void {
  const a = this.nailEnd(nail.anchorA);
  const b = this.nailEnd(nail.anchorB);
  if (a === null || b === null || (a.body === null && b.body === null)) {
   runStore.removeNail(nail.id);
   return;
  }

  const runtime: NailRuntime = { id: nail.id, a, b, constraint: null };
  this.nails.set(nail.id, runtime);
  this.reconcileNail(runtime);
 }

 /** Resolves one saved nail end: an absolute ground point, or an offset on a live body. */
 private nailEnd(anchor: ChainAnchor): NailEnd | null {
  if (anchor.objectId === GROUND_ANCHOR_ID) {
   return { body: null, objectId: null, x: anchor.x, y: anchor.y, refAngle: 0, wx: anchor.x, wy: anchor.y };
  }
  const rt = this.bodies.get(anchor.objectId);
  if (rt === undefined) return null;
  return {
   body: rt.body,
   objectId: anchor.objectId,
   x: anchor.x,
   y: anchor.y,
   refAngle: rt.body.angle,
   wx: 0,
   wy: 0,
  };
 }

 /**
  * Nails are rigid joints: two free pieces hold their relative pose until the joint breaks. A
  * joint that reaches frozen ground needs no solver work, because the frozen piece holds the pose.
  */
 private reconcileNail(nail: NailRuntime): void {
  const bodyA = nail.a.body;
  const bodyB = nail.b.body;
  if (bodyA === null || bodyB === null || bodyA.isStatic || bodyB.isStatic) {
   const existing = nail.constraint;
   if (existing !== null) this.scene.matter.world.removeConstraint(existing);
   nail.constraint = null;
   return;
  }
  if (nail.constraint !== null) return;

  nail.constraint = this.scene.matter.add.constraint(bodyA, bodyB, 0, NAIL_STIFFNESS, {
   pointA: this.nailPoint(nail.a),
   pointB: this.nailPoint(nail.b),
   damping: NAIL_DAMPING,
  });
 }

 /** The nail end in the body frame Matter wants, whatever the piece did since the nail went in. */
 private nailPoint(end: NailEnd): { x: number; y: number } {
  const delta = end.body === null ? 0 : end.body.angle - end.refAngle;
  return delta === 0 ? { x: end.x, y: end.y } : turn(end.x, end.y, delta);
 }

 private updateDamageVisual(rt: BodyRuntime): void {
  const overlay = rt.overlay;
  if (overlay === null) return;
  const ratio = rt.maxHp > 0 ? rt.hp / rt.maxHp : 0;
  if (ratio >= OVERLAY_DAMAGE_RATIO) {
   overlay.setVisible(false);
   return;
  }
  overlay.setAlpha(OVERLAY_MAX_ALPHA * (1 - ratio / OVERLAY_DAMAGE_RATIO));
  overlay.setVisible(true);
 }

 /**
  * Freezes the nail groups that reach the ground, and releases everything else. Only a nail chain
  * to the ground pins a piece: an un-nailed piece stays dynamic even where it rests on the ground.
  */
 private syncAnchoring(): void {
  const state = runStore.get();
  const grounded = groundedNailObjects(state.placedObjects, state.nails);

  for (const rt of this.bodies.values()) {
   const frozen = grounded.has(rt.target.id);
   if (rt.body.isStatic === frozen) continue;

   // Matter only snapshots the mass and inertia it later restores when a *dynamic* body is made
   // static, so bodies are always created dynamic and frozen afterwards, never the other way.
   this.scene.matter.body.setStatic(rt.body, frozen);
   if (frozen) continue;

   // A released body keeps its pose and gets no velocity, just a sub-pixel nudge so the solver
   // sees it as free instead of still resting on the ground it was pinned to.
   this.scene.matter.body.setDensity(rt.body, densityFor(rt.def));
   this.scene.matter.body.translate(rt.body, NUDGE);
  }

  for (const nail of this.nails.values()) this.reconcileNail(nail);
 }

 /** Clamp and repair dynamic bodies, then keep damage overlays glued to their objects. */
 private updateBodies(): void {
  for (const rt of this.bodies.values()) {
   const body = rt.body;
   const x = body.position.x;
   const y = body.position.y;

   if (Number.isFinite(x) && Number.isFinite(y)) {
    rt.lastX = x;
    rt.lastY = y;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
     this.scene.matter.body.setVelocity(body, ZERO_VELOCITY);
    } else {
     const speed = Math.hypot(vx, vy);
     if (speed > MAX_STEP_SPEED) {
      // Scale instead of zeroing: a slowed heavy body still reads as weight, a frozen one as a bug.
      const k = MAX_STEP_SPEED / speed;
      VELOCITY.x = vx * k;
      VELOCITY.y = vy * k;
      this.scene.matter.body.setVelocity(body, VELOCITY);
     }
    }
   } else {
    POSITION.x = rt.lastX;
    POSITION.y = rt.lastY;
    this.scene.matter.body.setPosition(body, POSITION);
    this.scene.matter.body.setVelocity(body, ZERO_VELOCITY);
    if (!Number.isFinite(body.angle)) this.scene.matter.body.setAngle(body, 0);
   }

   const overlay = rt.overlay;
   if (overlay !== null && overlay.visible) {
    overlay.setPosition(body.position.x, body.position.y);
    overlay.setRotation(body.angle);
   }
  }
 }

 private refreshLive(): void {
  const stamp = this.scene.time.now;
  if (stamp === this.refreshedAt) return;
  this.refreshedAt = stamp;

  for (const rt of this.bodies.values()) {
   const target = rt.target;
   target.x = rt.body.position.x;
   target.y = rt.body.position.y;
   target.angle = rt.body.angle;
  }

  for (const cr of this.chains.values()) {
   const segment = cr.segment;
   anchorWorld(cr.bodyA, cr.localAx, cr.localAy, cr.angleA, POINT);
   segment.ax = POINT.x;
   segment.ay = POINT.y;
   anchorWorld(cr.bodyB, cr.localBx, cr.localBy, cr.angleB, POINT);
   segment.bx = POINT.x;
   segment.by = POINT.y;
  }

  for (const nr of this.nails.values()) {
   this.placeNailEnd(nr.a);
   this.placeNailEnd(nr.b);
  }
 }

 /** A ground end holds its absolute point; a body end turns with the piece it sits on. */
 private placeNailEnd(end: NailEnd): void {
  if (end.body === null) {
   end.wx = end.x;
   end.wy = end.y;
   return;
  }
  anchorWorld(end.body, end.x, end.y, end.refAngle, POINT);
  end.wx = POINT.x;
  end.wy = POINT.y;
 }

 private invalidateLive(): void {
  this.refreshedAt = Number.NaN;
 }

 private renderChains(): void {
  const g = this.chainLayer;
  g.clear();
  if (this.chains.size === 0) return;

  for (const cr of this.chains.values()) {
   const { ax, ay, bx, by } = cr.segment;
   g.lineStyle(CHAIN_LINE_WIDTH, CHAIN_DARK_COLOR, 1);
   g.lineBetween(ax, ay, bx, by);
   g.lineStyle(CHAIN_INNER_WIDTH, CHAIN_LIGHT_COLOR, 1);
   g.lineBetween(ax, ay, bx, by);

   const dx = bx - ax;
   const dy = by - ay;
   const length = Math.hypot(dx, dy);
   if (length > CHAIN_TICK_SPACING) {
    const ux = dx / length;
    const uy = dy / length;
    for (let d = CHAIN_TICK_SPACING * 0.5; d < length; d += CHAIN_TICK_SPACING) {
     const px = ax + ux * d;
     const py = ay + uy * d;
     g.lineBetween(px - uy * CHAIN_TICK_HALF, py + ux * CHAIN_TICK_HALF, px + uy * CHAIN_TICK_HALF, py - ux * CHAIN_TICK_HALF);
    }
   }

   g.fillStyle(CHAIN_ANCHOR_COLOR, 1);
   g.fillCircle(ax, ay, CHAIN_ANCHOR_RADIUS);
   g.fillCircle(bx, by, CHAIN_ANCHOR_RADIUS);
  }
 }

 /** Nail heads sit on the joints they hold: a short bar with a head at each end. */
 private renderNails(): void {
  const g = this.nailLayer;
  g.clear();
  if (this.nails.size === 0) return;

  g.lineStyle(NAIL_LINE_WIDTH, NAIL_DARK_COLOR, 1);
  g.fillStyle(NAIL_HEAD_COLOR, 1);
  for (const nail of this.nails.values()) {
   const { a, b } = nail;
   g.lineBetween(a.wx, a.wy, b.wx, b.wy);
   g.fillCircle(a.wx, a.wy, NAIL_HEAD_RADIUS);
   g.fillCircle(b.wx, b.wy, NAIL_HEAD_RADIUS);
  }
 }

 private dropCrushCooldowns(objectId: string): void {
  const prefix = `${objectId}:`;
  for (const key of this.crushCooldowns.keys()) {
   if (key.startsWith(prefix)) this.crushCooldowns.delete(key);
  }
 }

 private onCollisionStart(event: MatterJS.IEventCollision<MatterJS.BodyType>): void {
  const pairs = event.pairs as unknown as CollisionPair[];
  for (let i = 0; i < pairs.length; i++) {
   const pair = pairs[i];
   this.resolveCrush(pair.bodyA, pair.bodyB, pair.collision.normal.x, pair.collision.normal.y);
   this.resolveCrush(pair.bodyB, pair.bodyA, pair.collision.normal.x, pair.collision.normal.y);
  }
 }

 private resolveCrush(falling: MatterJS.BodyType, other: MatterJS.BodyType, nx: number, ny: number): void {
  const buildObject = falling.plugin.buildObject as BuildObjectPlugin | undefined;
  const zombie = other.plugin.zombie as Zombie | undefined;
  if (buildObject === undefined || zombie === undefined) return;

  // Matter's normal direction depends on pair ordering, so orient it faller -> other ourselves.
  const dx = other.position.x - falling.position.x;
  const dy = other.position.y - falling.position.y;
  if (nx * dx + ny * dy < 0) {
   nx = -nx;
   ny = -ny;
  }
  if (ny <= 0 || falling.isStatic || falling.velocity.y < CRUSH_MIN_STEP_VY) return;

  const key = `${buildObject.id}:${other.id}`;
  const now = this.scene.time.now;
  if ((this.crushCooldowns.get(key) ?? 0) > now) return;

  const damage = crushDamage(buildObject.def.massKg, falling.velocity.y * PX_PER_SECOND);
  if (damage <= 0) return;
  this.crushCooldowns.set(key, now + CRUSH_COOLDOWN_MS);

  zombie.damage(damage, 'crush');
  this.effects.dust(falling.position.x, falling.position.y, CRUSH_DUST);
  this.effects.shake(CRUSH_SHAKE, CRUSH_SHAKE_MS);
  if (buildObject.def.massKg >= HEAVY_MASS_KG) sfx.anvilImpact();
  else sfx.crush();
 }
}

function densityFor(def: ItemDefinition): number {
 const area = def.width * def.height;
 return area > 0 ? def.massKg / area : 0.001;
}

/** World position of a body-local anchor, turned by however far the body moved since it was saved. */
function anchorWorld(
 body: MatterJS.BodyType,
 lx: number,
 ly: number,
 refAngle: number,
 out: { x: number; y: number },
): void {
 const delta = body.angle - refAngle;
 if (delta === 0) {
  out.x = body.position.x + lx;
  out.y = body.position.y + ly;
  return;
 }
 const cos = Math.cos(delta);
 const sin = Math.sin(delta);
 out.x = body.position.x + lx * cos - ly * sin;
 out.y = body.position.y + lx * sin + ly * cos;
}

/** Rotates a vector, for the rare paths that can afford a fresh object. */
function turn(x: number, y: number, delta: number): { x: number; y: number } {
 const cos = Math.cos(delta);
 const sin = Math.sin(delta);
 return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Turns a saved anchor offset in place, so it keeps pointing at the same spot on the piece. */
function turnAnchor(anchor: ChainAnchor, delta: number): void {
 const turned = turn(anchor.x, anchor.y, delta);
 anchor.x = turned.x;
 anchor.y = turned.y;
}

import Phaser from 'phaser';

const MAX_PARTICLES = 240;
const MAX_TEXTS = 8;
const PARTICLE_DEPTH = 12;
const FLASH_DEPTH = 14;
const TEXT_DEPTH = 60;
const SPARK_SPREAD_DEG = 30;
const FLASH_MS = 70;
const TRACER_MS = 90;
const TEXT_MS = 700;
/** The blast flash is the same additive blob, held longer and scaled to read as the 200px radius. */
const BLAST_FLASH_MS = 220;
const BLAST_FLASH_SCALE = 9;
const BLAST_SPARKS = 26;
const BLAST_DUST = 10;
const BLAST_DEBRIS = 14;

/**
 * Per-scene combat feedback. One emitter per particle effect is created up front and
 * reused for every burst, so the emitter count is fixed at four (under the six cap)
 * and gameplay never allocates an emitter. Bursts are dropped instead of growing past
 * the particle cap, which keeps a bullet storm from eating the frame budget.
 */
export class Effects {
 private readonly scene: Phaser.Scene;
 private readonly sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
 private readonly splinterEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
 private readonly dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
 private readonly debrisEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
 private readonly texts: Phaser.GameObjects.Text[] = [];

 constructor(scene: Phaser.Scene) {
  this.scene = scene;

  this.sparkEmitter = scene.add
   .particles(0, 0, 'spark', {
    speed: { min: 90, max: 320 },
    angle: { min: -SPARK_SPREAD_DEG, max: SPARK_SPREAD_DEG },
    lifespan: { min: 120, max: 300 },
    scale: { start: 1, end: 0.2 },
    alpha: { start: 1, end: 0 },
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
    maxAliveParticles: 160,
   })
   .setDepth(PARTICLE_DEPTH);

  this.splinterEmitter = scene.add
   .particles(0, 0, 'splinter', {
    speed: { min: 70, max: 220 },
    angle: { min: -180, max: 180 },
    lifespan: { min: 260, max: 560 },
    gravityY: 900,
    rotate: { min: 0, max: 360 },
    alpha: { start: 1, end: 0.7 },
    emitting: false,
    maxAliveParticles: 120,
   })
   .setDepth(PARTICLE_DEPTH);

  this.dustEmitter = scene.add
   .particles(0, 0, 'dust', {
    speed: { min: 20, max: 60 },
    angle: { min: -150, max: -30 },
    lifespan: { min: 400, max: 900 },
    scale: { start: 0.6, end: 1.7 },
    alpha: { start: 0.45, end: 0 },
    gravityY: -50,
    emitting: false,
    maxAliveParticles: 120,
   })
   .setDepth(PARTICLE_DEPTH);

  this.debrisEmitter = scene.add
   .particles(0, 0, 'debris', {
    speed: { min: 80, max: 240 },
    angle: { min: -180, max: 180 },
    lifespan: { min: 300, max: 700 },
    gravityY: 1000,
    rotate: { min: 0, max: 360 },
    alpha: { start: 1, end: 0.8 },
    emitting: false,
    maxAliveParticles: 120,
   })
   .setDepth(PARTICLE_DEPTH);
 }

 sparks(x: number, y: number, dirX: number, dirY: number, count = 6): void {
  if (!this.room(count)) return;
  const deg = Phaser.Math.RadToDeg(Math.atan2(dirY, dirX));
  this.sparkEmitter.particleAngle = { min: deg - SPARK_SPREAD_DEG, max: deg + SPARK_SPREAD_DEG };
  this.sparkEmitter.explode(count, x, y);
 }

 splinters(x: number, y: number, count = 6): void {
  if (!this.room(count)) return;
  this.splinterEmitter.explode(count, x, y);
 }

 dust(x: number, y: number, count = 8): void {
  if (!this.room(count)) return;
  this.dustEmitter.explode(count, x, y);
 }

 debris(x: number, y: number, color: number, count = 6): void {
  if (!this.room(count)) return;
  this.debrisEmitter.particleTint = color;
  this.debrisEmitter.explode(count, x, y);
 }

 /** Propane blast: expanding flash plus a full-circle burst of sparks, dust and debris. */
 blast(x: number, y: number, debrisColor: number): void {
  if (!this.live()) return;

  const flash = this.scene.add
   .image(x, y, 'flash')
   .setBlendMode(Phaser.BlendModes.ADD)
   .setScale(1)
   .setDepth(FLASH_DEPTH);

  this.scene.tweens.add({
   targets: flash,
   scale: BLAST_FLASH_SCALE,
   alpha: 0,
   duration: BLAST_FLASH_MS,
   onComplete: () => flash.destroy(),
  });

  // The spark emitter keeps the angle of its last burst, and sparks() sets a narrow cone on every
  // call, so the blast widens it to a full circle first. One room() check covers the whole burst.
  const count = BLAST_SPARKS + BLAST_DUST + BLAST_DEBRIS;
  if (!this.room(count)) return;
  this.sparkEmitter.particleAngle = { min: -180, max: 180 };
  this.sparkEmitter.explode(BLAST_SPARKS, x, y);
  this.dustEmitter.explode(BLAST_DUST, x, y);
  this.debrisEmitter.particleTint = debrisColor;
  this.debrisEmitter.explode(BLAST_DEBRIS, x, y);
 }

 muzzleFlash(x: number, y: number, angle: number, color: number): void {
  if (!this.live()) return;

  const flash = this.scene.add
   .image(x, y, 'flash')
   .setRotation(angle)
   .setTint(color)
   .setBlendMode(Phaser.BlendModes.ADD)
   .setScale(0.7)
   .setDepth(FLASH_DEPTH);

  this.scene.tweens.add({
   targets: flash,
   scale: 1.5,
   alpha: 0,
   duration: FLASH_MS,
   onComplete: () => flash.destroy(),
  });
 }

 tracer(x0: number, y0: number, x1: number, y1: number, color: number): void {
  if (!this.live()) return;

  const line = this.scene.add.graphics().setDepth(FLASH_DEPTH).setBlendMode(Phaser.BlendModes.ADD);
  line.lineStyle(2, color, 0.9);
  line.lineBetween(x0, y0, x1, y1);

  this.scene.tweens.add({
   targets: line,
   alpha: 0,
   duration: TRACER_MS,
   onComplete: () => line.destroy(),
  });
 }

 floatText(x: number, y: number, text: string, color: string): void {
  if (!this.live() || this.texts.length >= MAX_TEXTS) return;

  const label = this.scene.add
   .text(x, y, text, { fontFamily: 'monospace', fontSize: '14px', color })
   .setOrigin(0.5)
   .setDepth(TEXT_DEPTH);
  this.texts.push(label);

  this.scene.tweens.add({
   targets: label,
   y: y - 26,
   alpha: 0,
   duration: TEXT_MS,
   onComplete: () => {
    const index = this.texts.indexOf(label);
    if (index !== -1) this.texts.splice(index, 1);
    label.destroy();
   },
  });
 }

 shake(intensity: number, durationMs = 120): void {
  if (!this.live() || intensity <= 0) return;

  const camera = this.scene.cameras.main;
  const effect = camera.shakeEffect;
  const amount = intensity * 0.001;
  if (effect.isRunning && effect.intensity.length() > amount) return;
  camera.shake(durationMs, amount, true);
 }

 /**
  * Emitters and tweens die with the scene, so calls that arrive after shutdown must be
  * dropped rather than reaching into a destroyed display list.
  */
 private live(): boolean {
  const status = this.scene.sys.settings.status;
  return status !== Phaser.Scenes.SHUTDOWN && status !== Phaser.Scenes.DESTROYED;
 }

 private room(count: number): boolean {
  if (!this.live()) return false;
  const alive =
   this.sparkEmitter.getAliveParticleCount() +
   this.splinterEmitter.getAliveParticleCount() +
   this.dustEmitter.getAliveParticleCount() +
   this.debrisEmitter.getAliveParticleCount();
  return alive + count <= MAX_PARTICLES;
 }
}

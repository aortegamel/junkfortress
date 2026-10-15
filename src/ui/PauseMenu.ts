import Phaser from 'phaser';
import { runStore } from '../state/runStore';

export function showPauseMenu(scene: Phaser.Scene): void {
 scene.scene.pause();
 scene.scene.launch('PauseOverlayScene');
}

export class PauseOverlayScene extends Phaser.Scene {
 constructor() {
  super('PauseOverlayScene');
 }

 create(): void {
  const { width, height } = this.scale;

  this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.65).setDepth(50);
  this.add.rectangle(width / 2, height / 2, 460, 400, 0x161616, 1).setStrokeStyle(2, 0x444444).setDepth(51);

  this.add
   .text(width / 2, 190, 'PAUSED', {
    fontFamily: 'monospace',
    fontSize: '34px',
    color: '#e8e0d0',
   })
   .setOrigin(0.5)
   .setDepth(52);

  this.addMenuButton(width / 2, 280, '[ RESUME ]', () => this.resumeGame());
  this.addMenuButton(width / 2, 350, '[ RESTART RUN ]', () => this.restartRun());
  this.add
   .text(width / 2, 394, 'Back to build with the starting junk.\nEmpty build area. Full HP. Same seed.', {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#9a948a',
    align: 'center',
    lineSpacing: 4,
   })
   .setOrigin(0.5)
   .setDepth(52);
  this.addMenuButton(width / 2, 460, '[ MAIN MENU ]', () => this.mainMenu());

  this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
 }

 private addMenuButton(x: number, y: number, label: string, onClick: () => void): void {
  this.add
   .text(x, y, label, {
    fontFamily: 'monospace',
    fontSize: '22px',
    color: '#7fd07f',
   })
   .setOrigin(0.5)
   .setDepth(52)
   .setPadding(24, 14)
   .setInteractive({ useHandCursor: true })
   .on('pointerdown', onClick);
 }

 /** Read from the live scene list so the key never survives between pause menu opens. */
 private pausedScene(): Phaser.Scene | null {
  for (const scene of this.scene.manager.scenes) {
   if (scene.sys.isPaused()) return scene;
  }
  return null;
 }

 private resumeGame(): void {
  const paused = this.pausedScene();
  this.scene.stop();
  paused?.scene.resume();
 }

 /**
  * A fresh run on the same seed, so the starting kit matches. Never scene.restart(): that re-runs the
  * paused scene, and from a wave it replays the fight against the damaged fort.
  */
 private restartRun(): void {
  this.pausedScene()?.scene.stop();
  runStore.reset(runStore.get().seed);
  this.scene.start('BuildScene');
 }

 private mainMenu(): void {
  this.pausedScene()?.scene.stop();
  runStore.reset();
  this.scene.start('TitleScene');
 }
}

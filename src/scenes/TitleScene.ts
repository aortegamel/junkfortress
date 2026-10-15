import Phaser from 'phaser';
import { runStore } from '../state/runStore';
import { sfx } from '../systems/Audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/Constants';
import { markHowToSeen, showHowTo } from '../ui/HowToPlay';
const MONO = 'monospace';

export class TitleScene extends Phaser.Scene {
  private howToUi: Phaser.GameObjects.GameObject[] | null = null;

  constructor() {
    super('TitleScene');
  }
  create(): void {
    const cx = GAME_WIDTH / 2;

    this.add.image(cx, GAME_HEIGHT / 2, 'bg').setDepth(-10).setTint(0x6a6a6a);

    this.add
      .text(cx, 160, 'JUNK FORTRESS', {
        fontFamily: MONO,
        fontSize: '64px',
        color: '#e8e0d0',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 244, 'THEY BRING THE AMMO.\nYOU BUILD THE MACHINE.', {
        fontFamily: MONO,
        fontSize: '18px',
        color: '#9a948a',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 304, 'GATHER JUNK  >  BUILD (gravity off)  >  START WAVE  >  SURVIVE', {
        fontFamily: MONO,
        fontSize: '15px',
        color: '#c8c2b8',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 368, '[ START ]', {
        fontFamily: MONO,
        fontSize: '32px',
        color: '#7fd07f',
      })
      .setOrigin(0.5)
      .setPadding(30, 12)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startRun());

    this.add
      .text(cx, 424, '[ HOW TO PLAY ]', {
        fontFamily: MONO,
        fontSize: '20px',
        color: '#c8c2b8',
      })
      .setOrigin(0.5)
      .setPadding(20, 10)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openHowTo());

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.howToUi) this.closeHowTo();
      else this.startRun();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.howToUi) this.closeHowTo();
    });

    this.controlsColumn(cx - 320, 'BUILD', [
      ['Mouse', 'place / move'],
      ['Q / E', 'rotate'],
      ['RMB', 'return / cancel'],
      ['Esc', 'menu / restart'],
    ]);
    this.controlsColumn(cx + 60, 'WAVE', [
      ['A / D', 'move'],
      ['Space / W', 'jump, once per landing'],
      ['Mouse', 'aim'],
      ['LMB', 'fire'],
      ['Esc', 'menu / restart'],
    ]);

    this.add
      .text(GAME_WIDTH - 12, GAME_HEIGHT - 12, 'ONE ARENA. ONE WAVE.', {
        fontFamily: MONO,
        fontSize: '12px',
        color: '#55524c',
      })
      .setOrigin(1);
  }

  private controlsColumn(x: number, heading: string, rows: [string, string][]): void {
    this.add.text(x, 476, heading, { fontFamily: MONO, fontSize: '14px', color: '#6f6a61' });
    this.add.text(x, 502, rows.map(([key, action]) => `${key.padEnd(9)}${action}`).join('\n'), {
      fontFamily: MONO,
      fontSize: '14px',
      color: '#807a70',
      lineSpacing: 6,
    });
  }

  private openHowTo(): void {
    if (this.howToUi) return;
    sfx.unlock();
    this.howToUi = showHowTo(this, () => this.closeHowTo());
  }

  private closeHowTo(): void {
    markHowToSeen();
    for (const obj of this.howToUi ?? []) obj.destroy();
    this.howToUi = null;
  }

  private startRun(): void {
    sfx.unlock();
    runStore.reset();
    runStore.setPhase('build');
    this.scene.start('BuildScene');
  }
}

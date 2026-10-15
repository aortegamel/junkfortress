import Phaser from 'phaser';
import { CORE_MAX_HP, PLAYER_MAX_HP } from '../data/gameData';
import { ITEM_DEFINITIONS } from '../data/items';
import { runStore } from '../state/runStore';
import { CHAIN_MAX_HP, GAME_HEIGHT, GAME_WIDTH } from '../utils/Constants';

const MONO = 'monospace';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create(data: { outcome: 'victory' | 'defeat' } = { outcome: 'defeat' }): void {
    const outcome = data.outcome === 'victory' ? 'victory' : 'defeat';
    const state = runStore.get();
    const cx = GAME_WIDTH / 2;

    runStore.setOutcome(outcome);
    runStore.setPhase('result');

    this.add.image(cx, GAME_HEIGHT / 2, 'bg').setDepth(-10).setTint(0x505050);

    this.add
      .text(cx, 140, outcome === 'victory' ? 'FORTRESS HELD' : 'FORTRESS FAILED', {
        fontFamily: MONO,
        fontSize: '56px',
        color: outcome === 'victory' ? '#b0d090' : '#c07070',
      })
      .setOrigin(0.5);

    const rows: [string, number | string][] = [
      ['RICOCHET KILLS', state.stats.ricochetKills],
      ['CRUSH KILLS', state.stats.crushKills],
      ['EXPLOSION KILLS', state.stats.explosionKills],
      ['PLAYER KILLS', state.stats.playerKills],
    ];
    if (outcome === 'victory') rows.push(['CORE HP', `${state.coreHp} / ${CORE_MAX_HP}`]);

    this.add
      .text(cx, 300, rows.map(([label, value]) => `${label.padEnd(18)}${value}`).join('\n'), {
        fontFamily: MONO,
        fontSize: '18px',
        color: '#c8c2b8',
        lineSpacing: 10,
      })
      .setOrigin(0.5);

    this.addButton(cx, 460, outcome === 'victory' ? '[ REBUILD ]' : '[ TRY AGAIN ]', () => this.rebuild());
    this.addButton(cx, 540, '[ NEW JUNK ]', () => this.newJunk());

    this.input.keyboard?.on('keydown-ENTER', () => this.rebuild());
  }

  private addButton(x: number, y: number, label: string, onClick: () => void): void {
    this.add
      .text(x, y, label, {
        fontFamily: MONO,
        fontSize: '26px',
        color: '#7fd07f',
      })
      .setOrigin(0.5)
      .setPadding(24, 12)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
  }

  /** Same build, repaired for a fresh wave attempt: hp and run tallies reset, layout untouched. */
  private rebuild(): void {
    const state = runStore.get();
    for (const obj of state.placedObjects) {
      runStore.updateObjectHp(obj.id, ITEM_DEFINITIONS[obj.type].maxHp);
    }
    // runStore has no heal/restore or stats setters, and get() hands back the live state object
    state.playerHp = PLAYER_MAX_HP;
    state.coreHp = CORE_MAX_HP;
    state.stats.totalKills = 0;
    state.stats.playerKills = 0;
    state.stats.ricochetKills = 0;
    state.stats.crushKills = 0;
    state.stats.explosionKills = 0;
    state.stats.bulletsFiredByZombies = 0;
    state.stats.bulletsRicocheted = 0;
    state.stats.structuresLost = 0;
    runStore.setPhase('build');
    runStore.setWaveEnded(false);
    runStore.setOutcome('none');
    for (const chain of state.chains) runStore.updateChainHp(chain.id, CHAIN_MAX_HP);
    this.scene.start('BuildScene');
  }

  private newJunk(): void {
    // a fresh seed so replays actually differ; the no-arg default seed stays the deterministic first run
    runStore.reset((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.scene.start('BuildScene');
  }
}

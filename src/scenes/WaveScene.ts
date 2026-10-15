import Phaser from 'phaser';
import { createArenaPhysics, drawArena } from '../utils/Arena';
import { GAME_WIDTH, GROUND_Y, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, ZOMBIE_SPAWN_X } from '../utils/Constants';
import { CORE_MAX_HP, PLAYER_MAX_HP, WAVE_SPAWNS, ZOMBIE_CORE_DAMAGE } from '../data/gameData';
import { runStore } from '../state/runStore';
import { randRange } from '../utils/rng';
import { showPauseMenu } from '../ui/PauseMenu';
import { Effects } from '../systems/Effects';
import { sfx } from '../systems/Audio';
import { Player } from '../entities/Player';
import { Zombie } from '../entities/Zombie';
import { BulletManager } from '../entities/Bullets';
import { WaveStructureManager } from '../systems/WaveStructureManager';
import { DebugOverlay } from '../ui/DebugOverlay';
import { setDebugProvider, type DebugProvider } from '../debug/DebugApi';
import { SCENARIOS, type DebugScenario, type ScenarioZombie } from '../debug/scenarios';
import type { KillSource, Outcome } from '../types/game';

/** Zombie bodies are 34x54, so half height rests them exactly on the ground line. */
const ZOMBIE_HALF_HEIGHT = 27;
const MUZZLE_OFFSET = 26;
const MAX_DELTA_MS = 33;

// The HUD sits in the 60px strip above the build zone (y 60..660) so contraptions stay unobstructed.
const HUD_X = 16;
const HUD_BAR_WIDTH = 132;
const HUD_BAR_HEIGHT = 7;
const HUD_ALPHA = 0.85;
const HUD_DEPTH = 100;
const HUD_FONT = { fontFamily: 'monospace', fontSize: '13px', color: '#c9c4b8' };

function emptyHud() {
  return { playerHp: -1, coreHp: -1, zombies: -1, ricochetKills: -1, ricochets: -1 };
}

export class WaveScene extends Phaser.Scene implements DebugProvider {
  readonly sceneKey = 'WaveScene';

  private fx!: Effects;
  private player: Player | null = null;
  private bulletManager: BulletManager | null = null;
  private structureManager: WaveStructureManager | null = null;
  private readonly live: Zombie[] = [];
  private readonly zombieIds = new Map<Zombie, number>();
  private nextZombieId = 0;
  private pendingSpawns = 0;
  private waveEnded = false;
  private scenarioName: string | null = null;
  private debugOverlay: DebugOverlay | null = null;
  private overlayVisible = false;

  private hudPlayerBar!: Phaser.GameObjects.Rectangle;
  private hudCoreBar!: Phaser.GameObjects.Rectangle;
  private hudZombiesText!: Phaser.GameObjects.Text;
  private hudRicochetText!: Phaser.GameObjects.Text;
  private hudRicochetedText!: Phaser.GameObjects.Text;
  private hud = emptyHud();

  constructor() {
    super('WaveScene');
  }

  create(): void {
    // Scene instances survive restarts, so every run-scoped field is cleared here.
    this.live.length = 0;
    this.zombieIds.clear();
    this.pendingSpawns = 0;
    this.waveEnded = false;
    this.nextZombieId = 0;
    this.hud = emptyHud();
    this.debugOverlay = null;
    this.overlayVisible = false;

    // Phaser keeps the last payload between starts, so only a string scenario name is honoured.
    const data: unknown = this.scene.settings.data;
    const scenarioName = data !== null && typeof data === 'object' && 'scenario' in data && typeof data.scenario === 'string' ? data.scenario : undefined;
    const scenario: DebugScenario | undefined = scenarioName === undefined ? undefined : SCENARIOS[scenarioName];
    this.scenarioName = scenarioName === undefined || scenario === undefined ? null : scenarioName;

    drawArena(this);
    createArenaPhysics(this);

    this.fx = new Effects(this);
    this.structureManager = new WaveStructureManager(this, { effects: this.fx, zombies: () => this.live });
    this.structureManager.spawn();

    this.bulletManager = new BulletManager(this, {
      structures: this.structureManager,
      effects: this.fx,
      spreadScale: scenario ? 0 : 1,
      handlers: {
        // BulletManager owns bullet damage and its hit sound; these handlers only react in the view.
        onPlayerHit: (amount, x, y) => this.handlePlayerHit(amount, x, y),
        onCoreHit: (_amount, x, y) => this.handleCoreHit(x, y),
        zombies: () => this.live,
        playerBody: () => this.player?.sprite ?? null,
      },
    });

    const player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, (angle) => {
      this.bulletManager?.firePlayer(
        player.sprite.x + Math.cos(angle) * MUZZLE_OFFSET,
        player.sprite.y + Math.sin(angle) * MUZZLE_OFFSET,
        angle,
      );
    });
    this.player = player;

    this.createHud();
    this.createMenuButton();
    const intro = this.add
      .text(
        GAME_WIDTH / 2,
        84,
        'Zombies incoming from the right — protect the CORE.\nA / D move · Space jumps · mouse aims · click fires.',
        { fontFamily: 'monospace', fontSize: '14px', color: '#b8b2b6', align: 'center' },
      )
      .setOrigin(0.5, 0)
      .setDepth(HUD_DEPTH + 1);
    this.tweens.add({ targets: intro, alpha: 0, delay: 7000, duration: 1200, onComplete: () => intro.destroy() });
    this.input.once('pointerdown', () => sfx.unlock());
    this.input.keyboard?.once('keydown', () => sfx.unlock());

    setDebugProvider(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      setDebugProvider(null);
      this.structureManager?.dispose();
      this.structureManager = null;
    });
    if (location.search.includes('debug')) this.setOverlayVisible(true);
    this.input.keyboard?.on('keydown-BACKTICK', () => this.setOverlayVisible(!this.overlayVisible));

    this.scheduleWave(scenario);
  }

  update(time: number, delta: number): void {
    if (this.waveEnded) return;
    const dt = Math.min(delta, MAX_DELTA_MS);

    this.player?.update(dt);
    this.structureManager?.update();
    this.bulletManager?.update(time, dt);
    for (const zombie of this.live) {
      if (zombie.alive) zombie.update(time, dt);
    }
    // A death or core attack inside the loop above may already have ended the wave.
    if (this.waveEnded) return;

    this.refreshHud();

    const state = runStore.get();
    if (state.playerHp <= 0 || state.coreHp <= 0) {
      this.endWave('defeat');
      return;
    }
    this.checkWaveEnd();
    if (this.overlayVisible) this.debugOverlay?.update(this.state());
  }

  private scheduleWave(scenario: DebugScenario | undefined): void {
    if (scenario) {
      this.scheduleScenario(scenario);
      return;
    }
    for (const batch of WAVE_SPAWNS) {
      for (let i = 0; i < batch.count; i++) {
        // Wrap the lane into a 140px band (never past the edge) and stagger arrivals.
        const x = ZOMBIE_SPAWN_X + ((i * 70) % 140) + randRange(-8, 8);
        this.scheduleZombie(batch.at + i * randRange(90, 170), x, GROUND_Y - ZOMBIE_HALF_HEIGHT);
      }
    }
  }

  private scheduleScenario(scenario: DebugScenario): void {
    for (const zombie of scenario.zombies) {
      this.scheduleZombie(zombie.at, zombie.x, zombie.y, zombie);
    }
    for (const trigger of scenario.triggers ?? []) {
      this.time.delayedCall(trigger.at, () => {
        if (trigger.action === 'destroy') this.structureManager?.destroyObject(trigger.id);
        else this.structureManager?.destroyChain(trigger.id);
      });
    }
  }

  /** Pending is counted at schedule time, never at spawn time, so the wave can't end on unspawned zombies. */
  private scheduleZombie(at: number, x: number, y: number, opts?: ScenarioZombie): void {
    this.pendingSpawns++;
    this.time.delayedCall(at, () => this.spawnZombie(x, y, opts));
  }

  private spawnZombie(x: number, y: number, opts?: ScenarioZombie): void {
    this.pendingSpawns--;
    const zombie = new Zombie(this, x, y, {
      effects: this.fx,
      onDeath: (dead, source) => this.handleZombieDeath(dead, source),
      onCoreAttack: () => this.handleCoreAttack(),
      onFire: (bx, by, angle) => this.bulletManager?.fireZombie(bx, by, angle),
      aimAt: opts?.aimAt,
      stationary: opts?.stationary,
    });
    this.live.push(zombie);
    this.zombieIds.set(zombie, ++this.nextZombieId);
  }

  private handleZombieDeath(zombie: Zombie, source: KillSource): void {
    const index = this.live.indexOf(zombie);
    if (index >= 0) this.live.splice(index, 1);
    this.zombieIds.delete(zombie);

    const { x, y } = zombie.sprite;
    zombie.destroy();
    runStore.addKill(source);

    if (source === 'ricochet') this.fx.floatText(x, y - 34, 'RICOCHET', '#7cff9c');
    else if (source === 'crush') this.fx.floatText(x, y - 34, 'CRUSH', '#ffd070');
    else if (source === 'explosion') this.fx.floatText(x, y - 34, 'BOOM', '#ff9a4d');

    this.checkWaveEnd();
  }

  private handleCoreAttack(): void {
    runStore.damageCore(ZOMBIE_CORE_DAMAGE);
    sfx.coreHit();
    this.fx.shake(4);
    if (runStore.get().coreHp <= 0) this.endWave('defeat');
  }

  private handlePlayerHit(amount: number, x: number, y: number): void {
    // BulletManager already subtracted the HP; this is the view reaction only.
    this.player?.flashHit();
    this.fx.floatText(x, y - 18, `-${Math.round(amount)}`, '#ff6b6b');
  }

  private handleCoreHit(x: number, y: number): void {
    this.fx.shake(4);
    this.fx.floatText(x, y - 20, 'CORE HIT', '#ffb060');
  }

  private checkWaveEnd(): void {
    if (this.waveEnded) return;
    // A rig with no zombies of its own must not end the wave before the harness drives it.
    if (this.scenarioName !== null && SCENARIOS[this.scenarioName]?.keepAlive) return;
    if (this.live.length === 0 && this.pendingSpawns === 0) this.endWave('victory');
  }

  private endWave(outcome: Outcome): void {
    if (this.waveEnded) return;
    this.waveEnded = true;
    runStore.setWaveEnded(true);
    runStore.setOutcome(outcome);
    runStore.setPhase('result');
    this.time.removeAllEvents();
    this.scene.start('ResultScene', { outcome });
  }

  private createHud(): void {
    this.hudLabel(HUD_X, 8, 'PLAYER', 0);
    this.hudPlayerBar = this.hudBar(26, 0x7fd07f);
    this.hudLabel(HUD_X, 36, 'CORE', 0);
    this.hudCoreBar = this.hudBar(54, 0xb06a30);
    this.hudZombiesText = this.hudLabel(GAME_WIDTH / 2, 8, 'ZOMBIES 0', 0.5);
    this.hudRicochetText = this.hudLabel(GAME_WIDTH / 2, 26, 'RICOCHET KILLS 0', 0.5);
    this.hudRicochetedText = this.hudLabel(GAME_WIDTH / 2, 42, 'RICOCHETED 0', 0.5);
  }

  private hudBar(y: number, color: number): Phaser.GameObjects.Rectangle {
    this.add.rectangle(HUD_X, y, HUD_BAR_WIDTH, HUD_BAR_HEIGHT, 0x222222, 0.5).setOrigin(0, 0.5).setDepth(HUD_DEPTH - 1);
    return this.add.rectangle(HUD_X, y, HUD_BAR_WIDTH, HUD_BAR_HEIGHT, color, 0.9).setOrigin(0, 0.5).setDepth(HUD_DEPTH);
  }

  private hudLabel(x: number, y: number, text: string, originX: number, originY = 0): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, HUD_FONT).setOrigin(originX, originY).setAlpha(HUD_ALPHA).setDepth(HUD_DEPTH + 1);
  }

  private refreshHud(): void {
    const { playerHp, coreHp, stats } = runStore.get();
    const hud = this.hud;

    if (playerHp !== hud.playerHp) {
      hud.playerHp = playerHp;
      this.hudPlayerBar.displayWidth = Math.max(0, HUD_BAR_WIDTH * (playerHp / PLAYER_MAX_HP));
    }
    if (coreHp !== hud.coreHp) {
      hud.coreHp = coreHp;
      this.hudCoreBar.displayWidth = Math.max(0, HUD_BAR_WIDTH * (coreHp / CORE_MAX_HP));
    }
    const alive = this.live.length;
    if (alive !== hud.zombies) {
      hud.zombies = alive;
      this.hudZombiesText.setText(`ZOMBIES ${alive}`);
    }
    if (stats.ricochetKills !== hud.ricochetKills) {
      hud.ricochetKills = stats.ricochetKills;
      this.hudRicochetText.setText(`RICOCHET KILLS ${stats.ricochetKills}`);
    }
    if (stats.bulletsRicocheted !== hud.ricochets) {
      hud.ricochets = stats.bulletsRicocheted;
      this.hudRicochetedText.setText(`RICOCHETED ${stats.bulletsRicocheted}`);
    }
  }

  private createMenuButton(): void {
    const x = GAME_WIDTH - 58;
    this.add
      .rectangle(x, 24, 88, 28, 0x1c1c1c, 0.9)
      .setStrokeStyle(1, 0x3a3a3a)
      .setDepth(HUD_DEPTH)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => showPauseMenu(this));
    this.hudLabel(x, 24, '[ MENU ]', 0.5, 0.5);
    this.input.keyboard?.on('keydown-ESC', () => showPauseMenu(this));
  }

  private setOverlayVisible(visible: boolean): void {
    this.overlayVisible = visible;
    if (visible && !this.debugOverlay) this.debugOverlay = new DebugOverlay(this);
    this.debugOverlay?.setVisible(visible);
  }

  state(): Record<string, unknown> {
    const { stats, outcome, seed } = runStore.get();
    return {
      scene: 'wave',
      phase: 'wave',
      mode: this.scenarioName ? `scenario:${this.scenarioName}` : 'wave',
      zombiesAlive: this.live.length,
      zombiesPending: this.pendingSpawns,
      ricochets: stats.bulletsRicocheted,
      dynamicStructures: this.structureManager?.dynamicCount() ?? 0,
      activeChains: this.structureManager?.chainCount() ?? 0,
      waveEnded: this.waveEnded,
      outcome,
      seed,
      fps: Math.round(this.game.loop.actualFps),
      frameMs: Math.round(this.game.loop.delta),
      activeBullets: this.bulletManager?.activeCount() ?? 0,
      pooledBullets: this.bulletManager?.pooledCount() ?? 0,
      playerX: this.player ? Math.round(this.player.sprite.x) : -1,
      playerY: this.player ? Math.round(this.player.sprite.y) : -1,
    };
  }

  zombies(): unknown[] {
    return this.live.map((zombie) => ({
      id: this.zombieIds.get(zombie) ?? -1,
      x: Math.round(zombie.sprite.x),
      y: Math.round(zombie.sprite.y),
      hp: zombie.hp,
      maxHp: zombie.maxHp,
    }));
  }

  structures(): unknown[] {
    const out: unknown[] = [];
    this.structureManager?.forEachObject((info) => out.push({ ...info, x: Math.round(info.x), y: Math.round(info.y) }));
    return out;
  }

  bullets(): unknown[] {
    return [...(this.bulletManager?.snapshot() ?? [])];
  }
}

import type Phaser from 'phaser';
import { runStore } from '../state/runStore';
import { SCENARIOS, applyScenario } from './scenarios';

export interface DebugProvider {
 readonly sceneKey: string;
 state(): Record<string, unknown>;
 bullets?(): unknown[];
 structures?(): unknown[];
 zombies?(): unknown[];
}

let game: Phaser.Game | null = null;
let activeProvider: DebugProvider | null = null;

/** The running scene publishes its live counters here; it clears the provider on shutdown. */
export function setDebugProvider(provider: DebugProvider | null): void {
 activeProvider = provider;
}

function activeSceneKey(): string {
 const active = game?.scene.getScenes(true) ?? [];
 return active.length > 0 ? active[active.length - 1].scene.key : 'none';
}

/**
 * Rig scene swap. Uses a scene plugin (queued ops) rather than the SceneManager's immediate
 * start/stop, so a rig can be loaded from inside another scene's create() without shutting that
 * scene down mid-create.
 */
function switchToScene(key: string, data?: object): void {
 if (!game) return;
 const scenes = game.scene.getScenes(false);
 const driver = scenes[scenes.length - 1];
 if (!driver) {
  // Nothing booted yet: the manager can still queue the scene for its first boot pass.
  game.scene.start(key, data);
  return;
 }
 for (const scene of game.scene.getScenes(true)) scene.scene.stop();
 driver.scene.start(key, data);
}

/** Live handler counts for the active scene: a restart loop must not multiply these. */
function sceneDiagnostics(): Record<string, unknown> {
 const active = game?.scene.getScenes(true) ?? [];
 const scene = active[0];
 if (!scene) return { activeScenes: 0 };
 const input = scene.input;
 const keyboard = input.keyboard;
 const world = scene.matter.world;
 return {
  activeScenes: active.length,
  pointerHandlers: input.listenerCount('pointerdown'),
  keyHandlers: keyboard
   ? keyboard.listenerCount('keydown-Q') + keyboard.listenerCount('keydown-E') + keyboard.listenerCount('keydown-ESC')
   : 0,
  collisionHandlers: world.listenerCount('collisionstart'),
 };
}

export function getState(): Record<string, unknown> {
 const state = runStore.get();
 const provider = activeProvider;
 const bullets = provider?.bullets?.() ?? [];
 const structures = provider?.structures?.() ?? [];
 let dynamicStructures = 0;
 for (const structure of structures) {
  if (structure && typeof structure === 'object' && 'dynamic' in structure && structure.dynamic === true) {
   dynamicStructures += 1;
  }
 }

 const snapshot: Record<string, unknown> = {
  scene: activeSceneKey(),
  phase: state.phase,
  seed: state.seed,
  playerHp: state.playerHp,
  coreHp: state.coreHp,
  zombiesAlive: provider?.zombies?.()?.length ?? 0,
  zombiesPending: 0,
  activeBullets: bullets.length,
  pooledBullets: 0,
  ricochets: state.stats.bulletsRicocheted,
  ricochetKills: state.stats.ricochetKills,
  crushKills: state.stats.crushKills,
  explosionKills: state.stats.explosionKills,
  playerKills: state.stats.playerKills,
  dynamicStructures,
  activeChains: state.chains.length,
  waveEnded: state.waveEnded,
  outcome: state.outcome,
  fps: game ? Math.round(game.loop.actualFps) : 0,
  frameMs: game ? Math.round(game.loop.delta * 10) / 10 : 0,
 };
 // Provider keys win: the live scene owns its spawn/bullet counters.
 if (provider) Object.assign(snapshot, provider.state());
 Object.assign(snapshot, sceneDiagnostics());
 return snapshot;
}

/** Loads a rig and jumps straight into its wave. Unknown names are a no-op. */
export function loadScenario(name: string): boolean {
 const scenario = SCENARIOS[name];
 if (!scenario) return false;
 applyScenario(scenario);
 switchToScene('WaveScene', { scenario: name });
 return true;
}

export function resetToBuild(): void {
 runStore.reset();
 switchToScene('BuildScene');
}

export function installDebugApi(nextGame: Phaser.Game): void {
 game = nextGame;
 // The harness global; hand-typed because nothing else declares it (main.ts gates exposure).
 const api = window as Window & { __JUNKFORTRESS_DEBUG__?: unknown };
 api.__JUNKFORTRESS_DEBUG__ = {
  version: 1,
  getState,
  getBullets: () => activeProvider?.bullets?.() ?? [],
  getStructures: () => activeProvider?.structures?.() ?? [],
  getZombies: () => activeProvider?.zombies?.() ?? [],
  loadScenario,
  reset: resetToBuild,
 };
}

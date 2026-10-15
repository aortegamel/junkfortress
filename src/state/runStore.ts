import type {
  ChainAnchor,
  InventoryItem,
  ItemType,
  JunkLocationId,
  KillSource,
  Outcome,
  Phase,
  RunState,
  SavedBuildObject,
  SavedChain,
  SavedNail,
} from '../types/game';
import { JUNK_LOCATIONS, createInitialRunState, createInventoryItem } from '../data/gameData';
import { DEFAULT_SEED } from '../utils/rng';
import { GROUND_ANCHOR_ID } from '../utils/Constants';

let runState: RunState = createInitialRunState(DEFAULT_SEED);

/** A nail survives only while both of its objects survive. Ground anchors have no object. */
function anchorAlive(anchor: ChainAnchor): boolean {
  return anchor.objectId === GROUND_ANCHOR_ID
    || runState.placedObjects.some((obj) => obj.id === anchor.objectId);
}

function dropDanglingNails(): void {
  runState.nails = runState.nails.filter((nail) => anchorAlive(nail.anchorA) && anchorAlive(nail.anchorB));
}

export const runStore = {
  get(): RunState {
    return runState;
  },

  reset(seed: number = DEFAULT_SEED): RunState {
    runState = createInitialRunState(seed);
    return runState;
  },

  addInventoryItem(type: ItemType): InventoryItem {
    const item = createInventoryItem(type);
    runState.inventory.push(item);
    return item;
  },

  /** Grants a location's package once per run, build phase only. Returns false and changes nothing otherwise. */
  gatherJunk(id: JunkLocationId): boolean {
    const location = JUNK_LOCATIONS.find((loc) => loc.id === id);
    if (!location || runState.phase !== 'build' || runState.gatheredLocations.includes(id)) return false;
    for (const { type, count } of location.items) {
      for (let i = 0; i < count; i++) runState.inventory.push(createInventoryItem(type));
    }
    runState.gatheredLocations.push(id);
    return true;
  },

  removeInventoryItem(id: string): void {
    runState.inventory = runState.inventory.filter((item) => item.id !== id);
  },

  setPlacedObjects(objects: SavedBuildObject[]): void {
    runState.placedObjects = objects;
    dropDanglingNails();
  },

  updateObjectHp(id: string, hp: number): void {
    const obj = runState.placedObjects.find((p) => p.id === id);
    if (obj) obj.hp = Math.max(0, Math.floor(hp));
  },

  addChain(chain: SavedChain): void {
    runState.chains.push(chain);
  },

  removeChain(id: string): void {
    runState.chains = runState.chains.filter((c) => c.id !== id);
  },

  updateChainHp(id: string, hp: number): void {
    const chain = runState.chains.find((c) => c.id === id);
    if (chain) chain.hp = Math.max(0, Math.floor(hp));
  },

  addNail(nail: SavedNail): void {
    runState.nails.push(nail);
  },

  removeNail(id: string): void {
    runState.nails = runState.nails.filter((n) => n.id !== id);
  },

  damageCore(amount: number): void {
    runState.coreHp = Math.max(0, runState.coreHp - amount);
  },

  damagePlayer(amount: number): void {
    runState.playerHp = Math.max(0, runState.playerHp - amount);
  },

  addKill(kind: KillSource): void {
    runState.stats.totalKills += 1;
    if (kind === 'player') runState.stats.playerKills += 1;
    else if (kind === 'ricochet') runState.stats.ricochetKills += 1;
    else if (kind === 'crush') runState.stats.crushKills += 1;
    else runState.stats.explosionKills += 1;
  },

  recordBulletFired(): void {
    runState.stats.bulletsFiredByZombies += 1;
  },

  recordRicochet(): void {
    runState.stats.bulletsRicocheted += 1;
  },

  recordStructureLost(id: string): void {
    runState.stats.structuresLost += 1;
    runState.placedObjects = runState.placedObjects.filter((p) => p.id !== id);
    dropDanglingNails();
  },

  setPhase(phase: Phase): void {
    runState.phase = phase;
  },

  setOutcome(outcome: Outcome): void {
    runState.outcome = outcome;
  },

  setWaveEnded(v: boolean): void {
    runState.waveEnded = v;
  },
};

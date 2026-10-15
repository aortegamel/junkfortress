import type { InventoryItem, ItemType, RunState } from '../types/game';
import { ITEM_DEFINITIONS } from './items';
import { DEFAULT_SEED, randInt, seedRng } from '../utils/rng';

export const PLAYER_MAX_HP = 300;
export const CORE_MAX_HP = 1200;

export const ZOMBIE_HP = 60;
export const ZOMBIE_SPEED = 55;
export const ZOMBIE_CORE_DAMAGE = 60;
export const ZOMBIE_CORE_ATTACK_MS = 1500;

export type WeaponType = 'survivor_pistol' | 'zombie_pistol';

export interface WeaponStats {
 damage: number;
 fireRate: number;
 bulletSpeed: number;
 spreadDeg: number;
}

export const WEAPONS: Record<WeaponType, WeaponStats> = {
 survivor_pistol: { damage: 25, fireRate: 4, bulletSpeed: 1200, spreadDeg: 2 },
 zombie_pistol: { damage: 8, fireRate: 1.1, bulletSpeed: 700, spreadDeg: 6 },
};

export const ITEM_NAMES: Record<ItemType, string> = {
 plank: ITEM_DEFINITIONS.plank.name,
 metal_sheet: ITEM_DEFINITIONS.metal_sheet.name,
 chain: ITEM_DEFINITIONS.chain.name,
 nail: ITEM_DEFINITIONS.nail.name,
 anvil: ITEM_DEFINITIONS.anvil.name,
 propane: ITEM_DEFINITIONS.propane.name,
};

export interface WaveSpawn {
 /** Milliseconds after wave start. */
 at: number;
 count: number;
}

export const WAVE_SPAWNS: WaveSpawn[] = [
 { at: 0, count: 3 }, // opening trickle: time to find the lane and learn the rhythm
 { at: 3500, count: 3 },
 { at: 8000, count: 4 },
 { at: 14000, count: 5 }, // main storm
 { at: 20000, count: 6 },
 { at: 26000, count: 6 },
 { at: 32000, count: 7 }, // dense final push
];

export const WAVE_TOTAL_ZOMBIES = WAVE_SPAWNS.reduce((sum, spawn) => sum + spawn.count, 0);

let inventoryIdCounter = 0;

/**
 * Fixed count, not drawn from the rng stream, so the seeded rolls stay stable.
 * The largest loadout is 4 planks + 4 sheets + 1 anvil + 1 propane = 10 pieces, so 12 nails
 * still covers every joint.
 */
export const LOADOUT_NAILS = 12;

/** Single id source for inventory items, so build-time placement ids stay unique. */
export function createInventoryItem(type: ItemType): InventoryItem {
 inventoryIdCounter += 1;
 return { id: `item-${inventoryIdCounter}`, type, name: ITEM_NAMES[type] };
}

export function createLoadout(): InventoryItem[] {
 const items: InventoryItem[] = [];
 const planks = randInt(3, 5);
 const sheets = randInt(3, 5);
 for (let i = 0; i < planks; i++) items.push(createInventoryItem('plank'));
 for (let i = 0; i < sheets; i++) items.push(createInventoryItem('metal_sheet'));
 for (let i = 0; i < LOADOUT_NAILS; i++) items.push(createInventoryItem('nail'));
 items.push(createInventoryItem('chain'));
 items.push(createInventoryItem('anvil'));
 items.push(createInventoryItem('propane'));
 return items;
}

export function createInitialRunState(seed: number = DEFAULT_SEED): RunState {
 // The loadout is drawn from the rng stream, so seeding here makes a run reproducible from its seed.
 seedRng(seed);
 return {
  seed,
  phase: 'build',
  outcome: 'none',
  waveEnded: false,
  inventory: createLoadout(),
  placedObjects: [],
  chains: [],
  nails: [],
  playerHp: PLAYER_MAX_HP,
  coreHp: CORE_MAX_HP,
  stats: {
   totalKills: 0,
   playerKills: 0,
   ricochetKills: 0,
   crushKills: 0,
   explosionKills: 0,
   bulletsFiredByZombies: 0,
   bulletsRicocheted: 0,
   structuresLost: 0,
  },
 };
}

export type ItemType = 'plank' | 'metal_sheet' | 'chain' | 'nail' | 'anvil' | 'propane' | 'crate' | 'girder' | 'refrigerator';

export type JunkLocationId = 'hardware' | 'restaurant' | 'junkyard' | 'construction';

export interface InventoryItem {
  id: string;
  type: ItemType;
  name: string;
}

export interface SavedBuildObject {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  rotation: number;
  hp: number;
}

export interface ChainAnchor {
  /** Object id, or GROUND_ANCHOR_ID for an anchor on the ground line. */
  objectId: string;
  /** Offset from that object's center, in world axes. A ground anchor stores absolute coordinates. */
  x: number;
  y: number;
}

export interface SavedChain {
  id: string;
  anchorA: ChainAnchor;
  anchorB: ChainAnchor;
  hp: number;
}

/** Nails take no damage, so they carry no hp field. */
export interface SavedNail {
  id: string;
  anchorA: ChainAnchor;
  anchorB: ChainAnchor;
}

export interface RunStats {
  totalKills: number;
  playerKills: number;
  ricochetKills: number;
  crushKills: number;
  explosionKills: number;
  bulletsFiredByZombies: number;
  bulletsRicocheted: number;
  structuresLost: number;
}

export type Phase = 'build' | 'wave' | 'result';

export type Outcome = 'none' | 'victory' | 'defeat';

export interface RunState {
  seed: number;
  phase: Phase;
  outcome: Outcome;
  waveEnded: boolean;
  inventory: InventoryItem[];
  /** Locations already gathered from this run. Each location supplies once. */
  gatheredLocations: JunkLocationId[];
  placedObjects: SavedBuildObject[];
  chains: SavedChain[];
  nails: SavedNail[];
  playerHp: number;
  coreHp: number;
  stats: RunStats;
}

export type KillSource = 'player' | 'ricochet' | 'crush' | 'explosion';

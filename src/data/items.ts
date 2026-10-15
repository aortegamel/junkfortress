import type { ItemType } from '../types/game';

export type Material = 'wood' | 'metal' | 'core';

export interface ItemDefinition {
  id: ItemType;
  name: string;
  material: Material;
  maxHp: number;
  massKg: number;
  width: number;
  height: number;
  shape: 'rectangle' | 'chain' | 'nail';
  /** Tanks cook off when their hp runs out instead of crumbling. */
  explodes?: true;
}

export const ITEM_DEFINITIONS: Record<ItemType, ItemDefinition> = {
  plank: { id: 'plank', name: 'Wooden Plank', material: 'wood', maxHp: 200, massKg: 8, width: 160, height: 22, shape: 'rectangle' },
  metal_sheet: { id: 'metal_sheet', name: 'Metal Sheet', material: 'metal', maxHp: 400, massKg: 25, width: 150, height: 18, shape: 'rectangle' },
  chain: { id: 'chain', name: 'Chain', material: 'metal', maxHp: 60, massKg: 2, width: 24, height: 24, shape: 'chain' },
  nail: { id: 'nail', name: 'Nail', material: 'metal', maxHp: 20, massKg: 1, width: 18, height: 18, shape: 'nail' },
  anvil: { id: 'anvil', name: 'Anvil', material: 'metal', maxHp: 800, massKg: 100, width: 70, height: 45, shape: 'rectangle' },
  propane: { id: 'propane', name: 'Propane Tank', material: 'metal', maxHp: 180, massKg: 22, width: 46, height: 64, shape: 'rectangle', explodes: true },
};

/** Wood soaks bullets whole, metal shrugs most of them off. */
export const MATERIAL_DAMAGE_MULTIPLIER: Record<Material, number> = {
  wood: 1,
  metal: 0.25,
  core: 1,
};

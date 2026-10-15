import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, MATERIAL_DAMAGE_MULTIPLIER } from './items';
import type { ItemType } from '../types/game';
import { CHAIN_MAX_HP } from '../utils/Constants';

const ALL_ITEMS: ItemType[] = ['plank', 'metal_sheet', 'chain', 'nail', 'anvil', 'propane'];

describe('item definitions', () => {
  it('defines exactly the six junk items', () => {
    expect(Object.keys(ITEM_DEFINITIONS).sort()).toEqual([...ALL_ITEMS].sort());
  });

  it('every item has a valid material, hp, mass, size and shape', () => {
    for (const def of Object.values(ITEM_DEFINITIONS)) {
      expect(['wood', 'metal', 'core']).toContain(def.material);
      expect(['rectangle', 'chain', 'nail']).toContain(def.shape);
      expect(def.maxHp).toBeGreaterThan(0);
      expect(def.massKg).toBeGreaterThan(0);
      expect(def.width).toBeGreaterThan(0);
      expect(def.height).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it('matches the frozen stats', () => {
    expect(ITEM_DEFINITIONS.plank).toMatchObject({ material: 'wood', maxHp: 200, massKg: 8, width: 160, height: 22, shape: 'rectangle' });
    expect(ITEM_DEFINITIONS.metal_sheet).toMatchObject({ material: 'metal', maxHp: 400, massKg: 25, width: 150, height: 18, shape: 'rectangle' });
    expect(ITEM_DEFINITIONS.chain).toMatchObject({ material: 'metal', maxHp: 60, massKg: 2, width: 24, height: 24, shape: 'chain' });
    expect(ITEM_DEFINITIONS.nail).toMatchObject({ material: 'metal', width: 18, height: 18, shape: 'nail' });
    expect(ITEM_DEFINITIONS.anvil).toMatchObject({ material: 'metal', maxHp: 800, massKg: 100, width: 70, height: 45, shape: 'rectangle' });
    expect(ITEM_DEFINITIONS.propane).toMatchObject({ material: 'metal', maxHp: 180, massKg: 22, width: 46, height: 64, shape: 'rectangle' });
  });

  it('marks the propane tank as the one piece that explodes when it dies', () => {
    const exploding = Object.values(ITEM_DEFINITIONS).filter((def) => def.explodes === true);
    expect(exploding.map((def) => def.id)).toEqual(['propane']);
  });

  it('makes wood the soft target and metal the hard one', () => {
    expect(MATERIAL_DAMAGE_MULTIPLIER.wood).toBe(1);
    expect(MATERIAL_DAMAGE_MULTIPLIER.metal).toBe(0.25);
    expect(MATERIAL_DAMAGE_MULTIPLIER.core).toBe(1);
    expect(MATERIAL_DAMAGE_MULTIPLIER.metal).toBeLessThan(MATERIAL_DAMAGE_MULTIPLIER.wood);
  });

  it('gives the chain its own hp pool, below every structural piece', () => {
    expect(ITEM_DEFINITIONS.chain.maxHp).toBe(CHAIN_MAX_HP);
    expect(ITEM_DEFINITIONS.chain.maxHp).toBeLessThan(ITEM_DEFINITIONS.plank.maxHp);
    expect(ITEM_DEFINITIONS.chain.massKg).toBeLessThan(ITEM_DEFINITIONS.plank.massKg);
  });

  it('makes the anvil the heaviest item so chained drops crush', () => {
    for (const def of Object.values(ITEM_DEFINITIONS)) {
      if (def.id === 'anvil') continue;
      expect(ITEM_DEFINITIONS.anvil.massKg).toBeGreaterThan(def.massKg);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, MATERIAL_DAMAGE_MULTIPLIER } from './items';
import { CHAIN_MAX_HP } from '../utils/Constants';

describe('item definitions', () => {
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

  it('marks the propane tank as the one piece that explodes when it dies', () => {
    const exploding = Object.values(ITEM_DEFINITIONS).filter((def) => def.explodes === true);
    expect(exploding.map((def) => def.id)).toEqual(['propane']);
  });

  it('makes wood the soft target and metal the hard one', () => {
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

import { describe, expect, it } from 'vitest';
import { explosionDamage } from './Explosion';
import { BLAST_DAMAGE, BLAST_RADIUS } from './Constants';
import { ITEM_DEFINITIONS } from '../data/items';
import { ZOMBIE_HP } from '../data/gameData';

/** The falloff can land a hair under an exact hp threshold: 300 * (1 - 160/200) is 59.99999999999999. */
const HP_SLACK = 1e-9;

describe('explosionDamage', () => {
  it('is zero at and beyond the blast radius, and for a distance that is not a number', () => {
    expect(explosionDamage(BLAST_RADIUS)).toBe(0);
    expect(explosionDamage(BLAST_RADIUS + 1)).toBe(0);
    expect(explosionDamage(Number.POSITIVE_INFINITY)).toBe(0);
    expect(explosionDamage(Number.NaN)).toBe(0);
  });

  it('is strongest at the centre and falls off with every pixel of distance', () => {
    expect(explosionDamage(0)).toBe(BLAST_DAMAGE);

    let previous = explosionDamage(0);
    for (let distance = 1; distance <= BLAST_RADIUS; distance++) {
      const damage = explosionDamage(distance);
      expect(damage, `distance ${distance}`).toBeLessThan(previous);
      previous = damage;
    }
  });

  it('detonates a propane tank standing against the blast', () => {
    // Two tanks are 46px wide, so 46px is the closest their centres can ever stand.
    expect(explosionDamage(ITEM_DEFINITIONS.propane.width)).toBeGreaterThan(ITEM_DEFINITIONS.propane.maxHp);
  });

  it('kills a zombie out to the falloff boundary and spares every one past it', () => {
    // The range where a full-strength blast has decayed to exactly one zombie's hp.
    const lethalRange = BLAST_RADIUS * (1 - ZOMBIE_HP / BLAST_DAMAGE);
    expect(explosionDamage(lethalRange)).toBeGreaterThanOrEqual(ZOMBIE_HP - HP_SLACK);
    expect(explosionDamage(lethalRange + 1)).toBeLessThan(ZOMBIE_HP);
    expect(explosionDamage(BLAST_RADIUS)).toBe(0);
  });
});

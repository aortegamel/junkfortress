import { describe, expect, it } from 'vitest';
import {
  CORE_MAX_HP,
  PLAYER_MAX_HP,
  WEAPONS,
  WAVE_SPAWNS,
  WAVE_TOTAL_ZOMBIES,
  ZOMBIE_CORE_ATTACK_MS,
  ZOMBIE_CORE_DAMAGE,
  ZOMBIE_HP,
  ZOMBIE_SPEED,
  createInitialRunState,
  createLoadout,
  LOADOUT_NAILS,
} from './gameData';
import { runStore } from '../state/runStore';
import { ITEM_DEFINITIONS } from './items';
import { CHAIN_MAX_HP, GROUND_ANCHOR_ID, PLAYER_SPEED } from '../utils/Constants';
import { nextRng, seedRng } from '../utils/rng';
import type { ItemType } from '../types/game';

const ALLOWED_ITEMS: ItemType[] = ['plank', 'metal_sheet', 'chain', 'nail', 'anvil'];

describe('weapons', () => {
  it('gives the zombie pistol slower, weaker, less accurate fire than the survivor pistol', () => {
    expect(WEAPONS.zombie_pistol.damage).toBeLessThan(WEAPONS.survivor_pistol.damage);
    expect(WEAPONS.zombie_pistol.fireRate).toBeLessThan(WEAPONS.survivor_pistol.fireRate);
    expect(WEAPONS.zombie_pistol.bulletSpeed).toBeLessThan(WEAPONS.survivor_pistol.bulletSpeed);
    expect(WEAPONS.zombie_pistol.spreadDeg).toBeGreaterThan(WEAPONS.survivor_pistol.spreadDeg);
  });

  it('keeps the pistols tuned so a zombie dies in a few hits but never in one', () => {
    expect(ZOMBIE_HP / WEAPONS.survivor_pistol.damage).toBeLessThanOrEqual(4);
    expect(WEAPONS.zombie_pistol.damage).toBeLessThan(ZOMBIE_HP);
  });
});

describe('zombie balance invariants', () => {
  it('keeps zombies slower than the player', () => {
    expect(ZOMBIE_SPEED).toBeGreaterThan(0);
    expect(ZOMBIE_SPEED).toBeLessThan(PLAYER_SPEED);
  });

  it('keeps a single hit from ending the run', () => {
    expect(ZOMBIE_CORE_ATTACK_MS).toBeGreaterThan(0);
    expect(ZOMBIE_CORE_DAMAGE).toBeLessThan(CORE_MAX_HP);
    expect(ZOMBIE_CORE_DAMAGE).toBeLessThan(PLAYER_MAX_HP);
  });
});

describe('single wave schedule', () => {
  it('opens at zero, trickles first and ends with the heaviest batch', () => {
    expect(WAVE_SPAWNS[0].at).toBe(0);
    expect(WAVE_SPAWNS[0].count).toBeLessThanOrEqual(WAVE_SPAWNS[WAVE_SPAWNS.length - 1].count);
  });

  it('schedules 30-34 zombies with the last batch by 38 seconds', () => {
    expect(WAVE_TOTAL_ZOMBIES).toBeGreaterThanOrEqual(30);
    expect(WAVE_TOTAL_ZOMBIES).toBeLessThanOrEqual(34);
    expect(WAVE_SPAWNS[WAVE_SPAWNS.length - 1].at).toBeLessThanOrEqual(38000);
  });

  it('keeps spawn times strictly increasing and every batch non-empty', () => {
    for (let i = 0; i < WAVE_SPAWNS.length; i++) {
      expect(WAVE_SPAWNS[i].count).toBeGreaterThan(0);
      if (i > 0) expect(WAVE_SPAWNS[i].at).toBeGreaterThan(WAVE_SPAWNS[i - 1].at);
    }
  });
});

describe('loadout', () => {
  it('is reproducible from its seed', () => {
    const first = createInitialRunState(4242).inventory.map((item) => item.type);
    const second = runStore.reset(4242).inventory.map((item) => item.type);
    expect(second).toEqual(first);

    const state = runStore.get();
    expect(state.seed).toBe(4242);
    expect(state.phase).toBe('build');
    expect(state.outcome).toBe('none');
    expect(state.waveEnded).toBe(false);
    expect(state.playerHp).toBe(PLAYER_MAX_HP);
    expect(state.coreHp).toBe(CORE_MAX_HP);
  });

  it('always hands over 3-4 planks, 3-4 sheets, a fixed bag of nails, one chain and one anvil', () => {
    for (let seed = 0; seed < 40; seed++) {
      seedRng(seed);
      const types = createLoadout().map((item) => item.type);
      expect(types.length).toBeGreaterThanOrEqual(8 + LOADOUT_NAILS);
      expect(types.length).toBeLessThanOrEqual(10 + LOADOUT_NAILS);
      for (const type of types) expect(ALLOWED_ITEMS).toContain(type);
      const count = (type: ItemType): number => types.filter((t) => t === type).length;
      expect(count('plank')).toBeGreaterThanOrEqual(3);
      expect(count('plank')).toBeLessThanOrEqual(4);
      expect(count('metal_sheet')).toBeGreaterThanOrEqual(3);
      expect(count('metal_sheet')).toBeLessThanOrEqual(4);
      expect(count('nail')).toBe(LOADOUT_NAILS);
      expect(count('chain')).toBe(1);
      expect(count('anvil')).toBe(1);
    }
  });

  it('hands over enough nails to joint every starting piece, anvil included', () => {
    for (let seed = 0; seed < 40; seed++) {
      seedRng(seed);
      const types = createLoadout().map((item) => item.type);
      const pieces = types.filter((t) => t !== 'chain' && t !== 'nail').length;
      const nails = types.filter((t) => t === 'nail').length;
      // A connected structure of n pieces needs n-1 joints, plus a ground nail for the base.
      expect(nails).toBeGreaterThanOrEqual(pieces);
    }
  });

  it('starts every run with no nails placed', () => {
    expect(createInitialRunState(9).nails).toEqual([]);
    expect(runStore.reset(9).nails).toEqual([]);
  });

  it('rolls both the low and the high piece totals across seeds', () => {
    const totals = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      seedRng(seed);
      totals.add(createLoadout().length);
    }
    expect(totals.size).toBeGreaterThan(1);
  });
});

describe('run store bookkeeping', () => {
  it('reset() restores full hp, build phase and empty fort', () => {
    runStore.reset();
    runStore.damagePlayer(30);
    runStore.damageCore(500);
    runStore.setPhase('wave');
    runStore.setWaveEnded(true);
    runStore.setOutcome('defeat');
    runStore.reset();

    const state = runStore.get();
    expect(state.playerHp).toBe(PLAYER_MAX_HP);
    expect(state.coreHp).toBe(CORE_MAX_HP);
    expect(state.phase).toBe('build');
    expect(state.waveEnded).toBe(false);
    expect(state.outcome).toBe('none');
    expect(state.placedObjects).toEqual([]);
    expect(state.chains).toEqual([]);
    expect(state.nails).toEqual([]);
  });

  it('clamps damage at zero', () => {
    runStore.reset();
    runStore.damagePlayer(PLAYER_MAX_HP + 50);
    runStore.damageCore(CORE_MAX_HP + 50);
    expect(runStore.get().playerHp).toBe(0);
    expect(runStore.get().coreHp).toBe(0);
  });

  it('attributes kills to the right bucket', () => {
    runStore.reset();
    runStore.addKill('player');
    runStore.addKill('ricochet');
    runStore.addKill('ricochet');
    runStore.addKill('crush');

    const { stats } = runStore.get();
    expect(stats.totalKills).toBe(4);
    expect(stats.playerKills).toBe(1);
    expect(stats.ricochetKills).toBe(2);
    expect(stats.crushKills).toBe(1);
  });

  it('counts zombie bullets, ricochets and lost structures', () => {
    runStore.reset();
    runStore.recordBulletFired();
    runStore.recordBulletFired();
    runStore.recordRicochet();
    runStore.setPlacedObjects([
      { id: 'p1', type: 'plank', x: 220, y: 640, rotation: 0, hp: ITEM_DEFINITIONS.plank.maxHp },
    ]);
    runStore.recordStructureLost('p1');

    const state = runStore.get();
    expect(state.stats.bulletsFiredByZombies).toBe(2);
    expect(state.stats.bulletsRicocheted).toBe(1);
    expect(state.stats.structuresLost).toBe(1);
    expect(state.placedObjects).toEqual([]);
  });

  it('tracks structure hp and keeps it in range', () => {
    runStore.reset();
    runStore.setPlacedObjects([
      { id: 'p1', type: 'plank', x: 220, y: 640, rotation: 0, hp: ITEM_DEFINITIONS.plank.maxHp },
    ]);
    runStore.updateObjectHp('p1', ITEM_DEFINITIONS.plank.maxHp - 40);
    expect(runStore.get().placedObjects[0].hp).toBe(160);
    runStore.updateObjectHp('p1', -10);
    expect(runStore.get().placedObjects[0].hp).toBe(0);
    runStore.updateObjectHp('missing', 5);
    expect(runStore.get().placedObjects).toHaveLength(1);
  });

  it('adds, damages and removes chains', () => {
    runStore.reset();
    runStore.addChain({
      id: 'c1',
      anchorA: { objectId: 'a', x: 0, y: -11 },
      anchorB: { objectId: 'b', x: 0, y: -22 },
      hp: CHAIN_MAX_HP,
    });
    expect(runStore.get().chains.map((chain) => chain.id)).toEqual(['c1']);

    runStore.updateChainHp('c1', -5);
    expect(runStore.get().chains[0].hp).toBe(0);

    runStore.removeChain('c1');
    expect(runStore.get().chains).toEqual([]);
  });

  it('adds and removes nails', () => {
    runStore.reset();
    runStore.addNail({ id: 'n1', anchorA: { objectId: 'a', x: 0, y: 0 }, anchorB: { objectId: 'b', x: 0, y: 4 } });
    expect(runStore.get().nails.map((n) => n.id)).toEqual(['n1']);

    runStore.removeNail('n1');
    expect(runStore.get().nails).toEqual([]);
  });

  it('drops every nail that points at a removed object', () => {
    runStore.reset();
    const plank = { id: 'p1', type: 'plank' as const, x: 220, y: 640, rotation: 0, hp: ITEM_DEFINITIONS.plank.maxHp };
    const sheet = { id: 's1', type: 'metal_sheet' as const, x: 220, y: 610, rotation: 0, hp: ITEM_DEFINITIONS.metal_sheet.maxHp };
    runStore.setPlacedObjects([plank, sheet]);
    runStore.addNail({ id: 'n1', anchorA: { objectId: 'p1', x: 0, y: -11 }, anchorB: { objectId: 's1', x: 0, y: 12 } });
    runStore.addNail({ id: 'n2', anchorA: { objectId: GROUND_ANCHOR_ID, x: 220, y: 660 }, anchorB: { objectId: 'p1', x: 0, y: 11 } });

    runStore.setPlacedObjects([sheet]);
    expect(runStore.get().nails).toEqual([]);
  });

  it('keeps ground-anchored nails when another object goes', () => {
    runStore.reset();
    runStore.setPlacedObjects([
      { id: 'p1', type: 'plank', x: 220, y: 640, rotation: 0, hp: ITEM_DEFINITIONS.plank.maxHp },
      { id: 'p2', type: 'plank', x: 300, y: 640, rotation: 0, hp: ITEM_DEFINITIONS.plank.maxHp },
    ]);
    runStore.addNail({ id: 'n1', anchorA: { objectId: GROUND_ANCHOR_ID, x: 220, y: 660 }, anchorB: { objectId: 'p1', x: 0, y: 11 } });
    runStore.addNail({ id: 'n2', anchorA: { objectId: 'p1', x: 0, y: 0 }, anchorB: { objectId: 'p2', x: -40, y: 0 } });

    runStore.recordStructureLost('p2');
    expect(runStore.get().nails.map((n) => n.id)).toEqual(['n1']);

    runStore.recordStructureLost('p1');
    expect(runStore.get().nails).toEqual([]);
  });

  it('moves inventory items in and out with unique ids', () => {
    runStore.reset();
    const before = runStore.get().inventory.map((item) => item.id);
    const added = runStore.addInventoryItem('anvil');

    expect(added.type).toBe('anvil');
    expect(added.name).toBe(ITEM_DEFINITIONS.anvil.name);
    expect(before).not.toContain(added.id);
    expect(runStore.get().inventory).toContainEqual(added);

    runStore.removeInventoryItem(added.id);
    expect(runStore.get().inventory.map((item) => item.id)).toEqual(before);
  });

  it('reset(seed) keeps the visible seed and the rng stream in step', () => {
    runStore.reset(777);
    expect(runStore.get().seed).toBe(777);
    const firstDraw = nextRng();
    runStore.reset(777);
    expect(runStore.get().seed).toBe(777);
    expect(nextRng()).toBe(firstDraw);
  });
});

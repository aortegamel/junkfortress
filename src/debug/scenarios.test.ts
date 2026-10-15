import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios';
import type { DebugScenario } from './scenarios';
import { groundedNailObjects, nailPlacementCheck, objectRect } from '../systems/StructureSystem';
import { ITEM_DEFINITIONS } from '../data/items';
import { ZOMBIE_HP } from '../data/gameData';
import { explosionDamage } from '../utils/Explosion';
import { GROUND_Y } from '../utils/Constants';
import type { ChainAnchor, SavedBuildObject, SavedNail } from '../types/game';

/**
 * Saved endpoints are offsets from the piece centre, except a ground endpoint, which is already a
 * world point. The physics manager applies the same rule, so a rig only holds if this conversion
 * lands the joint on both pieces.
 */
function worldAnchor(objects: SavedBuildObject[], anchor: ChainAnchor): ChainAnchor {
 const obj = objects.find((o) => o.id === anchor.objectId);
 return obj ? { objectId: anchor.objectId, x: obj.x + anchor.x, y: obj.y + anchor.y } : anchor;
}

function rigsWithNails(): Array<{ scenario: DebugScenario; objects: SavedBuildObject[]; nails: SavedNail[] }> {
 const rigs: Array<{ scenario: DebugScenario; objects: SavedBuildObject[]; nails: SavedNail[] }> = [];
 for (const scenario of Object.values(SCENARIOS)) {
  const objects = scenario.build?.placedObjects ?? [];
  const nails = scenario.build?.nails ?? [];
  if (nails.length > 0) rigs.push({ scenario, objects, nails });
 }
 return rigs;
}

/** Pieces each rig needs frozen through its nails. The anvil is absent on purpose: it swings. */
const ANCHORED: Record<string, string[]> = {
 ricochet: ['ricochet-plate', 'ricochet-post'],
 collapse: ['collapse-post', 'collapse-sheet'],
 anvil: ['anvil-lintel', 'anvil-post-left', 'anvil-post-right'],
 platform: ['platform-plank-1', 'platform-plank-2', 'platform-plank-3', 'platform-plank-4'],
};

describe('scenario rigs', () => {
 it('nails every rig where the two pieces touch', () => {
  const rigs = rigsWithNails();
  expect(rigs.length).toBeGreaterThan(0);
  for (const { scenario, objects, nails } of rigs) {
   for (const nail of nails) {
    const result = nailPlacementCheck(worldAnchor(objects, nail.anchorA), worldAnchor(objects, nail.anchorB), objects);
    expect(result.valid, `${scenario.name}/${nail.id}: ${result.violation}`).toBe(true);
   }
  }
 });

 it('freezes the rig frames through their nails and leaves the anvil loose', () => {
  for (const { scenario, objects, nails } of rigsWithNails()) {
   const grounded = [...groundedNailObjects(objects, nails)].sort();
   expect(grounded, scenario.name).toEqual(ANCHORED[scenario.name]);
  }
  const anvil = SCENARIOS.anvil.build!.placedObjects;
  expect(groundedNailObjects(anvil, SCENARIOS.anvil.build!.nails!).has('anvil-body')).toBe(false);
 });

 it('gives the platform rig a standing ledge the player can land on', () => {
  const platform = SCENARIOS.platform;
  const planks = platform.build!.placedObjects;
  const rects = planks.map((obj) => objectRect(obj, ITEM_DEFINITIONS[obj.type]));
  expect(Math.min(...rects.map((r) => r.y))).toBe(GROUND_Y - 4 * ITEM_DEFINITIONS.plank.height);
  expect(Math.min(...rects.map((r) => r.x))).toBe(360);
  expect(Math.max(...rects.map((r) => r.x + r.width))).toBe(520);
  expect(platform.keepAlive).toBe(true);
  expect(platform.zombies).toHaveLength(0);
 });

 it('stands the propane rig on the ground, tanks touching and the zombie inside both blasts', () => {
  const rig = SCENARIOS.propane;
  const tanks = rig.build!.placedObjects;
  const rects = tanks.map((obj) => objectRect(obj, ITEM_DEFINITIONS[obj.type]));
  for (const rect of rects) expect(rect.y + rect.height).toBe(GROUND_Y);
  // Touching, so the neighbour sits at exactly 46px: 231 damage against its 180hp.
  expect(rects[1].x - (rects[0].x + rects[0].width)).toBe(0);

  const [tankA, tankB] = tanks;
  const target = rig.zombies[0];
  // 120px from tank A and 74px from tank B: inside the lethal range of either blast.
  expect(explosionDamage(Math.abs(target.x - tankA.x))).toBeGreaterThanOrEqual(ZOMBIE_HP);
  expect(explosionDamage(Math.abs(target.x - tankB.x))).toBeGreaterThanOrEqual(ZOMBIE_HP);
 });
});

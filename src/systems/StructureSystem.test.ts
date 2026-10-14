import { describe, expect, it } from 'vitest';
import type { ChainAnchor, ItemType, SavedBuildObject, SavedNail } from '../types/game';
import {
  chainPlacementCheck,
  groundedNailObjects,
  nailPlacementCheck,
  objectRect,
  placementCheck,
  rectIntersects,
} from './StructureSystem';
import { ITEM_DEFINITIONS } from '../data/items';
import { CORE_RECT, GROUND_ANCHOR_ID, GROUND_Y, NAIL_MAX_LENGTH } from '../utils/Constants';

function obj(id: string, type: ItemType, x: number, y: number, rotation = 0, hp = 1000): SavedBuildObject {
  return { id, type, x, y, rotation, hp };
}

function nail(id: string, a: string, b: string): SavedNail {
  return { id, anchorA: { objectId: a, x: 0, y: 0 }, anchorB: { objectId: b, x: 0, y: 0 } };
}

function ids(set: Set<string>): string[] {
  return [...set].sort();
}

describe('objectRect', () => {
  it('computes an axis-aligned bounding box for a rotated rectangle', () => {
    const r = objectRect(obj('a', 'plank', 400, 300, 90), ITEM_DEFINITIONS.plank);
    expect(r.x).toBe(400 - 11);
    expect(r.y).toBe(300 - 80);
    expect(r.width).toBeCloseTo(22, 5);
    expect(r.height).toBeCloseTo(160, 5);
  });
});

describe('groundedNailObjects', () => {
  const base = obj('base', 'plank', 400, 649);
  const load = obj('load', 'plank', 400, 627);
  const top = obj('top', 'plank', 400, 605);
  const nails = [nail('ground', GROUND_ANCHOR_ID, 'base'), nail('joint', 'base', 'load'), nail('upper', 'load', 'top')];

  it('keeps un-nailed ground contacts dynamic', () => {
    expect(ids(groundedNailObjects([base, load], []))).toEqual([]);
  });

  it('freezes only the nail graph connected to ground', () => {
    expect(ids(groundedNailObjects([base, load, top], nails))).toEqual(['base', 'load', 'top']);
    expect(ids(groundedNailObjects([base, load, top], nails.slice(1)))).toEqual([]);
  });

  it('releases a nailed group when its anchor disappears', () => {
    expect(ids(groundedNailObjects([load, top], nails))).toEqual([]);
    expect(ids(groundedNailObjects([base, load, top], [nails[0], nails[2]]))).toEqual(['base']);
  });
});

describe('nailPlacementCheck', () => {
  const a = obj('a', 'plank', 400, 649);
  const b = obj('b', 'plank', 400, 627);
  const point = (objectId: string, x: number, y: number): ChainAnchor => ({ objectId, x, y });

  it('accepts touching objects and a touching ground anchor', () => {
    expect(nailPlacementCheck(point('a', 400, 638), point('b', 400, 638), [a, b]).valid).toBe(true);
    expect(nailPlacementCheck(point('a', 400, 660), point(GROUND_ANCHOR_ID, 400, GROUND_Y), [a]).valid).toBe(true);
  });

  it('rejects a nearby floating object and distant ground coordinates', () => {
    const floating = { ...a, y: 644 };
    expect(nailPlacementCheck(point('a', 400, 655), point(GROUND_ANCHOR_ID, 400, GROUND_Y), [floating]).violation).toBe('not-touching');
    expect(nailPlacementCheck(point('a', 400, 649), point(GROUND_ANCHOR_ID, 400, 649), [a]).violation).toBe('not-touching');
  });

  it('rejects endpoints outside the selected shape', () => {
    expect(nailPlacementCheck(point('a', 500, 649), point('b', 500, 638), [a, b]).violation).toBe('outside-object');
    const rotated = obj('r', 'plank', 400, 500, 45);
    expect(nailPlacementCheck(point('r', 450, 450), point('b', 450, 450), [rotated, b]).violation).toBe('outside-object');
  });

  it('rejects separated shapes within nail range', () => {
    const separated = { ...b, y: 620 };
    expect(nailPlacementCheck(point('a', 400, 638), point('b', 400, 631), [a, separated]).violation).toBe('not-touching');
  });

  it('rejects missing, repeated, and distant endpoints', () => {
    expect(nailPlacementCheck(point('a', 400, 638), point('gone', 400, 638), [a]).violation).toBe('missing-object');
    expect(nailPlacementCheck(point('a', 400, 638), point('a', 400, 638), [a]).violation).toBe('same-object');
    expect(nailPlacementCheck(point('a', 400, 638), point('b', 400 + NAIL_MAX_LENGTH + 1, 638), [a, b]).violation).toBe('too-long');
  });
});

describe('placementCheck', () => {
  it('accepts a piece placed in mid air, because nothing has to hold it up', () => {
    expect(placementCheck(obj('c', 'plank', 400, 300), [], ITEM_DEFINITIONS).valid).toBe(true);
    expect(placementCheck(obj('a', 'anvil', 400, 300), [], ITEM_DEFINITIONS).valid).toBe(true);
  });

  it('accepts a piece touching another piece, supported or not', () => {
    const grounded = obj('w1', 'plank', 400, 649);
    const floating = obj('w2', 'plank', 400, 627);
    expect(placementCheck(obj('w3', 'plank', 400, 605), [grounded, floating], ITEM_DEFINITIONS).valid).toBe(true);
  });

  it('rejects objects outside the build zone', () => {
    const result = placementCheck(obj('c', 'anvil', 1200, 300), [], ITEM_DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('outside-zone');
  });

  it('rejects objects overlapping the core', () => {
    const result = placementCheck(obj('c', 'anvil', CORE_RECT.x + CORE_RECT.width / 2, CORE_RECT.y + CORE_RECT.height / 2), [], ITEM_DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('overlaps-core');
  });

  it('rejects objects overlapping another placed object', () => {
    const existing = obj('e', 'plank', 400, 649);
    const result = placementCheck(obj('c', 'plank', 401, 649), [existing], ITEM_DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('overlaps-object');
  });

  it('accepts a 45° plate whose rotated box covers a piece it does not touch', () => {
    const existing = obj('e', 'plank', 400, 649);
    const result = placementCheck(obj('c', 'metal_sheet', 480, 600, 45), [existing], ITEM_DEFINITIONS);
    expect(result.valid).toBe(true);
  });

  it('ignores the candidate itself when checking overlap (moving)', () => {
    const candidate = obj('c', 'plank', 400, 649);
    const result = placementCheck(candidate, [candidate], ITEM_DEFINITIONS);
    expect(result.valid).toBe(true);
  });
});

describe('chainPlacementCheck', () => {
  const wood = obj('w', 'plank', 400, 649);
  const anvil = obj('a', 'anvil', 400, 520);

  it('rejects chaining an object to itself', () => {
    const result = chainPlacementCheck(
      { objectId: 'w', x: 400, y: 638 },
      { objectId: 'w', x: 400, y: 630 },
      [wood],
    );
    expect(result.valid).toBe(false);
    expect(result.violation).toBe('same-object');
  });

  it('rejects chains longer than the maximum', () => {
    const result = chainPlacementCheck(
      { objectId: 'w', x: 400, y: 638 },
      { objectId: 'a', x: 400, y: 100 },
      [wood, anvil],
    );
    expect(result.valid).toBe(false);
    expect(result.violation).toBe('too-long');
  });

  it('rejects anchors on missing objects', () => {
    const result = chainPlacementCheck(
      { objectId: 'nope', x: 400, y: 638 },
      { objectId: 'a', x: 400, y: 498 },
      [wood, anvil],
    );
    expect(result.valid).toBe(false);
    expect(result.violation).toBe('missing-object');
  });

  it('accepts a chain between two placed objects within range', () => {
    const result = chainPlacementCheck(
      { objectId: 'w', x: 400, y: 638 },
      { objectId: 'a', x: 400, y: 498 },
      [wood, anvil],
    );
    expect(result.valid).toBe(true);
  });

});

describe('rect helpers', () => {
  it('grounded objects touch the ground line', () => {
    const r = objectRect(obj('w', 'plank', 400, 649), ITEM_DEFINITIONS.plank);
    expect(r.y + r.height).toBeGreaterThanOrEqual(GROUND_Y - 4);
  });

  it('detects touching rectangles as intersecting', () => {
    const a = { x: 0, y: 0, width: 100, height: 10 };
    const b = { x: 0, y: 10, width: 100, height: 10 };
    expect(rectIntersects(a, b, 4)).toBe(true);
  });
});
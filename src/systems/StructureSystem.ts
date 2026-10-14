import type { ItemDefinition } from '../data/items';
import { ITEM_DEFINITIONS } from '../data/items';
import type { ChainAnchor, ItemType, SavedBuildObject, SavedNail } from '../types/game';
import {
 BUILD_ZONE,
 CHAIN_MAX_LENGTH,
 CORE_RECT,
 GROUND_ANCHOR_ID,
 GROUND_Y,
 NAIL_MAX_LENGTH,
 CONTACT_EPSILON,
} from '../utils/Constants';

export interface Rect {
 x: number;
 y: number;
 width: number;
 height: number;
}

/** Allow shallow contact while the physics solver separates placed pieces. */
export const PLACEMENT_OVERLAP_TOLERANCE = 4;

/** A piece as an oriented rectangle: a rotated plank is a thin diagonal, nothing like its box. */
export interface OrientedRect {
 x: number; y: number; halfW: number; halfH: number; ux: number; uy: number;
}

export function orientedRect(
 obj: Pick<SavedBuildObject, 'x' | 'y' | 'rotation' | 'type'>,
 def: ItemDefinition,
): OrientedRect {
 const rad = (obj.rotation * Math.PI) / 180;
 return {
  x: obj.x, y: obj.y, halfW: def.width / 2, halfH: def.height / 2,
  ux: Math.cos(rad), uy: Math.sin(rad),
 };
}

/**
 * Penetration depth of two oriented rectangles (separating axis test, exact for rectangles).
 * Comparing rotated bounding boxes instead refuses leaning plates that never touch each other,
 * because a 45° plate's box bulges ~25px past its corners.
 * Returns <= 0 when the shapes are apart.
 */
export function orientedPenetration(a: OrientedRect, b: OrientedRect): number {
 const axes = [a.ux, a.uy, -a.uy, a.ux, b.ux, b.uy, -b.uy, b.ux];
 const dx = b.x - a.x;
 const dy = b.y - a.y;
 let min = Number.POSITIVE_INFINITY;
 for (let i = 0; i < axes.length; i += 2) {
  const nx = axes[i];
  const ny = axes[i + 1];
  const radiusA = a.halfW * Math.abs(nx * a.ux + ny * a.uy) + a.halfH * Math.abs(ny * a.ux - nx * a.uy);
  const radiusB = b.halfW * Math.abs(nx * b.ux + ny * b.uy) + b.halfH * Math.abs(ny * b.ux - nx * b.uy);
  const overlap = radiusA + radiusB - Math.abs(dx * nx + dy * ny);
  if (overlap <= 0) return overlap;
  if (overlap < min) min = overlap;
 }
 return min;
}

export function objectRect(obj: Pick<SavedBuildObject, 'x' | 'y' | 'rotation' | 'type'>, def: ItemDefinition): Rect {
 const rad = (obj.rotation * Math.PI) / 180;
 const c = Math.abs(Math.cos(rad));
 const s = Math.abs(Math.sin(rad));
 const halfW = (def.width * c + def.height * s) / 2;
 const halfH = (def.width * s + def.height * c) / 2;
 return { x: obj.x - halfW, y: obj.y - halfH, width: halfW * 2, height: halfH * 2 };
}

export function rectIntersects(a: Rect, b: Rect, epsilon = 0): boolean {
 return (
  a.x <= b.x + b.width + epsilon &&
  a.x + a.width >= b.x - epsilon &&
  a.y <= b.y + b.height + epsilon &&
  a.y + a.height >= b.y - epsilon
 );
}

export function rectOverlaps(a: Rect, b: Rect, epsilon = 0): boolean {
 return (
  a.x < b.x + b.width - epsilon &&
  a.x + a.width > b.x + epsilon &&
  a.y < b.y + b.height - epsilon &&
  a.y + a.height > b.y + epsilon
 );
}

export function insideRect(r: Rect, outer: Rect, epsilon = 0): boolean {
 return (
  r.x >= outer.x - epsilon &&
  r.y >= outer.y - epsilon &&
  r.x + r.width <= outer.x + outer.width + epsilon &&
  r.y + r.height <= outer.y + outer.height + epsilon
 );
}

/** Only nail edges propagate a fixed ground connection. Chains never freeze their loads. */
export function groundedNailObjects(objects: SavedBuildObject[], nails: SavedNail[]): Set<string> {
 const ids = new Set(objects.map((obj) => obj.id));
 const edges = new Map<string, string[]>();
 for (const nail of nails) {
  const a = nail.anchorA.objectId;
  const b = nail.anchorB.objectId;
  if (a === b || (a !== GROUND_ANCHOR_ID && !ids.has(a)) || (b !== GROUND_ANCHOR_ID && !ids.has(b))) continue;
  if (!edges.has(a)) edges.set(a, []);
  if (!edges.has(b)) edges.set(b, []);
  edges.get(a)!.push(b);
  edges.get(b)!.push(a);
 }
 const grounded = new Set<string>();
 const queue = [GROUND_ANCHOR_ID];
 while (queue.length > 0) {
  for (const id of edges.get(queue.pop()!) ?? []) {
   if (id === GROUND_ANCHOR_ID || grounded.has(id)) continue;
   grounded.add(id);
   queue.push(id);
  }
 }
 return grounded;
}

export type PlacementViolation =
 | 'outside-zone'
 | 'overlaps-core'
 | 'overlaps-object';

export interface PlacementResult {
 valid: boolean;
 violations: PlacementViolation[];
}

export function placementCheck(
 candidate: SavedBuildObject,
 placedObjects: SavedBuildObject[],
 defs: Record<ItemType, ItemDefinition> = ITEM_DEFINITIONS,
): PlacementResult {
 const violations: PlacementViolation[] = [];
 const rect = objectRect(candidate, defs[candidate.type]);

 if (!insideRect(rect, BUILD_ZONE)) violations.push('outside-zone');
 if (rectOverlaps(rect, CORE_RECT)) violations.push('overlaps-core');

 for (const other of placedObjects) {
  if (other.id === candidate.id) continue;
  const penetration = orientedPenetration(orientedRect(other, defs[other.type]), orientedRect(candidate, defs[candidate.type]));
  if (penetration > PLACEMENT_OVERLAP_TOLERANCE) {
   violations.push('overlaps-object');
   break;
  }
 }

 return { valid: violations.length === 0, violations };
}

export type ChainViolation = 'same-object' | 'too-long' | 'missing-object';

/** Nails add the joint itself to the reasons a chain already knows. */
export type NailViolation = ChainViolation | 'not-touching' | 'outside-object';

export function chainPlacementCheck(
 a: { objectId: string; x: number; y: number },
 b: { objectId: string; x: number; y: number },
 placedObjects: SavedBuildObject[],
): { valid: boolean; violation: ChainViolation | null } {
 if (a.objectId === b.objectId) return { valid: false, violation: 'same-object' };
 const exists = (id: string): boolean => placedObjects.some((o) => o.id === id);
 if (!exists(a.objectId) || !exists(b.objectId)) return { valid: false, violation: 'missing-object' };
 if (Math.hypot(b.x - a.x, b.y - a.y) > CHAIN_MAX_LENGTH) return { valid: false, violation: 'too-long' };
 return { valid: true, violation: null };
}

/** Placement endpoints use world coordinates. Saved endpoints use offsets from the object center. */
export function nailPlacementCheck(
 a: ChainAnchor,
 b: ChainAnchor,
 placedObjects: SavedBuildObject[],
): { valid: boolean; violation: NailViolation | null } {
 if (a.objectId === b.objectId) return { valid: false, violation: 'same-object' };
 const objectA = placedObjects.find((obj) => obj.id === a.objectId);
 const objectB = placedObjects.find((obj) => obj.id === b.objectId);
 const groundA = a.objectId === GROUND_ANCHOR_ID;
 const groundB = b.objectId === GROUND_ANCHOR_ID;
 if ((!groundA && !objectA) || (!groundB && !objectB)) return { valid: false, violation: 'missing-object' };
 if (!Number.isFinite(a.x + a.y + b.x + b.y)) return { valid: false, violation: 'outside-object' };
 if (Math.hypot(b.x - a.x, b.y - a.y) > NAIL_MAX_LENGTH) return { valid: false, violation: 'too-long' };
 const onObject = (point: ChainAnchor, obj: SavedBuildObject): boolean => {
  const rect = orientedRect(obj, ITEM_DEFINITIONS[obj.type]);
  const dx = point.x - obj.x;
  const dy = point.y - obj.y;
  return Math.abs(dx * rect.ux + dy * rect.uy) <= rect.halfW + CONTACT_EPSILON &&
   Math.abs(dy * rect.ux - dx * rect.uy) <= rect.halfH + CONTACT_EPSILON;
 };
 if ((objectA && !onObject(a, objectA)) || (objectB && !onObject(b, objectB))) {
  return { valid: false, violation: 'outside-object' };
 }
 if (groundA || groundB) {
  const point = groundA ? a : b;
  const obj = (groundA ? objectB : objectA)!;
  const rect = objectRect(obj, ITEM_DEFINITIONS[obj.type]);
  if (Math.abs(point.y - GROUND_Y) > CONTACT_EPSILON ||
   Math.abs(rect.y + rect.height - GROUND_Y) > CONTACT_EPSILON ||
   !onObject(point, obj)) return { valid: false, violation: 'not-touching' };
 } else if (orientedPenetration(
  orientedRect(objectA!, ITEM_DEFINITIONS[objectA!.type]),
  orientedRect(objectB!, ITEM_DEFINITIONS[objectB!.type]),
 ) < -CONTACT_EPSILON) {
  return { valid: false, violation: 'not-touching' };
 }
 return { valid: true, violation: null };
}
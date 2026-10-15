import { BLAST_DAMAGE, BLAST_RADIUS } from './Constants';

/**
 * Damage of a blast at `distance`: full strength at the centre, zero at the edge and beyond.
 * A broken position yields 0 rather than a NaN hit, and a negative distance cannot exceed
 * BLAST_DAMAGE.
 */
export function explosionDamage(distance: number): number {
 if (!Number.isFinite(distance) || distance >= BLAST_RADIUS) return 0;
 return BLAST_DAMAGE * (1 - Math.max(distance, 0) / BLAST_RADIUS);
}

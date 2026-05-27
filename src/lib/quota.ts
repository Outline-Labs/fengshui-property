export const MAX_QUOTA = 3;

export type QuotaInput = {
  phone?: string | null;
  name?: string | null;
  timeline?: string | null;
};

/**
 * Free readings a lead unlocks by how complete their profile is.
 * email only → 1 · + phone → 2 · + name & timeline → 3 (capped).
 */
export function computeQuota(p: QuotaInput): number {
  let q = 1;
  if (p.phone && p.phone.trim()) q += 1;
  if (p.name && p.name.trim() && p.timeline && p.timeline.trim()) q += 1;
  return Math.min(MAX_QUOTA, q);
}

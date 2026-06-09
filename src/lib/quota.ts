export const MAX_QUOTA = 3;

export type QuotaInput = {
  // A lead's phone is only worth a reading once it's OTP-VERIFIED — entering a
  // number is no longer enough (stops fake numbers farming free readings).
  phoneVerified?: number | boolean | null;
  name?: string | null;
  timeline?: string | null;
};

/**
 * Free readings a lead unlocks by how complete their profile is.
 * email only → 1 · + verified phone → 2 · + name & timeline → 3 (capped).
 */
export function computeQuota(p: QuotaInput): number {
  let q = 1;
  if (p.phoneVerified) q += 1;
  if (p.name && p.name.trim() && p.timeline && p.timeline.trim()) q += 1;
  return Math.min(MAX_QUOTA, q);
}

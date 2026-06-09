export const MAX_QUOTA = 3;

export type QuotaInput = {
  // A lead's phone is only worth a reading once it's OTP-VERIFIED — entering a
  // number is no longer enough (stops fake numbers farming free readings).
  phoneVerified?: number | boolean | null;
  // The final +1 is the "qualified intent" tier: a buying timeline AND a stated
  // property of interest (area/block/condo). Both together = a high-value lead;
  // name is already mandatory at signup, so it no longer factors here.
  timeline?: string | null;
  propertyInterest?: string | null;
};

/**
 * Free readings a lead unlocks by how complete their profile is.
 * base (verified email + name) → 1 · + verified phone → 2 ·
 * + buying timeline AND property of interest → 3 (capped).
 */
export function computeQuota(p: QuotaInput): number {
  let q = 1;
  if (p.phoneVerified) q += 1;
  if (
    p.timeline &&
    p.timeline.trim() &&
    p.propertyInterest &&
    p.propertyInterest.trim()
  ) {
    q += 1;
  }
  return Math.min(MAX_QUOTA, q);
}

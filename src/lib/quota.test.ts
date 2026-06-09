import { describe, expect, it } from "vitest";

import { MAX_QUOTA, computeQuota } from "./quota";

// Spec (product rule): a lead earns free readings by profile completeness.
//   email only             → 1
//   + VERIFIED phone        → 2   (entering a number no longer counts — it must
//                                  be OTP-verified, to stop fake numbers)
//   + name AND timeline     → 3 (capped at MAX_QUOTA)
// Name or timeline alone does NOT add a credit; blank/whitespace doesn't count.
describe("computeQuota", () => {
  it("grants 1 for an email-only lead (no profile fields)", () => {
    expect(computeQuota({})).toBe(1);
    expect(computeQuota({ phoneVerified: 0, name: null, timeline: null })).toBe(1);
  });

  it("adds 1 only for a VERIFIED phone", () => {
    expect(computeQuota({ phoneVerified: 1 })).toBe(2);
    expect(computeQuota({ phoneVerified: true })).toBe(2);
    expect(computeQuota({ phoneVerified: 0 })).toBe(1); // unverified → nothing
  });

  it("adds 1 only when BOTH name and timeline are present", () => {
    expect(computeQuota({ name: "Wei" })).toBe(1);
    expect(computeQuota({ timeline: "3 months" })).toBe(1);
    expect(computeQuota({ name: "Wei", timeline: "3 months" })).toBe(2);
  });

  it("reaches the max of 3 with verified phone + name + timeline", () => {
    expect(
      computeQuota({ phoneVerified: 1, name: "Wei", timeline: "3 months" }),
    ).toBe(3);
    expect(MAX_QUOTA).toBe(3);
  });

  it("never exceeds MAX_QUOTA", () => {
    const q = computeQuota({
      phoneVerified: 1,
      name: "Wei Chen",
      timeline: "ASAP",
    });
    expect(q).toBeLessThanOrEqual(MAX_QUOTA);
  });

  it("ignores whitespace-only name/timeline", () => {
    expect(computeQuota({ name: "  ", timeline: "  " })).toBe(1);
    expect(computeQuota({ phoneVerified: 0, name: " ", timeline: " " })).toBe(1);
  });
});

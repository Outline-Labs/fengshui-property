import { describe, expect, it } from "vitest";

import { MAX_QUOTA, computeQuota } from "./quota";

// Spec (product rule): a lead earns free readings by how qualified it is.
//   base (verified email + mandatory name)          → 1
//   + VERIFIED phone (OTP — entering a number no     → 2
//     longer counts, to stop fake numbers)
//   + buying timeline AND property of interest       → 3 (capped at MAX_QUOTA)
// The final +1 needs BOTH intent signals together; either alone adds nothing,
// and blank/whitespace doesn't count.
describe("computeQuota", () => {
  it("grants 1 for a base lead (no phone, no intent fields)", () => {
    expect(computeQuota({})).toBe(1);
    expect(
      computeQuota({ phoneVerified: 0, timeline: null, propertyInterest: null }),
    ).toBe(1);
  });

  it("adds 1 only for a VERIFIED phone", () => {
    expect(computeQuota({ phoneVerified: 1 })).toBe(2);
    expect(computeQuota({ phoneVerified: true })).toBe(2);
    expect(computeQuota({ phoneVerified: 0 })).toBe(1); // unverified → nothing
  });

  it("adds 1 only when BOTH timeline and property of interest are present", () => {
    expect(computeQuota({ timeline: "3 months" })).toBe(1); // timeline alone → no
    expect(computeQuota({ propertyInterest: "Tampines condo" })).toBe(1); // property alone → no
    expect(
      computeQuota({ timeline: "3 months", propertyInterest: "Tampines condo" }),
    ).toBe(2);
  });

  it("reaches the max of 3 with verified phone + timeline + property", () => {
    expect(
      computeQuota({
        phoneVerified: 1,
        timeline: "3 months",
        propertyInterest: "Blk 123 Clementi",
      }),
    ).toBe(3);
    expect(MAX_QUOTA).toBe(3);
  });

  it("never exceeds MAX_QUOTA", () => {
    const q = computeQuota({
      phoneVerified: 1,
      timeline: "ASAP",
      propertyInterest: "anywhere central",
    });
    expect(q).toBeLessThanOrEqual(MAX_QUOTA);
  });

  it("ignores whitespace-only intent fields", () => {
    expect(computeQuota({ timeline: "  ", propertyInterest: "  " })).toBe(1);
    // one real, one blank → still no +1 (both are required)
    expect(computeQuota({ timeline: "3 months", propertyInterest: "   " })).toBe(1);
    expect(computeQuota({ timeline: "   ", propertyInterest: "a condo" })).toBe(1);
  });
});

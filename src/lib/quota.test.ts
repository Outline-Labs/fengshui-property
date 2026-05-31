import { describe, expect, it } from "vitest";

import { MAX_QUOTA, computeQuota } from "./quota";

// Spec (product rule): a lead earns free readings by profile completeness.
//   email only            → 1
//   + phone               → 2
//   + name AND timeline    → 3 (capped at MAX_QUOTA)
// Name or timeline alone does NOT add a credit; blank/whitespace doesn't count.
describe("computeQuota", () => {
  it("grants 1 for an email-only lead (no profile fields)", () => {
    expect(computeQuota({})).toBe(1);
    expect(computeQuota({ phone: null, name: null, timeline: null })).toBe(1);
  });

  it("adds 1 for a phone number", () => {
    expect(computeQuota({ phone: "91234567" })).toBe(2);
  });

  it("adds 1 only when BOTH name and timeline are present", () => {
    expect(computeQuota({ name: "Wei" })).toBe(1);
    expect(computeQuota({ timeline: "3 months" })).toBe(1);
    expect(computeQuota({ name: "Wei", timeline: "3 months" })).toBe(2);
  });

  it("reaches the max of 3 with phone + name + timeline", () => {
    expect(
      computeQuota({ phone: "91234567", name: "Wei", timeline: "3 months" }),
    ).toBe(3);
    expect(MAX_QUOTA).toBe(3);
  });

  it("never exceeds MAX_QUOTA", () => {
    const q = computeQuota({
      phone: "91234567",
      name: "Wei Chen",
      timeline: "ASAP",
    });
    expect(q).toBeLessThanOrEqual(MAX_QUOTA);
  });

  it("ignores whitespace-only fields", () => {
    expect(computeQuota({ phone: "   " })).toBe(1);
    expect(computeQuota({ name: "  ", timeline: "  " })).toBe(1);
    expect(computeQuota({ phone: " ", name: " ", timeline: " " })).toBe(1);
  });
});

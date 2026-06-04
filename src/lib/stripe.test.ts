import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOPUP_PACKS_CENTS, isValidTopupAmount } from "./stripe";

describe("TOPUP_PACKS_CENTS shape", () => {
  it("is exactly the 1 / 5 / 10 lead packs at S$88/lead, in cents", () => {
    // One verified lead = S$88 = 8800 cents; 5 leads = 44000; 10 leads = 88000.
    expect(TOPUP_PACKS_CENTS).toEqual([8800, 44000, 88000]);
  });
});

describe("isValidTopupAmount", () => {
  it("is true for every defined top-up pack", () => {
    for (const cents of TOPUP_PACKS_CENTS) {
      expect(isValidTopupAmount(cents)).toBe(true);
    }
  });

  it("is false for zero, negatives, and NaN", () => {
    expect(isValidTopupAmount(0)).toBe(false);
    expect(isValidTopupAmount(-8800)).toBe(false);
    expect(isValidTopupAmount(-1)).toBe(false);
    expect(isValidTopupAmount(Number.NaN)).toBe(false);
  });

  it("is false for an off-pack amount (e.g. 8801, one cent over a pack)", () => {
    expect(isValidTopupAmount(8801)).toBe(false);
    expect(isValidTopupAmount(8799)).toBe(false);
    expect(isValidTopupAmount(100)).toBe(false);
    expect(isValidTopupAmount(88001)).toBe(false);
  });
});

describe("stripeConfigured() / stripe() — STRIPE_SECRET_KEY gating", () => {
  // The Stripe client is a module-level singleton initialised from
  // STRIPE_SECRET_KEY at call time. Reset the module registry between env
  // states so each scenario starts from a clean, uninstantiated singleton.
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports unconfigured and returns null when STRIPE_SECRET_KEY is unset", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    // stubEnv with "" leaves a falsy value; delete to be unambiguous.
    delete process.env.STRIPE_SECRET_KEY;

    const mod = await import("./stripe");
    expect(mod.stripeConfigured()).toBe(false);
    expect(mod.stripe()).toBeNull();
  });

  it("reports configured and returns a non-null client when the key is set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy_key_for_tests");

    const mod = await import("./stripe");
    expect(mod.stripeConfigured()).toBe(true);

    const client = mod.stripe();
    expect(client).not.toBeNull();
  });

  it("reuses the same client instance across calls (singleton)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy_key_for_tests");

    const mod = await import("./stripe");
    const first = mod.stripe();
    const second = mod.stripe();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });
});

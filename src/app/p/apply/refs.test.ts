import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidRef } from "./refs";

afterEach(() => vi.unstubAllEnvs());

describe("isValidRef — invite-code gate", () => {
  it("fails closed when no codes are configured", () => {
    vi.stubEnv("PARTNER_INVITE_CODES", "");
    expect(isValidRef("anything")).toBe(false);
  });

  it("accepts a configured code (case-insensitive, trimmed)", () => {
    vi.stubEnv("PARTNER_INVITE_CODES", "propnex-abc123,era-def456");
    expect(isValidRef("propnex-abc123")).toBe(true);
    expect(isValidRef("  ERA-DEF456 ")).toBe(true);
  });

  it("rejects unknown / empty / nullish codes", () => {
    vi.stubEnv("PARTNER_INVITE_CODES", "propnex-abc123");
    expect(isValidRef("guess-me")).toBe(false);
    expect(isValidRef("")).toBe(false);
    expect(isValidRef(null)).toBe(false);
    expect(isValidRef(undefined)).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLoginToken, createMagicToken, readLoginToken } from "./session";

afterEach(() => {
  vi.useRealTimers();
});

// The consumer login/verification token: stateless HMAC `login:<id>:<exp>`,
// namespaced so an agent magic token can never mint a consumer session.
describe("createLoginToken / readLoginToken", () => {
  it("round-trips a leadId within the 15-min TTL", () => {
    const t = createLoginToken("lead-abc");
    expect(readLoginToken(t)).toBe("lead-abc");
  });

  it("rejects an expired token (past the TTL)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const t = createLoginToken("lead-1");
    vi.setSystemTime(new Date("2026-01-01T00:16:00Z")); // 16 min later
    expect(readLoginToken(t)).toBeNull();
  });

  it("rejects a tampered token (bad signature)", () => {
    const t = createLoginToken("lead-1");
    expect(readLoginToken(t + "x")).toBeNull();
    expect(readLoginToken(t.replace("lead-1", "lead-2"))).toBeNull();
  });

  it("rejects an agent magic token — namespace isolation", () => {
    // Agent token is `<agentId>:<exp>` with no "login:" prefix; it must NOT be
    // accepted as a consumer login token.
    expect(readLoginToken(createMagicToken("agent-1"))).toBeNull();
  });

  it("rejects empty / junk input", () => {
    expect(readLoginToken("")).toBeNull();
    expect(readLoginToken("not-a-token")).toBeNull();
  });
});

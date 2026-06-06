import { afterEach, describe, expect, it, vi } from "vitest";

// session.ts imports `next/headers` at module load for the cookie helpers.
// We don't exercise cookies here (only the pure magic-token functions), so a
// light stub lets the module import under Node.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { createMagicToken, readMagicToken } = await import("./session");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("SESSION_SECRET — fail closed in production", () => {
  it("throws (never uses the insecure dev fallback) when unset in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => createMagicToken("a")).toThrow(/SESSION_SECRET/);
  });

  it("uses the configured secret in production when set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "a-real-production-secret");
    expect(() => createMagicToken("a")).not.toThrow();
  });
});

describe("magic sign-in tokens", () => {
  it("round-trips a valid token back to its agent id", () => {
    const token = createMagicToken("agent-123");
    expect(readMagicToken(token)).toBe("agent-123");
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const token = createMagicToken("agent-123");
    // Flip the agent id while keeping the original signature.
    const tampered = token.replace("agent-123", "agent-999");
    expect(readMagicToken(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = createMagicToken("agent-123");
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(readMagicToken(tampered)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(readMagicToken("")).toBeNull();
    expect(readMagicToken("no-signature")).toBeNull();
    expect(readMagicToken("missing.colon.in.payload")).toBeNull();
  });

  it("rejects an expired token (past the 15-minute TTL)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createMagicToken("agent-123");
    expect(readMagicToken(token)).toBe("agent-123"); // still valid now

    vi.advanceTimersByTime(16 * 60 * 1000); // +16 min
    expect(readMagicToken(token)).toBeNull(); // expired
  });
});

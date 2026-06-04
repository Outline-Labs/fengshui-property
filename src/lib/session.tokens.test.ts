import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// session.ts calls `cookies()` from next/headers for its cookie helpers. We
// back the mock with a mutable in-memory store so we can assert on what the
// helpers set/get/delete. Each test resets the store in beforeEach.
type CookieEntry = { value: string; opts?: Record<string, unknown> };
const store = new Map<string, CookieEntry>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = store.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, opts?: Record<string, unknown>) => {
      store.set(name, { value, opts });
    },
    delete: (name: string) => {
      store.delete(name);
    },
  }),
}));

const {
  createMagicToken,
  readMagicToken,
  createSession,
  getLeadId,
  destroySession,
  createAgentSession,
  getAgentId,
  destroyAgentSession,
} = await import("./session");

// The signing scheme in session.ts: `${value}.${base64url(hmac-sha256(value))}`
// keyed by SESSION_SECRET (set deterministically in test/setup.ts). We recreate
// it here so we can forge "validly signed" payloads to probe the parser, and
// confirm cookies carry the signed (not raw) value.
const SECRET = "test-secret-do-not-use-in-prod";
function sign(value: string): string {
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(value)
    .digest("base64url");
  return `${value}.${sig}`;
}

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session secret wiring", () => {
  it("test/setup.ts provides the deterministic non-default secret", () => {
    // Sanity check: if this drifts, the forged-token assertions below are
    // meaningless, so assert it explicitly.
    expect(process.env.SESSION_SECRET).toBe(SECRET);
  });
});

describe("createMagicToken / readMagicToken", () => {
  it("round-trips a fresh token back to its agent id", () => {
    const token = createMagicToken("agent-abc");
    expect(readMagicToken(token)).toBe("agent-abc");
  });

  it("preserves agent ids that themselves contain colons", () => {
    // Parser splits the payload on the LAST colon, so the expiry stays distinct
    // from an agent id like "ns:tenant:42".
    const token = createMagicToken("ns:tenant:42");
    expect(readMagicToken(token)).toBe("ns:tenant:42");
  });

  it("returns null for an expired token (past the 15-minute TTL)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T00:00:00Z"));
    const token = createMagicToken("agent-abc");
    expect(readMagicToken(token)).toBe("agent-abc"); // valid right now

    vi.advanceTimersByTime(15 * 60 * 1000 + 1); // just past the TTL
    expect(readMagicToken(token)).toBeNull();
  });

  it("returns null for a token whose crafted expiry is already in the past", () => {
    // Craft a validly-signed payload with an expiry timestamp before now.
    const pastExpiry = Date.now() - 1000;
    const forged = sign(`agent-abc:${pastExpiry}`);
    expect(readMagicToken(forged)).toBeNull();
  });

  it("returns null when the signature is tampered", () => {
    const token = createMagicToken("agent-abc");
    const lastChar = token.endsWith("A") ? "B" : "A";
    const tampered = `${token.slice(0, -1)}${lastChar}`;
    expect(readMagicToken(tampered)).toBeNull();
  });

  it("returns null when the payload is tampered but the old signature is kept", () => {
    const token = createMagicToken("agent-abc");
    const tampered = token.replace("agent-abc", "agent-evil");
    expect(readMagicToken(tampered)).toBeNull();
  });

  it("returns null for a validly-signed payload that has no colon", () => {
    // Signature verifies, but the payload lacks the agentId:expiry structure.
    const forged = sign("no-colon-here");
    expect(readMagicToken(forged)).toBeNull();
  });

  it("returns null for a validly-signed payload with a non-numeric expiry", () => {
    const forged = sign("agent-abc:not-a-number");
    expect(readMagicToken(forged)).toBeNull();
  });

  it("returns null for a validly-signed payload with an empty agent id", () => {
    const forged = sign(`:${Date.now() + 60_000}`);
    expect(readMagicToken(forged)).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(readMagicToken("")).toBeNull();
    expect(readMagicToken("no-separator-dot")).toBeNull();
  });
});

describe("lead session cookie (fs_session)", () => {
  it("sets the signed lead id under the fs_session cookie", async () => {
    await createSession("lead-1");
    const entry = store.get("fs_session");
    expect(entry).toBeDefined();
    // Stored value must be signed, not the raw lead id.
    expect(entry?.value).toBe(sign("lead-1"));
    expect(entry?.value).not.toBe("lead-1");
  });

  it("marks the cookie httpOnly, lax, path / (and not secure outside production)", async () => {
    await createSession("lead-1");
    const opts = store.get("fs_session")?.opts;
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    // NODE_ENV is unset in tests, so secure resolves false.
    expect(opts?.secure).toBe(false);
  });

  it("round-trips the lead id back through getLeadId", async () => {
    await createSession("lead-42");
    expect(await getLeadId()).toBe("lead-42");
  });

  it("returns null from getLeadId when no cookie is present", async () => {
    expect(await getLeadId()).toBeNull();
  });

  it("returns null from getLeadId for a forged/tampered cookie value", async () => {
    store.set("fs_session", { value: `lead-42.${"x".repeat(43)}` });
    expect(await getLeadId()).toBeNull();
  });

  it("does not leak the lead id across cookie names", async () => {
    await createSession("lead-1");
    // The agent cookie must be untouched.
    expect(store.has("fs_agent")).toBe(false);
    expect(await getAgentId()).toBeNull();
  });

  it("removes the fs_session cookie on destroySession", async () => {
    await createSession("lead-1");
    expect(store.has("fs_session")).toBe(true);
    await destroySession();
    expect(store.has("fs_session")).toBe(false);
    expect(await getLeadId()).toBeNull();
  });
});

describe("agent session cookie (fs_agent)", () => {
  it("sets the signed agent id under the fs_agent cookie", async () => {
    await createAgentSession("agent-1");
    const entry = store.get("fs_agent");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe(sign("agent-1"));
    expect(entry?.value).not.toBe("agent-1");
  });

  it("marks the cookie httpOnly, lax, path / (and not secure outside production)", async () => {
    await createAgentSession("agent-1");
    const opts = store.get("fs_agent")?.opts;
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    expect(opts?.secure).toBe(false);
  });

  it("round-trips the agent id back through getAgentId", async () => {
    await createAgentSession("agent-99");
    expect(await getAgentId()).toBe("agent-99");
  });

  it("returns null from getAgentId when no cookie is present", async () => {
    expect(await getAgentId()).toBeNull();
  });

  it("returns null from getAgentId for a forged/tampered cookie value", async () => {
    store.set("fs_agent", { value: `agent-99.${"x".repeat(43)}` });
    expect(await getAgentId()).toBeNull();
  });

  it("does not leak the agent id across cookie names", async () => {
    await createAgentSession("agent-1");
    expect(store.has("fs_session")).toBe(false);
    expect(await getLeadId()).toBeNull();
  });

  it("removes the fs_agent cookie on destroyAgentSession", async () => {
    await createAgentSession("agent-1");
    expect(store.has("fs_agent")).toBe(true);
    await destroyAgentSession();
    expect(store.has("fs_agent")).toBe(false);
    expect(await getAgentId()).toBeNull();
  });
});

describe("unsign byte-length safety (forged multibyte signatures)", () => {
  // A base64url HMAC-SHA256 signature is 43 ASCII chars = 43 bytes. A forged
  // signature of 43 MULTIBYTE chars has the SAME char length but a LARGER byte
  // length. unsign must still reject it as invalid — NOT crash the request.
  // (crypto.timingSafeEqual throws RangeError on unequal byte lengths, and the
  // callers have no try/catch, so a char-length-only guard turns a forged
  // cookie into a 500 — an unauthenticated DoS vector.)
  const multibyteSig = "é".repeat(43); // 43 chars, 86 UTF-8 bytes

  it("getLeadId returns null (does not throw) for a multibyte-signature cookie", async () => {
    store.set("fs_session", { value: `lead-42.${multibyteSig}` });
    await expect(getLeadId()).resolves.toBeNull();
  });

  it("getAgentId returns null (does not throw) for a multibyte-signature cookie", async () => {
    store.set("fs_agent", { value: `agent-99.${multibyteSig}` });
    await expect(getAgentId()).resolves.toBeNull();
  });

  it("readMagicToken returns null (does not throw) for a multibyte-signature token", () => {
    const token = `agent-abc:${Date.now() + 60_000}.${multibyteSig}`;
    expect(() => readMagicToken(token)).not.toThrow();
    expect(readMagicToken(token)).toBeNull();
  });
});

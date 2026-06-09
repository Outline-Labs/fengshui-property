import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import { analyses, leads } from "./db/schema";
import {
  finalizeReading,
  releaseReading,
  reserveReading,
  requestOtp,
  verifyOtp,
  upsertLead,
  verifyOtpAndRequestAgent,
} from "./leads";

async function freshLead(profile: Parameters<typeof upsertLead>[0]) {
  const id = await upsertLead(profile);
  // Email verification is the precondition for any reading credit, so the
  // quota / reserve specs below operate on a verified lead.
  await db.update(leads).set({ emailVerified: 1 }).where(eq(leads.id, id));
  return id;
}

beforeEach(async () => {
  await ensureSchema();
  await db.delete(analyses);
  await db.delete(leads);
});

// ---------------------------------------------------------------------------
// Quota must be enforced ATOMICALLY. The verification keystone is the OTP; the
// cost guard is the reading quota. A lead must never get more readings than
// computeQuota allows — even if they fire concurrent uploads (each upload is a
// paid Kimi call, so a TOCTOU race is a direct cost leak).
// ---------------------------------------------------------------------------
describe("reading credits — atomic quota enforcement", () => {
  it("refuses to reserve for an UNVERIFIED-email lead (no credit before verification)", async () => {
    const id = await upsertLead({ email: "unverified@test.sg" }); // email NOT verified
    const r = await reserveReading(id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("verify_email");
    // nothing was reserved — the paid path never opens
    expect(await db.select().from(analyses)).toHaveLength(0);
  });

  it("lets an email-only lead (quota 1) reserve exactly once", async () => {
    const id = await freshLead({ email: "a@test.sg" });
    const first = await reserveReading(id);
    expect(first.ok).toBe(true);
    const second = await reserveReading(id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("out_of_credits");
  });

  it("never grants more than the quota under concurrency (the cost-leak race)", async () => {
    // quota 2: email + verified phone
    const id = await freshLead({ email: "b@test.sg", phone: "91234567" });
    await db.update(leads).set({ phoneVerified: 1 }).where(eq(leads.id, id));
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserveReading(id)),
    );
    const granted = results.filter((r) => r.ok).length;
    expect(granted).toBe(2);

    const rows = await db.select().from(analyses);
    expect(rows).toHaveLength(2);
  });

  it("releases a reservation (refund) when the analysis fails", async () => {
    const id = await freshLead({ email: "c@test.sg" }); // quota 1
    const r = await reserveReading(id);
    expect(r.ok).toBe(true);
    if (r.ok) await releaseReading(r.id);
    // After refund, the single credit is available again.
    const retry = await reserveReading(id);
    expect(retry.ok).toBe(true);
  });

  it("finalize records the score on the reserved reading", async () => {
    const id = await freshLead({ email: "d@test.sg" });
    const r = await reserveReading(id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      await finalizeReading(r.id, "S", 72);
      const rows = await db.select().from(analyses);
      expect(rows[0]?.score).toBe(72);
      expect(rows[0]?.facing).toBe("S");
    }
  });
});

// ---------------------------------------------------------------------------
// Phone verification runs through Twilio Verify — Twilio owns the code
// (generation, expiry, attempt limits). Our job is to (a) validate the SG
// number, (b) start a verification, (c) flip the sellable flags only when
// Twilio reports the code "approved". A missing config must fail closed in
// production (no bypass), while dev/test use a fixed "000000" fallback.
// ---------------------------------------------------------------------------
describe("phone verification (Twilio Verify) — dev fallback", () => {
  it("rejects an invalid SG mobile before starting verification", async () => {
    const id = await freshLead({ email: "e@test.sg" });
    expect((await requestOtp(id, "12345")).ok).toBe(false);
  });

  it("starts verification, stores the normalised phone, returns the dev code", async () => {
    const id = await freshLead({ email: "f@test.sg" });
    const otp = await requestOtp(id, "9123 4567");
    expect(otp.ok).toBe(true);
    expect(otp.ok && otp.devCode).toBe("000000");
    expect((await db.select().from(leads))[0]?.phone).toBe("91234567");
  });

  it("verifies on the right code and flips the sellable flags", async () => {
    const id = await freshLead({ email: "g@test.sg" });
    await requestOtp(id, "98765432");
    expect((await verifyOtpAndRequestAgent(id, "000000")).ok).toBe(true);
    const row = (await db.select().from(leads))[0];
    expect(row?.phoneVerified).toBe(1);
    expect(row?.wantsAgent).toBe(1);
  });

  it("consumer verifyOtp verifies the phone WITHOUT flagging wantsAgent", async () => {
    const id = await freshLead({ email: "g2@test.sg" });
    await requestOtp(id, "98765432");
    expect((await verifyOtp(id, "000000")).ok).toBe(true);
    const row = (await db.select().from(leads))[0];
    expect(row?.phoneVerified).toBe(1);
    expect(row?.wantsAgent).toBe(0); // consumer flow — agent surface untouched
  });

  it("rejects a wrong code and leaves the lead unsellable", async () => {
    const id = await freshLead({ email: "h@test.sg" });
    await requestOtp(id, "98765432");
    expect((await verifyOtpAndRequestAgent(id, "123456")).ok).toBe(false);
    expect((await db.select().from(leads))[0]?.phoneVerified).toBe(0);
  });

  it("won't verify before a code was requested (no phone on the lead)", async () => {
    const id = await freshLead({ email: "i@test.sg" });
    expect((await verifyOtpAndRequestAgent(id, "000000")).ok).toBe(false);
  });
});

describe("phone verification (Twilio Verify) — API wiring (mocked)", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VAtest");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calls the Verify service and does NOT leak a dev code", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "pending" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const id = await freshLead({ email: "j@test.sg" });
    const otp = await requestOtp(id, "91234567");
    expect(otp.ok).toBe(true);
    expect(otp.ok && otp.devCode).toBeUndefined();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/Services/VAtest/Verifications",
    );
  });

  it("approves only when Twilio returns status=approved", async () => {
    const id = await freshLead({ email: "k@test.sg" });
    await db.update(leads).set({ phone: "91234567" }).where(eq(leads.id, id));

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
      ),
    );
    expect((await verifyOtpAndRequestAgent(id, "424242")).ok).toBe(true);
  });

  it("rejects a non-approved status from Twilio", async () => {
    const id = await freshLead({ email: "l@test.sg" });
    await db.update(leads).set({ phone: "91234567" }).where(eq(leads.id, id));

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "pending" }), { status: 200 }),
      ),
    );
    expect((await verifyOtpAndRequestAgent(id, "000000")).ok).toBe(false);
  });
});

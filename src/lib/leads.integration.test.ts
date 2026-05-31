import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureSchema } from "./db";
import { analyses, leads } from "./db/schema";
import {
  finalizeReading,
  releaseReading,
  reserveReading,
  requestOtp,
  upsertLead,
  verifyOtpAndRequestAgent,
} from "./leads";

async function freshLead(profile: Parameters<typeof upsertLead>[0]) {
  return upsertLead(profile);
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
  it("lets an email-only lead (quota 1) reserve exactly once", async () => {
    const id = await freshLead({ email: "a@test.sg" });
    const first = await reserveReading(id);
    expect(first.ok).toBe(true);
    const second = await reserveReading(id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("out_of_credits");
  });

  it("never grants more than the quota under concurrency (the cost-leak race)", async () => {
    // quota 2: email + phone
    const id = await freshLead({ email: "b@test.sg", phone: "91234567" });
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
// The OTP gate is the anti-fraud keystone of the whole marketplace, so it must
// resist brute force: a bounded number of wrong guesses, after which the code
// is invalidated and a new one must be requested.
// ---------------------------------------------------------------------------
describe("OTP verification — brute-force resistance", () => {
  it("locks the code after too many wrong attempts (even the right code then fails)", async () => {
    const id = await freshLead({ email: "e@test.sg" });
    const otp = await requestOtp(id, "91234567");
    expect(otp.ok).toBe(true);
    const code = otp.ok ? otp.devCode! : "";
    expect(code).toMatch(/^\d{6}$/);

    // Hammer with wrong guesses.
    for (let i = 0; i < 6; i++) {
      const wrong = await verifyOtpAndRequestAgent(id, "000000");
      expect(wrong.ok).toBe(false);
    }
    // The correct code must no longer work — the lead has to request a new one.
    const afterLock = await verifyOtpAndRequestAgent(id, code);
    expect(afterLock.ok).toBe(false);
  });

  it("verifies on the correct code within the attempt budget", async () => {
    const id = await freshLead({ email: "f@test.sg" });
    const otp = await requestOtp(id, "98765432");
    const code = otp.ok ? otp.devCode! : "";
    await verifyOtpAndRequestAgent(id, "111111"); // one wrong try
    const ok = await verifyOtpAndRequestAgent(id, code);
    expect(ok.ok).toBe(true);

    const row = (await db.select().from(leads))[0];
    expect(row?.phoneVerified).toBe(1);
    expect(row?.wantsAgent).toBe(1);
  });

  it("issues 6-digit codes (incl. leading zeros) from a CSPRNG range", async () => {
    const id = await freshLead({ email: "g@test.sg" });
    for (let i = 0; i < 20; i++) {
      const otp = await requestOtp(id, "91110000");
      expect(otp.ok && otp.devCode).toMatch(/^\d{6}$/);
    }
  });
});

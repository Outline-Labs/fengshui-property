import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import { analyses, leads } from "./db/schema";
import {
  finalizeReading,
  getCredits,
  getLead,
  normalizeSgMobile,
  releaseReading,
  reserveReading,
  upsertLead,
} from "./leads";

beforeEach(async () => {
  await ensureSchema();
  await db.delete(analyses);
  await db.delete(leads);
});

// A lead that has cleared email verification — the precondition for any credit.
// The getCredits / reserve specs below use this; the unverified case is tested
// explicitly.
async function verifiedLead(profile: Parameters<typeof upsertLead>[0]) {
  const id = await upsertLead(profile);
  await db.update(leads).set({ emailVerified: 1 }).where(eq(leads.id, id));
  return id;
}

// ---------------------------------------------------------------------------
// upsertLead is the single entry point for a lead's profile. It must:
//   • create a brand-new lead with a stable UUID id,
//   • key on the (lowercased) email so the same person is one row,
//   • MERGE new info without ever destroying info we already captured
//     (a later, sparser form submit must never blank out an earlier value).
// These are the profile-quality guarantees the whole quota ladder rests on.
// ---------------------------------------------------------------------------
describe("upsertLead — create, key-by-email, non-destructive merge", () => {
  it("creates a new lead and returns a UUID id with the stored fields", async () => {
    const id = await upsertLead({
      email: "new@test.sg",
      name: "Alice",
      phone: "91234567",
      propertyInterest: "condo",
      timeline: "3 months",
    });

    // A real RFC-4122 v4 UUID (crypto.randomUUID), not an empty/placeholder id.
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const lead = await getLead(id);
    expect(lead).not.toBeNull();
    expect(lead?.id).toBe(id);
    expect(lead?.email).toBe("new@test.sg");
    expect(lead?.name).toBe("Alice");
    expect(lead?.phone).toBe("91234567");
    expect(lead?.propertyInterest).toBe("condo");
    expect(lead?.timeline).toBe("3 months");
  });

  it("lowercases and trims the email so the same person is one row", async () => {
    const id1 = await upsertLead({ email: "  Person@Test.SG  " });
    const lead = await getLead(id1);
    expect(lead?.email).toBe("person@test.sg");

    // Re-submitting with different casing/whitespace resolves to the same row.
    const id2 = await upsertLead({ email: "PERSON@test.sg" });
    expect(id2).toBe(id1);
    expect(await db.select().from(leads)).toHaveLength(1);
  });

  it("returns the same id and merges newly-supplied fields on a second call", async () => {
    const id1 = await upsertLead({ email: "merge@test.sg", name: "Bob" });
    const id2 = await upsertLead({
      email: "merge@test.sg",
      phone: "98765432",
      timeline: "ASAP",
    });

    expect(id2).toBe(id1);
    const lead = await getLead(id1);
    expect(lead?.name).toBe("Bob"); // kept from first call
    expect(lead?.phone).toBe("98765432"); // added by second call
    expect(lead?.timeline).toBe("ASAP"); // added by second call
    expect(await db.select().from(leads)).toHaveLength(1);
  });

  it("never nulls an existing value when a later call omits it (undefined)", async () => {
    const id = await upsertLead({
      email: "keep@test.sg",
      name: "Carol",
      phone: "91110000",
      propertyInterest: "landed",
      timeline: "this year",
    });

    // A sparse follow-up (only email) must preserve everything captured before.
    await upsertLead({ email: "keep@test.sg" });

    const lead = await getLead(id);
    expect(lead?.name).toBe("Carol");
    expect(lead?.phone).toBe("91110000");
    expect(lead?.propertyInterest).toBe("landed");
    expect(lead?.timeline).toBe("this year");
  });

  it("never nulls an existing value when a later call passes null", async () => {
    const id = await upsertLead({
      email: "null@test.sg",
      name: "Dan",
      phone: "92220000",
    });

    await upsertLead({ email: "null@test.sg", name: null, phone: null });

    const lead = await getLead(id);
    expect(lead?.name).toBe("Dan");
    expect(lead?.phone).toBe("92220000");
  });

  it("treats a whitespace-only field as 'not provided' and preserves the prior value", async () => {
    const id = await upsertLead({ email: "ws@test.sg", name: "Eve" });

    await upsertLead({ email: "ws@test.sg", name: "   " });

    const lead = await getLead(id);
    expect(lead?.name).toBe("Eve");
  });

  it("trims a provided value before storing it", async () => {
    const id = await upsertLead({ email: "trim@test.sg", name: "  Frank  " });
    expect((await getLead(id))?.name).toBe("Frank");
  });

  it("stores optional fields as null (not empty string) when never provided", async () => {
    const id = await upsertLead({ email: "sparse@test.sg" });
    const lead = await getLead(id);
    expect(lead?.name).toBeNull();
    expect(lead?.phone).toBeNull();
    expect(lead?.propertyInterest).toBeNull();
    expect(lead?.timeline).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getLead is the read primitive every other flow leans on.
// ---------------------------------------------------------------------------
describe("getLead", () => {
  it("returns null for an id that does not exist", async () => {
    expect(await getLead("does-not-exist")).toBeNull();
  });

  it("returns the matching lead row by id", async () => {
    const id = await upsertLead({ email: "read@test.sg", name: "Grace" });
    const lead = await getLead(id);
    expect(lead?.id).toBe(id);
    expect(lead?.email).toBe("read@test.sg");
    // Defaults for an unverified, unsold lead.
    expect(lead?.phoneVerified).toBe(0);
    expect(lead?.wantsAgent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeSgMobile is the gate before we ever spend on an SMS. It must accept
// the real shapes a Singapore user types (+65 / 65 / spaces) and reject
// anything that isn't a valid local mobile (8-digit, starts 8 or 9).
// ---------------------------------------------------------------------------
describe("normalizeSgMobile", () => {
  it("accepts a bare 8-prefixed 8-digit mobile", () => {
    expect(normalizeSgMobile("81234567")).toBe("81234567");
  });

  it("accepts a bare 9-prefixed 8-digit mobile", () => {
    expect(normalizeSgMobile("91234567")).toBe("91234567");
  });

  it("strips a +65 country code", () => {
    expect(normalizeSgMobile("+6591234567")).toBe("91234567");
  });

  it("strips a bare 65 country code", () => {
    expect(normalizeSgMobile("6591234567")).toBe("91234567");
  });

  it("strips spaces (and a +65 prefix with spacing)", () => {
    expect(normalizeSgMobile("9123 4567")).toBe("91234567");
    expect(normalizeSgMobile("+65 9123 4567")).toBe("91234567");
  });

  it("rejects a number that is too short", () => {
    expect(normalizeSgMobile("12345")).toBeNull();
  });

  it("rejects a number that is too long", () => {
    expect(normalizeSgMobile("912345678")).toBeNull();
  });

  it("rejects an 8-digit number not starting with 8 or 9 (landline/invalid)", () => {
    expect(normalizeSgMobile("61234567")).toBeNull();
    expect(normalizeSgMobile("71234567")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeSgMobile("")).toBeNull();
  });

  it("rejects non-digit junk", () => {
    expect(normalizeSgMobile("not-a-phone")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCredits exposes the quota ladder to the UI: quota (from profile
// completeness), used (reservations made), and remaining (clamped at 0).
// ---------------------------------------------------------------------------
describe("getCredits — quota / used / remaining math", () => {
  it("returns all zeros and a null lead for an unknown id", async () => {
    const c = await getCredits("nobody");
    expect(c).toEqual({
      lead: null,
      quota: 0,
      freeQuota: 0,
      bonusReadings: 0,
      used: 0,
      remaining: 0,
    });
  });

  it("UNVERIFIED email → 0 spendable credit regardless of profile (potential still reported)", async () => {
    // A full profile + verified phone, but the EMAIL isn't verified → no credit.
    const id = await upsertLead({
      email: "unverified@test.sg",
      phone: "91234567",
      name: "Ivy",
      timeline: "soon",
      propertyInterest: "Tampines condo",
    });
    await db.update(leads).set({ phoneVerified: 1 }).where(eq(leads.id, id));
    const c = await getCredits(id);
    expect(c.quota).toBe(0);
    expect(c.remaining).toBe(0);
    // freeQuota still reports what verifying WOULD unlock — drives the UI prompt.
    expect(c.freeQuota).toBe(3);
  });

  it("verified email-only lead → quota 1, nothing used yet", async () => {
    const id = await verifiedLead({ email: "q1@test.sg" });
    const c = await getCredits(id);
    expect(c.lead?.id).toBe(id);
    expect(c.quota).toBe(1);
    expect(c.used).toBe(0);
    expect(c.remaining).toBe(1);
  });

  it("verified email + UNVERIFIED phone lead → quota 1 (a number alone no longer counts)", async () => {
    const id = await verifiedLead({ email: "q2u0@test.sg", phone: "91234567" });
    const c = await getCredits(id);
    expect(c.quota).toBe(1);
  });

  it("verified email + VERIFIED phone lead → quota 2", async () => {
    const id = await verifiedLead({ email: "q2@test.sg", phone: "91234567" });
    await db.update(leads).set({ phoneVerified: 1 }).where(eq(leads.id, id));
    const c = await getCredits(id);
    expect(c.quota).toBe(2);
    expect(c.remaining).toBe(2);
  });

  it("verified email + verified phone + timeline + property → quota 3 (capped)", async () => {
    const id = await verifiedLead({
      email: "q3@test.sg",
      phone: "91234567",
      name: "Helen",
      timeline: "2 months",
      propertyInterest: "a 3-bedder in Bishan",
    });
    await db.update(leads).set({ phoneVerified: 1 }).where(eq(leads.id, id));
    const c = await getCredits(id);
    expect(c.quota).toBe(3);
    expect(c.remaining).toBe(3);
  });

  it("reflects used and remaining after a reservation", async () => {
    const id = await verifiedLead({ email: "q2u@test.sg", phone: "91234567" });
    await db.update(leads).set({ phoneVerified: 1 }).where(eq(leads.id, id)); // → quota 2
    const r = await reserveReading(id);
    expect(r.ok).toBe(true);

    const c = await getCredits(id);
    expect(c.quota).toBe(2);
    expect(c.used).toBe(1);
    expect(c.remaining).toBe(1);
  });

  it("clamps remaining at 0 and never reports negative once the quota is spent", async () => {
    const id = await verifiedLead({ email: "spent@test.sg" }); // quota 1
    expect((await reserveReading(id)).ok).toBe(true);
    // A second reserve is refused, so used stays at the quota, not above it.
    expect((await reserveReading(id)).ok).toBe(false);

    const c = await getCredits(id);
    expect(c.quota).toBe(1);
    expect(c.used).toBe(1);
    expect(c.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// finalizeReading writes the analysis result onto a reservation; releaseReading
// refunds (deletes) a reservation so the credit is reusable. Together they make
// a failed paid call cost the lead nothing.
// ---------------------------------------------------------------------------
describe("finalizeReading & releaseReading", () => {
  it("finalize records facing + score onto the reserved reading without spending a new credit", async () => {
    const id = await verifiedLead({ email: "fin@test.sg" }); // quota 1
    const r = await reserveReading(id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    await finalizeReading(r.id, "SE", 88);

    const rows = await db.select().from(analyses).where(eq(analyses.id, r.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.facing).toBe("SE");
    expect(rows[0]?.score).toBe(88);
    // Finalize must not consume an extra credit.
    expect((await getCredits(id)).used).toBe(1);
  });

  it("release deletes the reservation and frees the credit for reuse", async () => {
    const id = await verifiedLead({ email: "rel@test.sg" }); // quota 1
    const r = await reserveReading(id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Before refund: the single credit is spent.
    expect((await getCredits(id)).used).toBe(1);
    expect((await getCredits(id)).remaining).toBe(0);

    await releaseReading(r.id);

    // The reservation row is gone and the credit is available again.
    expect(await db.select().from(analyses).where(eq(analyses.id, r.id))).toHaveLength(0);
    const c = await getCredits(id);
    expect(c.used).toBe(0);
    expect(c.remaining).toBe(1);
    expect((await reserveReading(id)).ok).toBe(true);
  });

  it("releasing one of several reservations frees exactly one credit", async () => {
    // quota 2: email + verified phone
    const id = await verifiedLead({ email: "rel2@test.sg", phone: "91234567" });
    await db.update(leads).set({ phoneVerified: 1 }).where(eq(leads.id, id));
    const r1 = await reserveReading(id);
    const r2 = await reserveReading(id);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // Quota exhausted.
    expect((await reserveReading(id)).ok).toBe(false);

    await releaseReading(r1.id);

    const c = await getCredits(id);
    expect(c.used).toBe(1);
    expect(c.remaining).toBe(1);
    // Exactly one credit freed → exactly one more reserve succeeds.
    expect((await reserveReading(id)).ok).toBe(true);
    expect((await reserveReading(id)).ok).toBe(false);
  });
});

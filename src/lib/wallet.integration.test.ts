import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureSchema } from "./db";
import { agents, walletTransactions } from "./db/schema";
import { creditWallet, getWallet } from "./wallet";

async function makeAgent(id: string, balanceCents = 0) {
  await db.insert(agents).values({
    id,
    email: `${id}@era.sg`,
    name: id,
    agency: "Test",
    resNo: null,
    territories: null,
    status: "approved",
    referredBy: null,
    balanceCents,
    createdAt: Date.now(),
  });
}

beforeEach(async () => {
  await ensureSchema();
  await db.delete(walletTransactions);
  await db.delete(agents);
});

// ---------------------------------------------------------------------------
// The wallet is money. Two invariants matter most: (1) a top-up credits the
// balance exactly once even if Stripe redelivers the webhook, and (2) the
// append-only ledger always reconciles with the cached balance. The UNIQUE(ref)
// constraint is the idempotency key that enforces (1).
// ---------------------------------------------------------------------------
describe("creditWallet — top-ups credit the wallet exactly once", () => {
  it("increases the balance and writes a single topup ledger row", async () => {
    await makeAgent("a1");

    const r = await creditWallet({
      agentId: "a1",
      amountCents: 44000,
      ref: "cs_test_1",
      kind: "topup",
    });

    expect(r.deduped).toBe(false);
    expect(r.balanceCents).toBe(44000);
    expect((await getWallet("a1")).balanceCents).toBe(44000);

    const rows = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.agentId, "a1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("topup");
    expect(rows[0].amountCents).toBe(44000);
    expect(rows[0].balanceAfter).toBe(44000);
    expect(rows[0].ref).toBe("cs_test_1");
  });

  it("is idempotent on a duplicate ref (webhook redelivery credits once)", async () => {
    await makeAgent("a1", 10000);

    const first = await creditWallet({
      agentId: "a1",
      amountCents: 44000,
      ref: "cs_dup",
      kind: "topup",
    });
    const second = await creditWallet({
      agentId: "a1",
      amountCents: 44000,
      ref: "cs_dup",
      kind: "topup",
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    // 10000 + 44000 once — NOT 98000.
    expect((await getWallet("a1")).balanceCents).toBe(54000);
    const rows = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.ref, "cs_dup"));
    expect(rows).toHaveLength(1);
  });

  it("credits via the dev top-up ref (offline, no Stripe keys)", async () => {
    await makeAgent("a1");
    // Each dev top-up gets its own dev:<uuid> ref, so they don't dedupe.
    const r1 = await creditWallet({ agentId: "a1", amountCents: 8800, ref: "dev:abc", kind: "topup" });
    const r2 = await creditWallet({ agentId: "a1", amountCents: 8800, ref: "dev:def", kind: "topup" });

    expect(r1.deduped).toBe(false);
    expect(r2.deduped).toBe(false);
    expect((await getWallet("a1")).balanceCents).toBe(17600);
  });

  it("keeps the ledger sum reconciled with the cached balance", async () => {
    await makeAgent("a1");
    await creditWallet({ agentId: "a1", amountCents: 44000, ref: "r1", kind: "topup" });
    await creditWallet({ agentId: "a1", amountCents: 8800, ref: "r2", kind: "topup" });

    const rows = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.agentId, "a1"));
    const sum = rows.reduce((s, r) => s + r.amountCents, 0);
    expect(sum).toBe((await getWallet("a1")).balanceCents);
  });
});

describe("getWallet", () => {
  it("returns a zero balance for an unknown agent", async () => {
    expect((await getWallet("nope")).balanceCents).toBe(0);
  });
});

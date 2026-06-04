import "server-only";

import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import { agents, walletTransactions } from "./db/schema";

// libsql surfaces constraint failures as errors whose message names the
// constraint. We use them as control flow: UNIQUE(ref) ⇒ a credit was already
// applied (idempotent dedupe); UNIQUE(claims.lead_id) ⇒ a lead was already
// claimed; CHECK(balance_cents >= 0) ⇒ a debit would overdraw. A failing
// statement aborts and rolls back its whole db.batch, so these are safe to
// catch after the fact.
export function isUniqueViolation(e: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));
}
export function isCheckViolation(e: unknown): boolean {
  return /CHECK constraint failed/i.test(String((e as Error)?.message ?? e));
}

export async function getWallet(
  agentId: string,
): Promise<{ balanceCents: number }> {
  await ensureSchema();
  const r = await db
    .select({ balanceCents: agents.balanceCents })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return { balanceCents: r[0]?.balanceCents ?? 0 };
}

export type CreditResult = { deduped: boolean; balanceCents: number };

/**
 * Credit an agent's wallet (a Stripe top-up, or a refund). `ref` is the
 * idempotency key — the Stripe Checkout Session id for top-ups (so a redelivered
 * webhook can't double-credit) and a unique `dev:<uuid>` for the offline dev
 * top-up. The ledger insert and the balance bump run in one atomic db.batch; the
 * UNIQUE(ref) on the ledger aborts (and rolls back) a duplicate, in which case
 * we report `deduped` and leave the balance unchanged.
 */
export async function creditWallet(p: {
  agentId: string;
  amountCents: number;
  ref: string;
  kind: "topup" | "refund";
}): Promise<CreditResult> {
  await ensureSchema();

  const exists = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, p.agentId))
    .limit(1);
  if (!exists[0]) throw new Error(`creditWallet: unknown agent ${p.agentId}`);

  const now = Date.now();
  try {
    await db.batch([
      // Ledger first: its UNIQUE(ref) is the dedupe gate, so a duplicate aborts
      // the batch before the balance is touched. balance_after is the post-credit
      // balance (current + amount), matching the UPDATE that follows.
      db.insert(walletTransactions).values({
        id: crypto.randomUUID(),
        agentId: p.agentId,
        amountCents: p.amountCents,
        kind: p.kind,
        ref: p.ref,
        balanceAfter: sql`(SELECT ${agents.balanceCents} FROM ${agents} WHERE ${agents.id} = ${p.agentId}) + ${p.amountCents}`,
        createdAt: now,
      }),
      db
        .update(agents)
        .set({ balanceCents: sql`${agents.balanceCents} + ${p.amountCents}` })
        .where(eq(agents.id, p.agentId)),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) {
      // This ref was already credited — no-op, return the unchanged balance.
      return { deduped: true, balanceCents: (await getWallet(p.agentId)).balanceCents };
    }
    throw e;
  }
  return { deduped: false, balanceCents: (await getWallet(p.agentId)).balanceCents };
}

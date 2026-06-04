import "server-only";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

// Accept our own names, the bare TURSO_* names, OR the STORAGE_TURSO_* names
// that the Vercel → Turso Marketplace integration actually injects — so the DB
// connects however it was provisioned. (Local dev falls back to a file.)
const url =
  process.env.DATABASE_URL ||
  process.env.TURSO_DATABASE_URL ||
  process.env.STORAGE_TURSO_DATABASE_URL ||
  "file:./data/fengshui.db";
const authToken =
  process.env.DATABASE_AUTH_TOKEN ||
  process.env.TURSO_AUTH_TOKEN ||
  process.env.STORAGE_TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

export const db = drizzle(client, { schema });

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS leads (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT,
          phone TEXT,
          property_interest TEXT,
          timeline TEXT,
          phone_verified INTEGER NOT NULL DEFAULT 0,
          wants_agent INTEGER NOT NULL DEFAULT 0,
          verified_at INTEGER,
          otp_code TEXT,
          otp_expires_at INTEGER,
          otp_attempts INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      // Idempotent column migrations for pre-existing dev databases.
      for (const [col, def] of [
        ["phone_verified", "INTEGER NOT NULL DEFAULT 0"],
        ["wants_agent", "INTEGER NOT NULL DEFAULT 0"],
        ["verified_at", "INTEGER"],
        ["otp_code", "TEXT"],
        ["otp_expires_at", "INTEGER"],
        ["otp_attempts", "INTEGER NOT NULL DEFAULT 0"],
      ] as const) {
        try {
          await client.execute(`ALTER TABLE leads ADD COLUMN ${col} ${def}`);
        } catch {
          // column already exists
        }
      }
      await client.execute(`
        CREATE TABLE IF NOT EXISTS analyses (
          id TEXT PRIMARY KEY,
          lead_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          facing TEXT,
          score REAL,
          created_at INTEGER NOT NULL
        )
      `);
      await client.execute(`
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT,
          agency TEXT,
          res_no TEXT,
          territories TEXT,
          status TEXT NOT NULL,
          referred_by TEXT,
          balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
          created_at INTEGER NOT NULL
        )
      `);
      // Idempotent column migration for pre-existing dev databases. The CHECK is
      // the money guard: an unconditional debit that would overdraw violates it
      // and rolls back the claim batch (see lib/wallet.ts, lib/agents.ts).
      try {
        await client.execute(
          `ALTER TABLE agents ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0)`,
        );
      } catch {
        // column already exists
      }
      await client.execute(`
        CREATE TABLE IF NOT EXISTS claims (
          id TEXT PRIMARY KEY,
          lead_id TEXT NOT NULL UNIQUE,
          agent_id TEXT NOT NULL,
          tier TEXT NOT NULL,
          price_cents INTEGER NOT NULL,
          claimed_at INTEGER NOT NULL
        )
      `);
      // Append-only wallet ledger. UNIQUE(ref) is the idempotency key for
      // Stripe webhook redelivery (ref = session id) and double-debit guard
      // (ref = claim id).
      await client.execute(`
        CREATE TABLE IF NOT EXISTS wallet_transactions (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          kind TEXT NOT NULL,
          ref TEXT NOT NULL UNIQUE,
          balance_after INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      await client.execute(
        `CREATE INDEX IF NOT EXISTS idx_wallet_tx_agent ON wallet_transactions (agent_id, created_at)`,
      );
    })();
  }
  return ready;
}

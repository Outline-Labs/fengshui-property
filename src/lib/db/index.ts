import "server-only";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

// Accept either our own names or the TURSO_* names the Vercel Marketplace
// integration injects, so the DB works however it was provisioned.
const url =
  process.env.DATABASE_URL ||
  process.env.TURSO_DATABASE_URL ||
  "file:./data/fengshui.db";
const authToken =
  process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

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
          created_at INTEGER NOT NULL
        )
      `);
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
    })();
  }
  return ready;
}

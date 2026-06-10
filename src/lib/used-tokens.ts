import "server-only";

import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, ensureSchema } from "./db";

/**
 * Consume a magic-link token exactly once. Returns true the FIRST time a given
 * token is presented (caller may proceed), false on any later presentation
 * (replay — caller MUST reject).
 *
 * Magic links are otherwise stateless: readLoginToken/readMagicToken only check
 * the HMAC signature and the 15-min TTL, so the same emailed link is replayable
 * for its whole life (forwarded mail, proxy/scanner prefetch, shared-device
 * history). Recording the consumed token's hash and rejecting a second insert
 * makes each link single-use. Fails CLOSED — any DB error returns false (reject)
 * rather than letting an unverifiable replay through; the verify routes need the
 * DB anyway, so a DB outage already blocks login.
 */
export async function consumeToken(token: string): Promise<boolean> {
  await ensureSchema();
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    const res = await db.run(
      sql`INSERT INTO used_tokens (token_hash, used_at) VALUES (${hash}, ${Date.now()})`,
    );
    return res.rowsAffected === 1;
  } catch {
    // PRIMARY KEY collision (already consumed → replay) or any DB error → reject.
    return false;
  }
}

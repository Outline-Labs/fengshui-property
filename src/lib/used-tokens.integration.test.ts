import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureSchema } from "./db";
import { consumeToken } from "./used-tokens";

beforeEach(async () => {
  await ensureSchema();
  await db.run(sql`DELETE FROM used_tokens`);
});

// consumeToken is the single-use guard that makes a stateless magic link
// non-replayable: the first presentation wins, every later one is rejected.
describe("consumeToken — single-use magic-link guard", () => {
  it("returns true the first time a token is consumed", async () => {
    expect(await consumeToken("tok-first")).toBe(true);
  });

  it("returns false on every replay of the same token", async () => {
    expect(await consumeToken("tok-replay")).toBe(true);
    expect(await consumeToken("tok-replay")).toBe(false);
    expect(await consumeToken("tok-replay")).toBe(false);
  });

  it("treats distinct tokens independently", async () => {
    expect(await consumeToken("tok-a")).toBe(true);
    expect(await consumeToken("tok-b")).toBe(true);
    expect(await consumeToken("tok-a")).toBe(false); // a already used
  });
});

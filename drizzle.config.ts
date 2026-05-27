import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso", // @libsql/client — local file in dev, Turso in prod
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/fengshui.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});

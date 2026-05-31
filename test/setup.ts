// Test environment defaults, applied before any test module is imported.
// The DB client reads DATABASE_URL at module load, so this must be set here
// (not inside a test) to give integration tests a fresh in-memory database.
process.env.DATABASE_URL = ":memory:";
process.env.DATABASE_AUTH_TOKEN = "";
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";

// Deterministic, non-default session secret for HMAC tests.
process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";

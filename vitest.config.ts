import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // `server-only` throws if bundled for the browser; in the Node test
      // runner we map it to an empty module so server modules import cleanly.
      "server-only": fileURLToPath(
        new URL("./test/stubs/empty.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

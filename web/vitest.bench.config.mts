import { defineConfig } from "vitest/config";
import codspeedPlugin from "@codspeed/vitest-plugin";
import path from "path";

// The benchmarks only exercise pure logic from src/lib, so they run in node
// without the jsdom environment and testing-library setup used by the tests.
// The config is .mts because @codspeed/vitest-plugin is ESM only and this
// workspace is not marked "type": "module".
export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    environment: "node",
    globals: true,
    benchmark: {
      include: ["src/**/*.bench.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

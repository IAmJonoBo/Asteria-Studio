import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/golden/**/*.test.ts"],
    environment: "node",
    setupFiles: [],
    sequence: { concurrent: false },
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json-summary"],
      exclude: ["app/**", "data/**"],
      thresholds: {
        statements: 93,
        branches: 85,
        functions: 95,
        lines: 95,
      },
    },
  },
});

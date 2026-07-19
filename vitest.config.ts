import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json-summary"],
      exclude: ["app/**", "data/**"],
      thresholds: {
        statements: 90,
        branches: 82,
        functions: 90,
        lines: 90,
      },
    },
  },
});

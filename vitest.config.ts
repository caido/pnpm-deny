import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.spec.ts", "packages/**/*.test.ts"],
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    reporters: process.env.CI ? "verbose" : "default",
    restoreMocks: true,
    clearMocks: true,
  },
});

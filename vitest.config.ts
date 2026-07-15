import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    environmentOptions: {
      jsdom: {
        url: "http://sirius.unimet.edu.ve/irj/synthetic-test",
      },
    },
  },
});

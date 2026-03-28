import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: new URL("./tests/__mocks__/obsidian.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
  },
});

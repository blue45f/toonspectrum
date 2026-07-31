import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "deploy/cloudflare-realtime/wrangler.test.jsonc",
      },
    }),
  ],
  test: {
    include: [
      "deploy/cloudflare-realtime/integration/**/*.integration.test.ts",
    ],
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

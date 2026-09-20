import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../", import.meta.url));
// No .env/.env.local reads. Real SQL tests use a separate, guarded, opt-in
// CREATOR_HIRING_TEST_DATABASE_URL and create only their own disposable schema.
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/creator_hiring_unused";
export default defineConfig({
  root,
  envDir: false,
  resolve: { alias: { "@": path.join(root, "apps/web/src") } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    maxWorkers: 2,
    fileParallelism: false,
    environment: "node",
    testTimeout: 15000,
    hookTimeout: 15000,
    include: [
      "apps/api/src/modules/collaboration/hiring-*.test.ts",
      "apps/api/src/modules/collaboration/collaboration.repository.test.ts",
      "apps/api/src/modules/recruitment/*.test.ts",
      "apps/api/src/modules/meeting/*.test.ts",
      "apps/api/src/modules/fortune/fortune-provenance.test.ts",
      "apps/api/src/modules/fortune/fortune.controller.test.ts",
      "apps/web/src/domains/collaboration/hiring/*.test.tsx",
    ],
  },
});

import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

import { resolveVitestDatabaseTarget } from "./scripts/run-postgres-integration-tests.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));

// Read .env.local only as a last candidate. resolveVitestDatabaseTarget accepts
// it only when it is loopback; a Neon/production URL is never inherited by the
// root test suite. DB-backed tests opt in with TEST_DATABASE_URL.
const envPath = path.resolve(root, ".env.local");
let envFileDatabaseUrl: string | undefined;
if (existsSync(envPath)) {
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^DATABASE_URL=(.+)$/m);
    const dbUrl = match?.[1];
    if (dbUrl) {
      envFileDatabaseUrl = dbUrl.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Ignore
  }
}

const testDatabaseTarget = resolveVitestDatabaseTarget({
  environment: process.env,
  envFileDatabaseUrl,
});
process.env.DATABASE_URL = testDatabaseTarget.databaseUrl;

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
    setupFiles: [path.resolve(root, "vitest.setup.ts")],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Studio and Three.js test graphs are intentionally broad. Letting Vitest
    // mirror every logical CPU makes those workers compete for transform cache
    // and memory, which is slower and can turn sub-second assertions into
    // load-dependent timeouts. Four workers keeps local hooks and CI bounded.
    maxWorkers: 4,
    // .claude/worktrees/ 는 에이전트 워크플로가 격리 작업용으로 만드는 임시 git worktree(전역
    // gitignore 대상이라 커밋되진 않지만, vitest 기본 include 는 gitignore 를 안 따라가므로 이
    // 안에 있는 이 저장소의 사본까지 전부 다시 스캔해버린다) — 명시적으로 제외한다.
    // Cloudflare workerd integration은 `cloudflare:test` 가상 모듈과 전용 pool이 필요하므로
    // 루트 Node suite에 섞지 않고 `pnpm test:cloudflare-realtime`에서만 실행한다.
    exclude: [
      ...configDefaults.exclude,
      "**/.claude/worktrees/**",
      "deploy/cloudflare-realtime/integration/**",
      // Playwright browser E2E (run via `pnpm exec playwright test`, not Vitest).
      "e2e/**",
    ],
  },
});

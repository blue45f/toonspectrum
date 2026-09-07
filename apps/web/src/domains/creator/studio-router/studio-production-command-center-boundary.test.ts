import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const routerSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/domains/creator/studio-router/StudioRouter.tsx"),
  "utf8",
);
const productionRouteSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/domains/creator/studio-router/routes/StudioProductionRoute.tsx"),
  "utf8",
);
const hubEntrySource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/src/domains/creator/studio-production/StudioProductionHubPage.tsx",
  ),
  "utf8",
);
const hubSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/src/domains/creator/studio-production/StudioProductionHubPageV2.tsx",
  ),
  "utf8",
);
const workspaceEntrySource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/src/domains/creator/studio-production/studio-production-workspace.ts",
  ),
  "utf8",
);
const workspaceSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/src/domains/creator/studio-production/studio-production-workspace-runtime.ts",
  ),
  "utf8",
);

describe("Studio production command center boundary", () => {
  it("mounts the production hub through an independent lazy route and stable seam", () => {
    expect(routerSource).toContain('from "./routes/StudioProductionRoute"');
    expect(productionRouteSource).toContain('import("../../studio-production/StudioProductionHubPage")');
    expect(productionRouteSource).toContain("lazyRetry(");
    expect(productionRouteSource).toContain("<Suspense");
    expect(productionRouteSource).toContain("<StudioProductionHubPage");
    expect(productionRouteSource).not.toContain('from "../../studio-production/StudioProductionHubPage"');
    expect(routerSource).toContain('case "production"');
    expect(routerSource).toContain("<StudioProductionRoute");
    expect(routerSource).not.toContain(
      'from "../studio-production/StudioProductionHubPage"',
    );
    expect(hubEntrySource).toContain('from "./StudioProductionHubPageV2"');
    expect(hubEntrySource).not.toContain("useState(");
    expect(workspaceEntrySource).toContain(
      'export * from "./studio-production-workspace-runtime"',
    );
  });

  it("uses the shared SQLite/OPFS authority and keeps browser KV fallbacks out", () => {
    expect(workspaceSource).toContain('import("../studio-local-database-runtime")');
    expect(workspaceSource).toContain("acquireStudioLocalDatabase");
    expect(workspaceSource).toContain("database.kvGet");
    expect(workspaceSource).toContain("database.kvSet");
    expect(hubSource).not.toContain("localStorage");
    expect(hubSource).not.toContain("indexedDB");
    expect(workspaceSource).not.toContain("localStorage");
    expect(workspaceSource).not.toContain("indexedDB");
  });

  it("keeps cross-tab updates invalidation-only, revisioned, and scope-isolated", () => {
    expect(hubSource).toContain('typeof BroadcastChannel === "undefined"');
    expect(hubSource).toContain("createStudioProductionWorkspaceInvalidation");
    expect(hubSource).toContain("invalidation.scopeKey !== scope.key");
    expect(hubSource).toContain("invalidation.revision <= workspaceRef.current.revision");
    expect(hubSource).toContain("channel.close()");
    expect(hubSource).not.toContain("postMessage(next)");
    expect(workspaceSource).toContain("current.revision + 1");
    expect(workspaceSource).toContain("parseStudioProductionWorkspaceInvalidation");
  });

  it("keeps sample data and collaboration authority explicitly fail closed", () => {
    expect(hubSource).toContain('mode === "demo"');
    expect(workspaceSource).toContain('demoValues[0] === "1"');
    expect(workspaceSource).toContain('input.scopeKey === "draft"');
    expect(hubSource).toContain("권한 부여 안 됨");
    expect(hubSource).toContain("인증 토큰으로 인정하지 않습니다");
    expect(hubSource).not.toContain("navigator.clipboard.writeText");
  });
});

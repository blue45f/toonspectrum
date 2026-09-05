import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const routerSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/studio-router/StudioRouter.tsx"),
  "utf8",
);
const hubSource = readFileSync(
  resolve(
    process.cwd(),
    "src/domains/creator/studio-production/StudioProductionHubPage.tsx",
  ),
  "utf8",
);

describe("Studio production command center boundary", () => {
  it("mounts the production hub through an independent lazy route", () => {
    expect(routerSource).toContain(
      'import("../studio-production/StudioProductionHubPage")',
    );
    expect(routerSource).toContain('case "production"');
    expect(routerSource).toContain("<StudioProductionHubPage");
    expect(routerSource).not.toContain(
      'from "../studio-production/StudioProductionHubPage"',
    );
  });

  it("uses the shared SQLite/OPFS authority and keeps browser KV fallbacks out", () => {
    expect(hubSource).toContain('import("../studio-local-database-runtime")');
    expect(hubSource).toContain("acquireStudioLocalDatabase");
    expect(hubSource).toContain("database.kvGet");
    expect(hubSource).toContain("database.kvSet");
    expect(hubSource).not.toContain("localStorage");
    expect(hubSource).not.toContain("indexedDB");
  });

  it("keeps cross-tab collaboration fail-safe and scope-isolated", () => {
    expect(hubSource).toContain('typeof BroadcastChannel === "undefined"');
    expect(hubSource).toContain("new BroadcastChannel(`${NAMESPACE}:${scope.key}`)");
    expect(hubSource).toContain("event.data.scopeKey === scope.key");
    expect(hubSource).toContain("channel.close()");
  });
});

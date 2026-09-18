import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routePages = readFileSync(new URL("./production-route-pages.ts", import.meta.url), "utf8");
const landing = readFileSync(
  new URL("../../../domains/creator/production-hub/ProductionLandingPage.tsx", import.meta.url),
  "utf8",
);
const dashboardApi = readFileSync(
  new URL("../../../domains/creator/production-hub/production-dashboard-api.ts", import.meta.url),
  "utf8",
);

describe("production landing startup boundary", () => {
  it("loads the public production landing independently from project workspaces", () => {
    expect(routePages).toContain('import("@/domains/creator/production-hub/ProductionLandingPage")');
    expect(landing).toContain('from "./production-dashboard-api"');
    expect(landing).not.toContain('from "./ProductionHubPage"');
    expect(landing).not.toContain('from "./production-api"');
  });

  it("keeps the dashboard client free of the full production domain type graph", () => {
    expect(dashboardApi).not.toContain("@toonspectrum/core/production");
    expect(dashboardApi).not.toContain("ProductionProjectAggregate");
  });
});

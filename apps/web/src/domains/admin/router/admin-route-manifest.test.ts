import { describe, expect, it } from "vitest";

import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_ROUTES,
  adminPathFromLegacyTab,
  resolveAdminRedirectHref,
  resolveAdminRoute,
} from "./admin-route-manifest";

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("admin route manifest", () => {
  it("keeps route ids and paths unique", () => {
    expect(duplicates(ADMIN_ROUTES.map((route) => route.id))).toEqual([]);
    expect(duplicates(ADMIN_ROUTES.map((route) => route.path))).toEqual([]);
  });

  it("assigns every route to exactly one navigation group", () => {
    const grouped = ADMIN_NAVIGATION_GROUPS.flatMap((group) => group.routeIds);
    expect(duplicates(grouped)).toEqual([]);
    expect([...grouped].sort()).toEqual(ADMIN_ROUTES.map((route) => route.id).sort());
  });

  it("maps every legacy tab onto a durable path", () => {
    expect(adminPathFromLegacyTab("traffic")).toBe("/admin/analytics/traffic");
    expect(adminPathFromLegacyTab("reports")).toBe("/admin/trust/cases");
    expect(adminPathFromLegacyTab("unknown")).toBe("/admin/overview");
  });

  it("preserves unrelated search parameters while replacing legacy routes", () => {
    expect(resolveAdminRedirectHref("/admin", "?source=shortcut&tab=reports")).toBe(
      "/admin/trust/cases?source=shortcut",
    );
    expect(resolveAdminRedirectHref("/admin/members", "?role=creator")).toBe(
      "/admin/users/members?role=creator",
    );
  });

  it("normalizes trailing slashes without redirecting canonical routes", () => {
    expect(resolveAdminRedirectHref("/admin/security/audit/", "", "#latest")).toBe(
      "/admin/security/audit#latest",
    );
    expect(resolveAdminRedirectHref("/admin/security/audit")).toBeNull();
    expect(resolveAdminRoute("/admin/security/audit/")?.id).toBe("audit");
  });
});

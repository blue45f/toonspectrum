// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminGateOverrideProvider, useAdminGate, type AdminGateState } from "../components/admin-gate-state";
import { loadAdminI18nLocale } from "../admin-i18n-loader";
import { AdminRouter } from "./AdminRouter";

const traffic = vi.hoisted(() => Promise.withResolvers<void>());
vi.mock("@/shared/lib/i18n", () => ({ useI18n: () => "ko", useT: () => (key: string) => key }));
vi.mock("@/src/compat/auth-session-store", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("../admin-i18n-loader", () => ({ loadAdminI18nLocale: vi.fn(async () => {}) }));
vi.mock("@/domains/auth/components/auth-menu-shell", () => ({ AuthMenuShell: () => <button type="button">Sign in</button> }));
vi.mock("../shell/AdminShell", () => ({ AdminShell: ({ children, userId }: { children: ReactNode; userId: string }) => <section aria-label="Authorized admin shell" data-user-id={userId}>{children}</section> }));
vi.mock("../components/AdminToast", () => ({ AdminToastProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("../components/AdminDashboard", () => ({ AdminDashboard: ({ uid, onNavigate }: { uid: string; onNavigate: (tab: string) => void }) => <button type="button" onClick={() => onNavigate("campaigns")}>overview:{uid}</button> }));
vi.mock("../components/AdminTraffic", async () => { await traffic.promise; return { AdminTraffic: ({ uid }: { uid: string }) => <p>traffic:{uid}</p> }; });
vi.mock("../components/AdminPlans", () => ({ AdminPlans: ({ uid }: { uid: string }) => <p>plans:{uid}</p> }));
vi.mock("../components/AdminRevenue", () => ({ AdminRevenue: ({ uid }: { uid: string }) => <p>revenue:{uid}</p> }));
vi.mock("../components/AdminPromos", () => ({ AdminPromos: ({ userId }: { userId: string }) => <p>promos:{userId}</p> }));
vi.mock("../components/AdminAnnouncements", () => ({ AdminAnnouncements: ({ userId }: { userId: string }) => <p>announcements:{userId}</p> }));
vi.mock("../components/AdminReports", () => ({ AdminReports: ({ userId }: { userId: string }) => <p>reports:{userId}</p> }));
vi.mock("../components/AdminSecurity", () => ({ AdminSecurity: ({ userId }: { userId: string }) => <p>security:{userId}</p> }));
vi.mock("../components/AdminAuditLogs", () => ({ AdminAuditLogs: ({ userId }: { userId: string }) => <p>audit:{userId}</p> }));
vi.mock("../components/AdminCampaigns", () => ({ AdminCampaigns: ({ uid }: { uid: string }) => <p>campaigns:{uid}</p> }));
vi.mock("../components/AdminOps", () => ({ AdminOps: ({ uid }: { uid: string }) => <p>ops:{uid}</p> }));
vi.mock("../AdminMembersPage", () => ({ AdminMembersPage: () => { const gate = useAdminGate(); return <p>members:{gate.uid}:{gate.gate.kind}</p>; } }));
vi.mock("../AdminCommunityPage", () => ({ AdminCommunityPage: () => { const gate = useAdminGate(); return <p>community:{gate.uid}:{gate.gate.kind}</p>; } }));

const authorized: AdminGateState = { gate: { kind: "admin", me: { id: "actor-a", name: "A", email: null, role: "admin" } }, uid: "actor-a" };
function Location() { const location = useLocation(); return <output aria-label="Current location">{location.pathname}{location.search}{location.hash}</output>; }
function open(path: string, state = authorized) {
  return render(<MemoryRouter initialEntries={[path]}><AdminGateOverrideProvider value={state}><AdminRouter /><Location /></AdminGateOverrideProvider></MemoryRouter>);
}
afterEach(cleanup);

describe("AdminRouter access and real route transitions", () => {
  it("shows a loading surface until the authorized lazy route resolves", async () => {
    open("/admin/analytics/traffic");
    expect(screen.getByLabelText("Authorized admin shell").getAttribute("data-user-id")).toBe("actor-a");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText("traffic:actor-a")).toBeNull();
    traffic.resolve();
    expect(await screen.findByText("traffic:actor-a")).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(loadAdminI18nLocale).toHaveBeenCalledWith("ko");
    expect(document.title).toContain("admin.tabs.traffic");
  });
  it.each([
    ["loading", { kind: "loading" }], ["guest", { kind: "guest" }],
    ["forbidden", { kind: "forbidden" }], ["error", { kind: "error", message: "Account lookup failed" }],
  ] as const)("does not render private route content for %s", (kind, gate) => {
    open("/admin/security/audit", { gate, uid: undefined });
    expect(screen.queryByLabelText("Authorized admin shell")).toBeNull();
    expect(screen.queryByText("audit:actor-a")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in" }) !== null).toBe(kind !== "loading");
    if (kind === "error") expect(screen.getByText("Account lookup failed")).toBeTruthy();
    if (kind !== "loading") expect(screen.getByRole("link").getAttribute("href")).toBe("/");
  });
  it("requires an actual user id even with an admin-shaped gate", () => {
    open("/admin/overview", { gate: authorized.gate, uid: undefined });
    expect(screen.queryByLabelText("Authorized admin shell")).toBeNull();
    expect(screen.queryByText("overview:actor-a")).toBeNull();
  });
  it.each([
    ["/admin/overview", "overview:actor-a"], ["/admin/analytics/traffic", "traffic:actor-a"],
    ["/admin/users/members", "members:actor-a:admin"], ["/admin/trust/cases", "reports:actor-a"],
    ["/admin/trust/community", "community:actor-a:admin"], ["/admin/monetization/plans", "plans:actor-a"],
    ["/admin/monetization/revenue", "revenue:actor-a"], ["/admin/monetization/funding", "campaigns:actor-a"],
    ["/admin/growth/promotions", "promos:actor-a"], ["/admin/engagement/announcements", "announcements:actor-a"],
    ["/admin/platform/operations", "ops:actor-a"], ["/admin/security/access", "security:actor-a"],
    ["/admin/security/audit", "audit:actor-a"],
  ])("routes %s to the correct feature with the verified actor", async (path, content) => {
    open(path); expect(await screen.findByText(content)).toBeTruthy();
    expect(screen.getByLabelText("Current location").textContent).toBe(path);
  });
  it("redirects legacy URLs without losing unrelated search and anchor", async () => {
    open("/admin?tab=reports&source=shortcut#latest");
    expect(await screen.findByText("reports:actor-a")).toBeTruthy();
    expect(screen.getByLabelText("Current location").textContent).toBe("/admin/trust/cases?source=shortcut#latest");
  });
  it("redirects unknown routes and lets dashboard navigation open a canonical feature", async () => {
    open("/admin/no-such-route");
    fireEvent.click(await screen.findByRole("button", { name: "overview:actor-a" }));
    expect(await screen.findByText("campaigns:actor-a")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Current location").textContent).toBe("/admin/monetization/funding"));
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSecurity } from "./AdminSecurity";
import type { IpRuleItem } from "./AdminSecurity";

const api = vi.hoisted(() => vi.fn<(path: string, uid: string, options?: RequestInit) => Promise<unknown>>());
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("./admin-client", async (original) => ({ ...await original<typeof import("./admin-client")>(), adminFetch: api }));
vi.mock("@/shared/lib/i18n", () => ({ useT: () => translate }));

const rule: IpRuleItem = {
  id: "rule-1", ipAddress: "192.168.0.1", reason: "spam", action: "BAN", createdAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  api.mockReset().mockResolvedValue({ items: [rule] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AdminSecurity inline feedback", () => {
  it("replaces the blocking IP unblock confirm with an inline row confirmation", async () => {
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(<AdminSecurity userId="actor-a" />);
    const row = (await screen.findByText("192.168.0.1")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "admin.security.confirmDeleteIp" }));
    expect(api.mock.calls).toHaveLength(1);
    const confirmBox = within(row).getByRole("alert");
    expect(confirmBox.textContent).toContain("admin.security.confirmDeleteIp");
    fireEvent.click(within(confirmBox).getByRole("button", { name: "admin.plans.cancel" }));
    expect(api.mock.calls).toHaveLength(1);
    fireEvent.click(within(row).getByRole("button", { name: "admin.security.confirmDeleteIp" }));
    fireEvent.click(within(row).getByRole("button", { name: "admin.security.confirmDeleteIpButton" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/security/ip-rules/rule-1", "actor-a", { method: "DELETE" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("confirms session revocation inline and shows the success notice without alert()", async () => {
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(<AdminSecurity userId="actor-a" />);
    await screen.findByText("192.168.0.1");
    api.mockResolvedValueOnce({ message: "Revoked 42 sessions" });
    fireEvent.click(screen.getByRole("button", { name: "admin.security.revokeSessions" }));
    expect(api.mock.calls).toHaveLength(1);
    const confirmBox = await screen.findByRole("alert");
    expect(confirmBox.textContent).toContain("admin.security.confirmRevokeSessions");
    fireEvent.click(within(confirmBox).getByRole("button", { name: "admin.security.confirmRevokeButton" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/system/revoke-sessions", "actor-a", { method: "POST" }),
    );
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("Revoked 42 sessions");
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("reports add-IP failures inside the modal instead of alert()", async () => {
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    render(<AdminSecurity userId="actor-a" />);
    await screen.findByText("192.168.0.1");
    fireEvent.click(screen.getByRole("button", { name: "admin.security.addIp" }));
    fireEvent.change(screen.getByLabelText("admin.security.thIp"), { target: { value: "not-an-ip" } });
    api.mockRejectedValueOnce(new Error("Invalid IP address"));
    fireEvent.click(screen.getByRole("button", { name: "admin.security.submitAddIp" }));
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Invalid IP address");
    // The modal stays open so the operator can fix and retry.
    expect(screen.getByLabelText("admin.security.thIp")).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPromos } from "./AdminPromos";
import type { PromoItem } from "./AdminPromos";

const api = vi.hoisted(() => vi.fn<(path: string, uid: string, options?: RequestInit) => Promise<unknown>>());
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("./admin-client", async (original) => ({ ...await original<typeof import("./admin-client")>(), adminFetch: api }));
vi.mock("@/shared/lib/i18n", () => ({ useT: () => translate }));

const promo: PromoItem = {
  id: "promo-1", code: "WELCOME10", discountType: "percent", discountValue: 10,
  maxUses: 100, usedCount: 3, isActive: true, expiresAt: null, createdAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  api.mockReset().mockResolvedValue({ items: [promo] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openDeleteConfirm() {
  render(<AdminPromos userId="actor-a" />);
  const row = (await screen.findByText("WELCOME10")).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "admin.promos.confirmDelete" }));
  return row;
}

describe("AdminPromos inline feedback", () => {
  it("replaces the blocking delete confirm with an inline row confirmation", async () => {
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const row = await openDeleteConfirm();
    // No DELETE fires before the inline confirmation is accepted.
    expect(api.mock.calls).toHaveLength(1);
    const confirmBox = within(row).getByRole("alert");
    expect(confirmBox.textContent).toContain("admin.promos.confirmDelete");
    // Cancel dismisses the inline UI and fires nothing.
    fireEvent.click(within(confirmBox).getByRole("button", { name: "admin.plans.cancel" }));
    expect(api.mock.calls).toHaveLength(1);
    expect(within(row).queryByRole("button", { name: "admin.promos.confirmDeleteButton" })).toBeNull();
    // Confirming sends the DELETE.
    fireEvent.click(within(row).getByRole("button", { name: "admin.promos.confirmDelete" }));
    fireEvent.click(within(row).getByRole("button", { name: "admin.promos.confirmDeleteButton" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/promos/promo-1", "actor-a", { method: "DELETE" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("reports toggle failures inline instead of alert()", async () => {
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    render(<AdminPromos userId="actor-a" />);
    const row = (await screen.findByText("WELCOME10")).closest("tr")!;
    api.mockRejectedValueOnce(new Error("Toggle denied"));
    fireEvent.click(within(row).getByRole("button", { name: "admin.promos.toggleDeactivate" }));
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Toggle denied");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("reports create failures inside the modal instead of alert()", async () => {
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    render(<AdminPromos userId="actor-a" />);
    await screen.findByText("WELCOME10");
    fireEvent.click(screen.getByRole("button", { name: "admin.promos.create" }));
    fireEvent.change(screen.getByLabelText("admin.promos.inputCode"), { target: { value: "TEST50" } });
    api.mockRejectedValueOnce(new Error("Duplicate code"));
    fireEvent.click(screen.getByRole("button", { name: "admin.promos.submit" }));
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Duplicate code");
    // The modal stays open so the operator can fix and retry.
    expect(screen.getByLabelText("admin.promos.inputCode")).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

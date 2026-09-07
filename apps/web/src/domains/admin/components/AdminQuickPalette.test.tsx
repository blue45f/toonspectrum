// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminQuickPalette } from "./AdminQuickPalette";

const api = vi.hoisted(() => ({ fetch: vi.fn(), download: vi.fn(), toast: vi.fn() }));
vi.mock("./admin-client", () => ({ adminFetchText: api.fetch, downloadAdminFile: api.download }));
vi.mock("./use-admin-toast", () => ({ useAdminToast: () => ({ showToast: api.toast }) }));
vi.mock("@/shared/lib/i18n", () => ({ useI18n: () => "en", useT: () => (key: string) => key }));

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="Location">{location.pathname}</output><button type="button" onClick={() => navigate("/admin/overview")}>External navigation</button></>;
}
function open() {
  const view = render(<MemoryRouter initialEntries={["/admin/analytics/traffic"]}><AdminQuickPalette userId="actor-a" /><Location /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /admin.palette.trigger/u }));
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.fetch.mockResolvedValue("id,name\n1,Artist\n");
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  document.body.style.overflow = "auto";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  document.body.style.overflow = "";
});

describe("admin command palette interaction", () => {
  it("focuses a real cmdk search, filters route keywords, and navigates to the matching feature", async () => {
    open();
    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.change(input, { target: { value: "audit" } });
    fireEvent.click(await screen.findByRole("option", { name: "admin.tabs.audit" }));
    expect(screen.getByLabelText("Location").textContent).toBe("/admin/security/audit");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("reports no matching commands and closes from the close control or backdrop with focus restored", async () => {
    open();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "no-such-command-xyz" } });
    expect(await screen.findByText("admin.palette.empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close command palette" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /admin.palette.trigger/u })));
    fireEvent.click(screen.getByRole("button", { name: /admin.palette.trigger/u }));
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles from both supported keyboard modifiers, closes on Escape and external navigation, and cleans up", () => {
    const view = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "K", metaKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "k" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "External navigation" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    view.unmount();
    expect(document.body.style.overflow).toBe("auto");
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["exportUsers", "/users/export/csv", "members.csv"],
    ["exportRevenue", "/revenue/export/csv", "revenue-ledger.csv"],
  ])("downloads %s only after the authorized request resolves", async (label, path, filename) => {
    const pending = Promise.withResolvers<string>();
    api.fetch.mockReturnValue(pending.promise);
    open();
    fireEvent.click(screen.getByRole("option", { name: `admin.palette.${label}` }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.fetch).toHaveBeenCalledWith(path, "actor-a");
    expect(api.download).not.toHaveBeenCalled();
    pending.resolve("id,name\n1,Artist\n");
    await waitFor(() => expect(api.download).toHaveBeenCalledWith(filename, "id,name\n1,Artist\n", "text/csv;charset=utf-8"));
    expect(api.toast).toHaveBeenCalledTimes(1);
    expect(api.toast.mock.calls[0]).toHaveLength(1);
  });

  it.each([new Error("Permission denied"), "offline"])("shows a failed export without emitting a file (%s)", async (failure) => {
    api.fetch.mockRejectedValue(failure);
    open();
    fireEvent.click(screen.getByRole("option", { name: "admin.palette.exportUsers" }));
    await waitFor(() => expect(api.toast).toHaveBeenCalledTimes(1));
    expect(api.toast.mock.calls[0]![2]).toBe("error");
    expect(api.toast.mock.calls[0]![1]).toBe(failure instanceof Error ? failure.message : api.toast.mock.calls[0]![0]);
    expect(api.download).not.toHaveBeenCalled();
  });
});

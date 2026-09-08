// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminShell } from "./AdminShell";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("../components/AdminHeaderStats", () => ({ AdminHeaderStats: () => null }));
vi.mock("../components/AdminQuickPalette", () => ({ AdminQuickPalette: () => null }));

const key = "toonspectrum.admin.sidebar.collapsed.v1";

function renderShell() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminShell actor={{ id: "admin-test", name: "Admin", email: null, role: "admin" }} userId="admin-test">
          <p>Admin content</p>
        </AdminShell>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminShell sidebar preference", () => {
  it("opens and remains usable when localStorage access is denied", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage access denied", "SecurityError");
    });
    renderShell();
    expect(screen.getByText("Admin content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeTruthy();
  });

  it("keeps toggling when preference writes exceed the storage quota", () => {
    localStorage.setItem(key, "1");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeTruthy();
    expect(screen.getByText("Admin content")).toBeTruthy();
  });

  it("restores the last successful preference on a fresh mount", () => {
    const view = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(localStorage.getItem(key)).toBe("1");
    view.unmount();
    renderShell();
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeTruthy();
  });
});

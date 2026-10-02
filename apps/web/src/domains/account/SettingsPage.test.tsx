// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

vi.mock("@/platform/me-client", () => ({
  getMyProfile: vi.fn(async () => { throw new Error("offline"); }),
  updateMyProfile: vi.fn(async () => { throw new Error("offline"); }),
}));
vi.mock("@/shared/components/appearance/AppearanceSettings", () => ({ AppearanceSettings: () => <div data-testid="appearance" /> }));
vi.mock("@/shared/components/RegionalPreferences", () => ({ RegionalPreferences: () => <div data-testid="regional" /> }));
vi.mock("@/shared/components/site-experience/site-experience-context", () => ({ useSiteExperience: () => null }));
vi.mock("@/shared/voice", () => ({ VoiceGuideSettingsSection: () => <section aria-label="음성 안내 설정" /> }));
vi.mock("@/shared/ambient", () => ({ AmbientSettingsSection: () => <section aria-label="앰비언트 설정" /> }));
vi.mock("./ConnectedAccountsSettings", () => ({ ConnectedAccountsSettings: () => <div data-testid="connected-accounts" /> }));
vi.mock("./AccountMergeSettings", () => ({ AccountMergeSettings: () => <div data-testid="account-merge" /> }));
vi.mock("./LibraryBackupImport", () => ({ LibraryBackupImport: () => <div data-testid="backup-import" /> }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function renderSettings(entry = "/settings") {
  return render(<MemoryRouter initialEntries={[entry]}><SettingsPage /><LocationProbe /></MemoryRouter>);
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("설정 화면 탭", () => {
  it("설정을 화면·지역·데이터·계정 네 탭으로 나누고 처음에는 화면·음성만 보여 준다", () => {
    renderSettings();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["화면·음성", "지역·필터", "연령·데이터", "계정"]);
    expect(screen.getByRole("tab", { name: "화면·음성" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("appearance")).toBeTruthy();
    // 아직 열지 않은 탭의 내용은 그리지 않는다.
    expect(screen.queryByText("내 데이터")).toBeNull();
  });

  it("탭을 고르면 주소(?view=)에 남고, 기존 섹션 앵커는 해당 탭을 연다", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: "연령·데이터" }));
    expect(screen.getByTestId("location").textContent).toBe("/settings?view=data");
    expect(screen.getByRole("heading", { name: "내 데이터" })).toBeTruthy();
    expect(screen.getByTestId("backup-import")).toBeTruthy();
    cleanup();

    renderSettings("/settings#account-security");
    await waitFor(() => expect(screen.getByRole("tab", { name: "계정" }).getAttribute("aria-selected")).toBe("true"));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByTestId("connected-accounts")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /내 정보/u }).getAttribute("href")).toBe("/me");
  });

  it("관련 설정 화면(멤버십·AI·API 키·연동·알림·직군)은 접힌 목록에서 계속 찾을 수 있다", () => {
    renderSettings();
    const related = document.querySelector("details[data-related-settings]") as HTMLDetailsElement;
    expect(related.open).toBe(false);
    const hrefs = within(related).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/membership", "/settings/ai", "/settings/api-keys", "/settings/integrations", "/settings/notifications", "/studio#role-personalization"]));
  });
});

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
vi.mock("./DeleteAccountSection", () => ({ DeleteAccountSection: () => <div data-testid="delete-account" /> }));
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
    // 탈퇴도 계정 목적지(설정 계정 탭)에 모여 있다 — /me 프로필 편집과 분리된 자리.
    expect(within(panel).getByTestId("delete-account")).toBeTruthy();
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

describe("설정 검색", () => {
  it("검색어로 다른 설정 화면을 찾을 수 있다", () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText("설정 검색"), { target: { value: "알림" } });
    const results = screen.getByRole("list", { name: "설정 검색 결과" });
    const link = within(results).getByRole("link", { name: /알림 설정/ });
    expect(link.getAttribute("href")).toBe("/settings/notifications");
  });

  it("섹션 결과를 누르면 해당 탭이 열리고 검색어가 비워진다", async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText("설정 검색"), { target: { value: "백업" } });
    fireEvent.click(screen.getByRole("button", { name: /내 데이터 · 백업 · 초기화/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/settings?view=data"));
    expect((screen.getByLabelText("설정 검색") as HTMLInputElement).value).toBe("");
  });

  it("없는 단어를 검색하면 빈 결과 안내를 보여 준다", () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText("설정 검색"), { target: { value: "없는설정단어" } });
    expect(screen.getByText(/찾는 설정이 없어요/)).toBeTruthy();
  });

  it("데이터 초기화 범위가 서재 활동 데이터뿐임을 고지한다", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: "연령·데이터" }));
    expect(screen.getByText(/초기화 범위는 서재 활동 데이터/)).toBeTruthy();
    expect(screen.getByText(/환경설정과 연령 확인 상태, 계정 정보는 그대로 유지됩니다/)).toBeTruthy();
  });
});

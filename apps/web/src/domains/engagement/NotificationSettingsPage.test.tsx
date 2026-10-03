// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEngagement } from "./engagement-store";
import { NotificationSettingsPage } from "./NotificationSettingsPage";

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
  useMetaRobots: () => undefined,
}));

const roleSettingsHolder = vi.hoisted(() => ({
  current: null as Readonly<Record<string, boolean>> | null,
}));
vi.mock("./use-role-notification-settings", () => ({
  useRoleNotificationSettings: () => ({ settings: roleSettingsHolder.current }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/notifications"]}>
      <NotificationSettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  roleSettingsHolder.current = null;
  useEngagement.getState().resetEngagementData();
});
afterEach(cleanup);

describe("NotificationSettingsPage 종류별 알림 받기", () => {
  it("종류 6개의 스위치를 모두 켜진 상태로 렌더한다", () => {
    renderPage();

    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(6);
    for (const item of switches) expect(item.getAttribute("aria-checked")).toBe("true");
  });

  it("스위치 비주얼은 공용 SwitchIndicator를 쓴다", () => {
    renderPage();

    const tracks = document.querySelectorAll('[data-ui-switch-track="true"]');
    expect(tracks).toHaveLength(6);
    for (const track of tracks) expect(track.getAttribute("data-state")).toBe("on");
  });

  it("하이드레이션이 끝나기 전에는 스위치가 비활성이고 불러오는 중 안내가 보인다", () => {
    const hasSpy = vi.spyOn(useEngagement.persist, "hasHydrated").mockReturnValue(false);
    const finishSpy = vi
      .spyOn(useEngagement.persist, "onFinishHydration")
      .mockReturnValue(() => undefined);
    try {
      renderPage();
      expect(screen.getByText(/저장된 알림 설정을 불러오는 중/)).toBeTruthy();
      for (const item of screen.getAllByRole("switch")) {
        expect((item as HTMLButtonElement).disabled).toBe(true);
      }
    } finally {
      hasSpy.mockRestore();
      finishSpy.mockRestore();
    }
  });

  it("스위치를 끄면 스토어 설정이 바뀌고 다시 켤 수 있다", () => {
    renderPage();

    const releaseSwitch = screen.getByRole("switch", { name: /연재/ });
    fireEvent.click(releaseSwitch);
    expect(useEngagement.getState().notificationCategorySettings.release).toBe(false);
    expect(releaseSwitch.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(releaseSwitch);
    expect(useEngagement.getState().notificationCategorySettings.release).toBe(true);
  });

  it("전부 켜기를 누르면 꺼진 종류가 모두 켜진다", () => {
    useEngagement.getState().setNotificationCategoryEnabled("release", false);
    useEngagement.getState().setNotificationCategoryEnabled("market", false);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "전부 켜기" }));

    expect(useEngagement.getState().notificationCategorySettings.release).toBe(true);
    expect(useEngagement.getState().notificationCategorySettings.market).toBe(true);
  });

  it("알림 센터로 돌아가는 링크를 제공한다", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /알림 센터/ }).getAttribute("href")).toBe("/notifications");
  });

  it("설정 홈으로 돌아가는 링크도 제공한다", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "설정 홈" }).getAttribute("href")).toBe("/settings");
  });
});

describe("NotificationSettingsPage 직군 알림 안내", () => {
  it("직군 미선택이면 직군 알림이 적용되지 않음을 알리고 개인화 진입점을 제공한다", () => {
    roleSettingsHolder.current = null;
    renderPage();

    expect(screen.getByText(/아직 직군을 정하지 않아 직군 알림이 적용되지 않아요/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /내 직군 · 작업환경에서 바꾸기/ }).getAttribute("href"),
    ).toBe("/studio#role-personalization");
  });

  it("직군 알림이 적용 중이면 켜진 개수와 꺼진 종류를 보여 준다", () => {
    roleSettingsHolder.current = {
      assignment: true,
      "handoff-ready": true,
      "review-request": false,
      "revision-request": true,
      "deadline-risk": false,
      "unassigned-work": true,
      "approval-needed": true,
      "publish-risk": true,
      "canon-change": true,
      question: true,
    };
    renderPage();

    expect(screen.getByText(/제작 알림 종류 10개 중 8개가 켜져 있어요/)).toBeTruthy();
    const disabledList = screen.getByRole("list", { name: "직군 알림에서 꺼진 종류" });
    expect(disabledList.textContent).toContain("검수 요청 끔");
    expect(disabledList.textContent).toContain("일정 지연 위험 끔");
  });
});

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/notifications"]}>
      <NotificationSettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

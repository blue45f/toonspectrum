// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngagementNotification } from "./engagement-model";
import { useEngagement } from "./engagement-store";
import { NotificationCenterPage } from "./NotificationCenterPage";

import {
  CREATOR_ROLE_NOTIFICATION_EVENTS,
  type CreatorRoleNotificationEvent,
} from "@/shared/lib/creator-role-workspace-contract";

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
  useMetaRobots: () => undefined,
}));

const roleSettingsState = vi.hoisted(() => ({
  settings: null as Readonly<Record<CreatorRoleNotificationEvent, boolean>> | null,
}));

vi.mock("./use-role-notification-settings", () => ({
  useRoleNotificationSettings: () => ({ settings: roleSettingsState.settings }),
}));

function makeNotification(index: number): EngagementNotification {
  return {
    id: `notice-${index}`,
    category: "system",
    title: `알림 ${index}`,
    body: `본문 ${index}`,
    href: "/",
    createdAt: new Date(Date.UTC(2026, 8, 29, 12, 0, index % 60, index)).toISOString(),
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `test:${index}`,
  };
}

function seedNotifications(count: number): void {
  useEngagement
    .getState()
    .upsertNotifications(Array.from({ length: count }, (_, index) => makeNotification(index)));
}

function cardCount(container: HTMLElement): number {
  return container.querySelectorAll("article[aria-label]").length;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/notifications"]}>
      <NotificationCenterPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useEngagement.getState().resetEngagementData();
});
afterEach(cleanup);

describe("NotificationCenterPage PAGE_SIZE 페이지네이션", () => {
  it("처음에는 50개만 렌더하고 나머지는 더 보기로 남긴다", () => {
    seedNotifications(120);

    const { container } = renderPage();

    expect(cardCount(container)).toBe(50);
    const moreButton = screen.getByRole("button", { name: /더 보기/ });
    expect(moreButton.textContent).toContain("남은 70개");
  });

  it("더 보기를 누르면 50개씩 추가로 렌더한다", () => {
    seedNotifications(120);

    const { container } = renderPage();

    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(cardCount(container)).toBe(100);
    expect(screen.getByRole("button", { name: /더 보기/ }).textContent).toContain("남은 20개");

    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(cardCount(container)).toBe(120);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  });

  it("50개 이하면 더 보기 버튼을 렌더하지 않는다", () => {
    seedNotifications(50);

    const { container } = renderPage();

    expect(cardCount(container)).toBe(50);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  });
});

function settingsHiding(
  ...events: CreatorRoleNotificationEvent[]
): Readonly<Record<CreatorRoleNotificationEvent, boolean>> {
  return Object.fromEntries(
    CREATOR_ROLE_NOTIFICATION_EVENTS.map((event) => [event, !events.includes(event)]),
  ) as Record<CreatorRoleNotificationEvent, boolean>;
}

function makeProductionNotification(
  bucket: string,
  overrides: Partial<EngagementNotification> = {},
): EngagementNotification {
  return {
    id: `production:project-1:task-${bucket}:${bucket}`,
    category: "production",
    title: `제작 알림 ${bucket}`,
    body: "본문",
    href: "/production/projects/project-1/overview",
    createdAt: "2026-09-29T12:00:00.000Z",
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `production-inbox:project-1:task-${bucket}:${bucket}`,
    ...overrides,
  };
}

describe("NotificationCenterPage 직군 알림 설정 연동", () => {
  beforeEach(() => {
    roleSettingsState.settings = null;
  });

  it("꺼진 직군 이벤트에 대응하는 제작 알림을 기본 목록에서 숨기고 안내한다", () => {
    roleSettingsState.settings = settingsHiding("review-request");
    useEngagement.getState().upsertNotifications([
      makeProductionNotification("review"),
      makeProductionNotification("ready"),
    ]);

    const { container } = renderPage();

    expect(screen.queryByText("제작 알림 review")).toBeNull();
    expect(screen.getByText("제작 알림 ready")).toBeTruthy();
    expect(screen.getByText(/직군 알림 설정으로 제작 알림 1건이 숨겨져 있습니다/)).toBeTruthy();
    expect(cardCount(container)).toBe(1);
  });

  it("모두 보기를 누르면 숨긴 알림이 다시 보이고 토글로 되돌릴 수 있다", () => {
    roleSettingsState.settings = settingsHiding("review-request");
    useEngagement.getState().upsertNotifications([
      makeProductionNotification("review"),
      makeProductionNotification("ready"),
    ]);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));

    expect(screen.getByText("제작 알림 review")).toBeTruthy();
    expect(screen.getByText("제작 알림 ready")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "직군 설정 적용" }));
    expect(screen.queryByText("제작 알림 review")).toBeNull();
  });

  it("보관한 알림은 직군 설정과 무관하게 보관함에서 보인다", () => {
    roleSettingsState.settings = settingsHiding("review-request");
    const item = makeProductionNotification("review");
    useEngagement.getState().upsertNotifications([item]);
    useEngagement.getState().archiveNotification(item.id);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /보관/ }));

    expect(screen.getByText("제작 알림 review")).toBeTruthy();
  });

  it("직군 설정이 없으면 제작 알림을 숨기지 않고 안내도 없다", () => {
    useEngagement.getState().upsertNotifications([
      makeProductionNotification("review"),
      makeProductionNotification("ready"),
    ]);

    renderPage();

    expect(screen.getByText("제작 알림 review")).toBeTruthy();
    expect(screen.queryByText(/직군 알림 설정으로/)).toBeNull();
  });
});

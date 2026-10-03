// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngagementNotification } from "./engagement-model";
import { useEngagement } from "./engagement-store";
import { EngagementNotificationBell } from "./EngagementNotificationBell";

import {
  CREATOR_ROLE_NOTIFICATION_EVENTS,
  type CreatorRoleNotificationEvent,
} from "@/shared/lib/creator-role-workspace-contract";

const roleSettingsState = vi.hoisted(() => ({
  settings: null as Readonly<Record<CreatorRoleNotificationEvent, boolean>> | null,
}));

vi.mock("./use-role-notification-settings", () => ({
  useRoleNotificationSettings: () => ({ settings: roleSettingsState.settings }),
}));

function makeNotification(
  overrides: Partial<EngagementNotification> & Pick<EngagementNotification, "id">,
): EngagementNotification {
  return {
    category: "system",
    title: "알림",
    body: "본문",
    href: "/",
    createdAt: "2026-09-29T12:00:00.000Z",
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `test:${overrides.id}`,
    ...overrides,
  };
}

function renderBell() {
  return render(
    <MemoryRouter>
      <EngagementNotificationBell />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  roleSettingsState.settings = null;
  useEngagement.getState().resetEngagementData();
});
afterEach(cleanup);

describe("EngagementNotificationBell 직군 알림 설정 연동", () => {
  it("꺼진 직군 이벤트의 제작 알림은 뱃지에서 제외한다", () => {
    roleSettingsState.settings = Object.fromEntries(
      CREATOR_ROLE_NOTIFICATION_EVENTS.map((event) => [event, event !== "review-request"]),
    ) as Record<CreatorRoleNotificationEvent, boolean>;
    useEngagement.getState().upsertNotifications([
      makeNotification({ id: "sys-1" }),
      makeNotification({
        id: "production:project-1:task-1:review",
        category: "production",
        sourceKey: "production-inbox:project-1:task-1:review",
      }),
      makeNotification({
        id: "production:project-1:task-2:ready",
        category: "production",
        sourceKey: "production-inbox:project-1:task-2:ready",
      }),
    ]);

    renderBell();

    expect(screen.getByRole("link", { name: "읽지 않은 알림 2개" })).toBeTruthy();
  });

  it("직군 설정이 없으면 모든 안 읽은 알림을 센다", () => {
    useEngagement.getState().upsertNotifications([
      makeNotification({
        id: "production:project-1:task-1:review",
        category: "production",
        sourceKey: "production-inbox:project-1:task-1:review",
      }),
    ]);

    renderBell();

    expect(screen.getByRole("link", { name: "읽지 않은 알림 1개" })).toBeTruthy();
  });
});

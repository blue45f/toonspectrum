// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngagementNotification } from "./engagement-model";
import { useEngagement } from "./engagement-store";
import { NotificationCenterPage } from "./NotificationCenterPage";

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
  useMetaRobots: () => undefined,
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

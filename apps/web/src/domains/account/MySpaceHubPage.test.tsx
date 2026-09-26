// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MySpaceHubPage } from "./MySpaceHubPage";

import type { PropsWithChildren } from "react";

const fixtures = vi.hoisted(() => ({
  continuity: {
    version: 1 as const,
    recent: [] as Array<{ id: "studio"; href: string; visitedAt: number }>,
    plan: null,
  },
  app: {
    reads: {} as Record<string, string>,
    ratings: {} as Record<string, number>,
    collections: [] as unknown[],
  },
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown) => ko,
  translateCurrentStaticSourceText: (_scope: string, _locale: string, value: string) => value,
  useBilingualI18nRevision: () => undefined,
}));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

vi.mock("@/shared/lib/creator-continuity", () => ({
  subscribeCreatorContinuity: () => () => undefined,
  getCreatorContinuitySnapshot: () => fixtures.continuity,
  getCreatorContinuityServerSnapshot: () => fixtures.continuity,
  creatorDestinationLabel: () => "창작 스튜디오",
  creatorRecentDestinationDescription: () => "마지막 문서와 작업 위치로 돌아가기",
}));

vi.mock("@/shared/lib/store", () => ({
  useHydrated: () => true,
  useApp: (selector: (state: typeof fixtures.app) => unknown) => selector(fixtures.app),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/shared/components/purpose-experience-stage", () => ({
  PurposeExperienceStage: () => <div data-testid="purpose-stage" />,
  FriendlyQuickGuide: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/my"]}>
      <MySpaceHubPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fixtures.continuity.recent = [];
  fixtures.app.reads = {};
  fixtures.app.ratings = {};
  fixtures.app.collections = [];
});

afterEach(cleanup);

describe("MySpaceHubPage next-action center", () => {
  it("starts a new user from create, import or the isolated sample without foregrounding zero stats", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "아직 이어갈 Studio 작업이 없습니다" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "새 작품 만들기" }).getAttribute("href")).toBe("/studio/new");
    expect(screen.getByRole("link", { name: "기존 파일 가져오기" }).getAttribute("href")).toBe("/studio/import");
    expect(screen.getByRole("link", { name: "10분 샘플로 보기" }).getAttribute("href")).toBe("/production/projects/sample-project/overview");
    expect(screen.queryByText("읽기 상태")).toBeNull();
    expect(screen.getAllByRole("link", { name: /알림/ }).some((link) => link.getAttribute("href") === "/notifications")).toBe(true);
  });

  it("resumes the most recent Studio location and shows activity only when it exists", () => {
    fixtures.continuity.recent = [{
      id: "studio",
      href: "/studio/p/project-1/d/document-1?resume=latest",
      visitedAt: Date.parse("2026-09-26T01:00:00.000Z"),
    }];
    fixtures.app.reads = { work: "reading" };
    fixtures.app.ratings = { work: 4.5 };
    fixtures.app.collections = [{ id: "favorites" }];

    renderPage();

    expect(screen.getByRole("heading", { name: "가장 최근 작업부터 이어가세요" })).toBeTruthy();
    expect(screen.getByText("마지막 문서와 작업 위치로 돌아가기")).toBeTruthy();
    expect(screen.getByRole("link", { name: /이어서 작업/ }).getAttribute("href")).toBe(
      "/studio/p/project-1/d/document-1?resume=latest",
    );
    expect(screen.getByText("읽기 상태")).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(3);
  });
});

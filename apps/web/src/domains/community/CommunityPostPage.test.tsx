// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CommunityPostPage } from "./CommunityPostPage";

const postFixture = {
  id: "post-1",
  scope: "title" as const,
  targetId: "moon-knight",
  targetLabel: "달의 기사",
  kind: "talk" as const,
  title: "3화 떡밥 정리",
  text: "본문입니다.",
  tags: ["해석"],
  images: [],
  author: { id: "author-1", name: "독자", avatar: "oklch(0.6 0.1 200)" },
  createdAt: "2026-10-01T00:00:00.000Z",
  replyCount: 2,
  replies: [],
};

vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({
    data: postFixture,
    loading: false,
    error: null,
    notFound: false,
    reload: vi.fn(),
  }),
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: string | null; sessionToken: string | null }) => unknown) =>
    selector({ userId: null, sessionToken: null }),
}));

vi.mock("@/platform/api", () => ({
  api: { delete: vi.fn() },
}));

vi.mock("@/shared/components/fan-cafe-panel", () => ({
  FanPostImages: () => null,
  FanPostReplySection: () => <div data-testid="reply-section" />,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateCurrentStaticSourceText: (_domain: string, _lang: string, text: string) => text,
}));

vi.mock("@/shared/lib/public-share-policy", () => ({
  canShareCommunityPost: () => false,
  compactPublicShareDescription: (_value: unknown, fallback: string) => fallback,
}));

describe("CommunityPostPage", () => {
  it("본문 아래에도 보드로 돌아가는 링크가 있어 상단 경로와 같은 곳을 가리킨다", () => {
    render(
      <MemoryRouter initialEntries={["/community/post/post-1"]}>
        <Routes>
          <Route path="/community/post/:id" element={<CommunityPostPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("3화 떡밥 정리");
    const boardLinks = screen.getAllByRole("link", { name: "작품 · 달의 기사" });
    // 상단 이동 경로 + 본문 하단 복귀 링크
    expect(boardLinks).toHaveLength(2);
    expect(boardLinks[0].getAttribute("href")).toBe(boardLinks[1].getAttribute("href"));
    expect(boardLinks[1].getAttribute("href")).toContain("moon-knight");
  });
});

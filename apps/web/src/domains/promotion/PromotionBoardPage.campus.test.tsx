// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromotionPost } from "@toonspectrum/core/promotion";
import {
  CampusObjectPublisherContext,
  type CampusObjectPublisher,
} from "@/shared/components/spatial-campus/campus-object-context";
import { PromotionBoardPage } from "./PromotionBoardPage";

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: null }) => unknown) => selector({ userId: null }),
}));

const post = (id: string, hidden = false, archived = false): PromotionPost => ({
  id,
  kind: "series",
  stage: "amateur",
  genre: "드라마",
  title: `공개 소개 ${id}`,
  seriesTitle: `작품 ${id}`,
  description: "공개 공간 투영을 검증하기 위한 충분히 긴 작품 소개 문장입니다.",
  readingUrl: "",
  videoUrl: "",
  cover: "",
  tags: [],
  contentWarning: "",
  rightsConfirmed: true,
  author: { id: "author-A", name: "작가" },
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
  version: 1,
  hidden,
  archived,
  saved: false,
});

vi.mock("./use-promotion-feed", () => ({
  usePromotionFeed: () => ({
    page: {
      items: [post("public-A"), post("hidden-A", true), post("archived-A", false, true)],
      nextCursor: null,
      hasMore: false,
      canModerate: false,
    },
    loading: false,
    moreLoading: false,
    error: "",
    loadMore: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("PromotionBoardPage campus projection", () => {
  it("publishes only publicly visible promotion posts to the gallery boundary", async () => {
    const publish = vi.fn<CampusObjectPublisher>(() => () => undefined);
    render(
      <MemoryRouter initialEntries={["/community/promote"]}>
        <CampusObjectPublisherContext.Provider value={publish}>
          <PromotionBoardPage />
        </CampusObjectPublisherContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(publish).toHaveBeenCalled());
    expect(publish.mock.calls[0]?.[1]).toEqual([{
      id: "public-A",
      title: "공개 소개 public-A",
      href: "/community/promote/public-A",
      kind: "promotion-post",
      exposure: "public",
    }]);
  });
});

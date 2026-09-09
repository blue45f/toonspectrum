// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublishedWorkReader } from "./PublishedWorkReader";
import { resolveCreatorPublicationReaderPolicy } from "./creator-publication-reader";
import { readWorkFx } from "./studio-motion-fx";

vi.mock("./WebtoonFxPlayer", () => ({
  WebtoonFxPlayer: ({ title, pages }: { title: string; pages: string[] }) => (
    <div data-testid="vertical-reader">{title}:{pages.length}</div>
  ),
}));

function policy(overrides: Record<string, unknown> = {}) {
  return resolveCreatorPublicationReaderPolicy({
    publication: {
      version: 1,
      mode: "immediate",
      visibility: "public",
      scheduledAt: null,
      timeZone: "Asia/Seoul",
      comments: "open",
      allowRemix: true,
      readingMode: "paged",
      readingDirection: "ltr",
      contentRating: "all",
      searchIndexing: true,
      socialTitle: "공유 제목",
      socialDescription: "공유 설명",
      canonicalSlug: "episode-1",
      publishedAt: "2026-09-09T00:00:00.000Z",
      ...overrides,
    },
  });
}

const fx = readWorkFx({});

describe("PublishedWorkReader", () => {
  it("keeps vertical works on the effects reader", () => {
    render(
      <PublishedWorkReader
        workId="work-1"
        pages={["page-1"]}
        fx={fx}
        title="작품"
        policy={policy({ readingMode: "vertical" })}
        isOwner={false}
      />,
    );

    expect(screen.getByTestId("vertical-reader").textContent).toBe("작품:1");
    expect(screen.getByText("세로 스크롤")).toBeTruthy();
  });

  it("supports accessible LTR page navigation and direct page selection", () => {
    render(
      <PublishedWorkReader
        workId="work-1"
        pages={["page-1", "page-2", "page-3"]}
        fx={fx}
        title="작품"
        policy={policy()}
        isOwner={false}
      />,
    );

    expect(screen.getByAltText("작품 1페이지")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(screen.getByAltText("작품 2페이지")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3페이지로 이동" }));
    expect(screen.getByAltText("작품 3페이지")).toBeTruthy();
  });

  it("maps the physical left arrow to next page for RTL works", () => {
    render(
      <PublishedWorkReader
        workId="work-rtl"
        pages={["page-1", "page-2"]}
        fx={fx}
        title="RTL 작품"
        policy={policy({ readingDirection: "rtl" })}
        isOwner={false}
      />,
    );

    const reader = screen.getByRole("region", { name: "페이지 넘김 독자 보기" });
    fireEvent.keyDown(reader, { key: "ArrowLeft" });
    expect(screen.getByAltText("RTL 작품 2페이지")).toBeTruthy();
  });

  it("requires an explicit confirmation before rendering mature work for readers", () => {
    render(
      <PublishedWorkReader
        workId="mature-work"
        pages={["mature-page"]}
        fx={fx}
        title="성인 작품"
        policy={policy({ readingMode: "vertical", contentRating: "mature" })}
        isOwner={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "성인 대상 콘텐츠입니다" })).toBeTruthy();
    expect(screen.queryByTestId("vertical-reader")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "확인하고 작품 보기" }));
    expect(screen.getByTestId("vertical-reader")).toBeTruthy();
  });

  it("lets an owner preview mature content without the public confirmation gate", () => {
    render(
      <PublishedWorkReader
        workId="mature-owner-work"
        pages={["mature-page"]}
        fx={fx}
        title="성인 작품"
        policy={policy({ readingMode: "vertical", contentRating: "mature" })}
        isOwner
      />,
    );

    expect(screen.queryByRole("heading", { name: "성인 대상 콘텐츠입니다" })).toBeNull();
    expect(screen.getByTestId("vertical-reader")).toBeTruthy();
  });
});

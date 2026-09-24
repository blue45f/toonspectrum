// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPublishResultReceipt } from "./StudioPublishResultReceipt";

afterEach(cleanup);

describe("StudioPublishResultReceipt", () => {
  it("shows a reader action only for a published work", () => {
    render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-1"
          revision={7}
          environment="production"
          details={{
            title: "성운의 왕관",
            visibility: "public",
            publishedAt: "2026-09-24T10:47:13.708Z",
            pages: [{ name: "page.webp", width: 1280, height: 1600 }],
            source: {
              version: 1,
              kind: "studio_document",
              projectId: "project-1",
              documentId: "document-1",
              revisionId: "studio-generation:7:history:12",
              contentChecksum: "a".repeat(64),
              disclosure: "브라우저 편집기에서 제작",
            },
            community: {
              kind: "illustration",
              provenance: "agent_assisted",
              portfolio: false,
              downloadAllowed: false,
              trainingAllowed: false,
              attributionText: "AI 에이전트 드로잉 · 소유자 최종 검수",
              altText: "별빛 왕관을 쓴 판타지 소녀",
            },
            rights: {
              comments: "open",
              allowRemix: true,
              searchIndexing: true,
              contentRating: "all",
            },
            preflight: { errors: 0, warnings: 0 },
          }}
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "작품 게시가 완료됐습니다" })).toBeTruthy();
    expect(screen.getByText("work-1")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("운영 환경")).toBeTruthy();
    expect(screen.getByRole("link", { name: "독자 화면 열기" }).getAttribute("href")).toBe(
      "/create/work-1",
    );
    expect(screen.getByText("studio-generation:7:history:12")).toBeTruthy();
    expect(screen.getByText("a".repeat(64))).toBeTruthy();
    expect(screen.getByRole("button", { name: "게시 영수증 JSON" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "비로그인 독자 보기" }).getAttribute("href")).toBe(
      "/create/work-1?view=reader&publicPreview=1",
    );
  });

  it("keeps private drafts out of the reader flow and exposes recovery actions", () => {
    const onContinueEditing = vi.fn();
    const onReviewSettings = vi.fn();
    render(
      <StudioPublishResultReceipt
        kind="private"
        workId="work-private"
        environment="preview"
        onContinueEditing={onContinueEditing}
        onReviewSettings={onReviewSettings}
      />,
    );

    expect(screen.getByRole("heading", { name: "비공개 원고를 저장했습니다" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "독자 화면 열기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "비로그인 독자 보기" })).toBeNull();
    expect(screen.getByRole("button", { name: "게시 영수증 JSON" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "원고 수정 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 설정 다시 확인" }));
    expect(onContinueEditing).toHaveBeenCalledOnce();
    expect(onReviewSettings).toHaveBeenCalledOnce();
  });

  it("offers an explicit rollback for published and scheduled results", () => {
    const onMakePrivate = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-live"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
          onMakePrivate={onMakePrivate}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "즉시 비공개 전환" }));
    expect(onMakePrivate).toHaveBeenCalledOnce();

    rerender(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="scheduled"
          workId="work-scheduled"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
          onMakePrivate={onMakePrivate}
          recoveryBusy
          recoveryError="다른 창의 변경을 먼저 확인해 주세요."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "비공개 전환 중..." })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("alert").textContent).toContain("다른 창의 변경");
  });
});

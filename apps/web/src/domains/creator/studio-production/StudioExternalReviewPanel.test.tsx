// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioExternalReviewPanel } from "./StudioExternalReviewPanel";

const server = vi.hoisted(() => ({
  load: vi.fn(),
  add: vi.fn(),
}));

vi.mock("./studio-production-server-client", () => ({
  loadStudioExternalReview: server.load,
  addStudioExternalReviewFeedback: server.add,
}));

const TOKEN = "A".repeat(43);
const NOW = "2026-09-15T00:00:00.000Z";

function snapshot(role: "viewer" | "commenter" = "commenter") {
  return {
    link: {
      id: "link-1",
      role,
      pageIds: ["page-1"],
      watermark: true,
      allowDownload: false,
      expiresAt: "2026-09-16T00:00:00.000Z",
    },
    work: {
      id: "work-1",
      title: "외부 검토 원고",
      description: "검수 설명",
      cover: "",
      pages: [{ id: "page-1", index: 0, source: "data:image/png;base64,AA==" }],
    },
    feedback: [],
  };
}

beforeEach(() => {
  server.load.mockReset();
  server.add.mockReset();
});
afterEach(cleanup);

describe("StudioExternalReviewPanel", () => {
  it("anchors a comment to normalized canvas coordinates and renders the saved location", async () => {
    server.load.mockResolvedValueOnce(snapshot());
    server.add.mockImplementationOnce(async (_token, input) => ({
      id: "feedback-1",
      ...input,
      createdAt: NOW,
    }));
    render(<StudioExternalReviewPanel token={TOKEN} />);

    const pageButton = await screen.findByRole("button", {
      name: "1페이지에서 검토 의견 위치 선택",
    });
    Object.defineProperty(pageButton, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 10,
        y: 20,
        left: 10,
        top: 20,
        right: 210,
        bottom: 420,
        width: 200,
        height: 400,
        toJSON: () => ({}),
      }),
    });
    fireEvent.click(pageButton, { clientX: 60, clientY: 120 });
    expect(screen.getByText("위치 25% · 25%")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "검토자 이름" }), {
      target: { value: "편집자" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "의견" }), {
      target: { value: "표정 방향을 확인해 주세요." },
    });
    fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));

    await waitFor(() => expect(server.add).toHaveBeenCalledWith(TOKEN, {
      kind: "comment",
      reviewerName: "편집자",
      anchor: { pageId: "page-1", x: 0.25, y: 0.25 },
      body: "표정 방향을 확인해 주세요.",
    }));
    expect(await screen.findByText("표정 방향을 확인해 주세요.")).toBeTruthy();
    expect(screen.getByText("위치 25% · 25%")).toBeTruthy();
  });

  it("supports keyboard location selection and lets the reviewer fall back to a page-level comment", async () => {
    server.load.mockResolvedValueOnce(snapshot());
    render(<StudioExternalReviewPanel token={TOKEN} />);
    const pageButton = await screen.findByRole("button", {
      name: "1페이지에서 검토 의견 위치 선택",
    });
    fireEvent.keyDown(pageButton, { key: "Enter" });
    expect(screen.getByText("위치 50% · 50%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "페이지 전체로 변경" }));
    expect(screen.queryByText("위치 50% · 50%")).toBeNull();
  });

  it("keeps viewer links strictly read-only", async () => {
    server.load.mockResolvedValueOnce(snapshot("viewer"));
    render(<StudioExternalReviewPanel token={TOKEN} />);
    await screen.findByText("열람 전용");
    expect(screen.queryByRole("button", { name: /검토 의견 위치 선택/u })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "검토자 이름" })).toBeNull();
    expect(screen.getByText(/댓글 권한이 있는 링크/u)).toBeTruthy();
  });
});

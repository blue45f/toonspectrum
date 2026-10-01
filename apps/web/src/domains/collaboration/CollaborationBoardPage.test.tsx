// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollaborationBoardPage } from "./CollaborationBoardPage";

import type { CollaborationList } from "../../../../../packages/core/src/collaboration";

const list = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<CollaborationList>>());

vi.mock("@/platform/collaboration-client", () => ({
  collaborationClient: { list, save: vi.fn(async () => undefined) },
}));

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={["/collaborate"]}>
      <CollaborationBoardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  list.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("구인·의뢰 게시판 상태", () => {
  it("목록을 못 불러오면 막다른 안내 대신 재시도와 작성 예시를 함께 보여 준다", async () => {
    list.mockRejectedValueOnce(new Error("offline"));
    list.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false, canModerate: false });
    renderBoard();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "공고 목록을 지금 불러올 수 없어요" })).toBeTruthy();
    const templateHrefs = within(alert).getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => typeof href === "string" && href.startsWith("/collaborate/new"));
    expect(templateHrefs).toEqual([
      "/collaborate/new?template=ink",
      "/collaborate/new?template=background",
      "/collaborate/new?template=team",
    ]);

    fireEvent.click(within(alert).getByRole("button", { name: "다시 불러오기" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("조건에 맞는 공고가 아직 없어요.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("공고가 없으면 첫 공고 작성과 작성 예시 링크를 안내한다", async () => {
    list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false, canModerate: false });
    renderBoard();

    expect(await screen.findByText("조건에 맞는 공고가 아직 없어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "첫 공고 작성하기" }).getAttribute("href")).toBe("/collaborate/new");
    expect(screen.getByRole("link", { name: "배경 작업 의뢰" }).getAttribute("href")).toBe("/collaborate/new?template=background");
  });
});

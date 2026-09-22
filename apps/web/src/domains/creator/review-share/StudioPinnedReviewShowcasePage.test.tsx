// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPinnedReviewShowcasePage } from "./StudioPinnedReviewShowcasePage";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("./studio-pinned-review-share-client", () => ({ listPinnedReviewShowcase: mocks.list }));

const first = { id: "11111111-1111-4111-8111-111111111111", title: "승인된 1화", pageCount: 2, expiresAt: "2030-09-23T00:00:00.000Z" };
const second = { id: "22222222-2222-4222-8222-222222222222", title: "승인된 2화", pageCount: 1, expiresAt: "2030-09-24T00:00:00.000Z" };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("approved immutable review showcase", () => {
  it("lists only the server-approved public snapshots and links to their public ids", async () => {
    mocks.list.mockResolvedValue({ items: [first], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: first.title })).toBeTruthy();
    expect(screen.getByText("고정 이미지 2페이지")).toBeTruthy();
    expect(screen.getByRole("link", { name: "승인본 보기" }).getAttribute("href")).toBe(`/showcase/reviews/${first.id}`);
    expect(mocks.list).toHaveBeenCalledWith(null);
  });

  it("paginates with an opaque cursor without duplicating an already listed share", async () => {
    mocks.list.mockResolvedValueOnce({ items: [first], nextCursor: first.id })
      .mockResolvedValueOnce({ items: [first, second], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "승인본 더 보기" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(first.id));
    expect(await screen.findByRole("heading", { name: second.title })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: first.title })).toHaveLength(1);
  });

  it("keeps ordinary works separate when no approved showcase snapshot exists", async () => {
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
    render(<MemoryRouter><StudioPinnedReviewShowcasePage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "현재 공개 중인 승인본이 없습니다" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "일반 작품 전시로 돌아가기" }).getAttribute("href")).toBe("/showcase");
  });
});

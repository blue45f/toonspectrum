// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketLibraryPage } from "./MarketCloudLibraryPage";

import type { CreatorMarketplaceCloudLibraryItem, CreatorMarketplaceCloudLibraryPage } from "@/shared/lib/creator-marketplace-cloud-library-contract";

const api = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), archive: vi.fn() }));
vi.mock("@/src/compat/auth-session-store", () => ({ useSession: api.session }));
vi.mock("@/src/infrastructure/creator-marketplace-client", () => ({
  listCreatorMarketplaceCloudLibrary: api.list,
  setCreatorMarketplaceCloudLibraryArchived: api.archive,
}));

function authenticated(id = "account-a") {
  return { data: { user: { id } }, ready: true, status: "authenticated" };
}

function item(name = "성검"): CreatorMarketplaceCloudLibraryItem {
  return {
    id: `library-${name}`, logicalPackId: `community:${"a".repeat(64)}`, packageId: `pack/${name}`,
    name, kind: "3d-asset", membership: "active", addedAt: "2026-09-07T00:00:00Z", archivedAt: null,
    addedFrom: { releaseId: "123e4567-e89b-42d3-a456-426614174001", resourceVersion: "1.0.0", releaseOrdinal: 1, manifestHash: "1".repeat(64) },
    confirmation: { state: "none" },
    catalog: { state: "available", head: {
      id: "123e4567-e89b-42d3-a456-426614174002", name, kind: "3d-asset", resourceVersion: "2.0.0",
      minimumStudioVersion: "0.1.0", releaseOrdinal: 2, manifestHash: "2".repeat(64),
    } },
    updateState: "no-account-confirmation",
  };
}

function page(items: CreatorMarketplaceCloudLibraryItem[] = [], nextCursor: string | null = null): CreatorMarketplaceCloudLibraryPage {
  return { items, nextCursor, hasMore: nextCursor !== null, limit: 50 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { resolve, reject, promise };
}

function view() {
  return <MemoryRouter initialEntries={["/market/library"]}><MarketLibraryPage /></MemoryRouter>;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.session.mockReturnValue(authenticated());
  api.list.mockResolvedValue(page());
  api.archive.mockResolvedValue({ changed: true });
});

afterEach(cleanup);

describe("account library page behavior", () => {
  it("waits for authentication and never loads a signed-out library", async () => {
    api.session.mockReturnValue({ data: null, ready: false, status: "loading" });
    const rendered = render(view());
    expect(screen.getByRole("status").textContent).toContain("세션 확인");
    expect(api.list).not.toHaveBeenCalled();
    api.session.mockReturnValue({ data: { user: {} }, ready: true, status: "unauthenticated" });
    rendered.rerender(view());
    expect(await screen.findByText("로그인 후 계정 라이브러리를 사용할 수 있어요")).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("shows active and archived empty states and refreshes the current view", async () => {
    render(view());
    expect(await screen.findByText("소장한 에셋이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "보관됨" }));
    expect(await screen.findByText("보관된 에셋이 없어요")).toBeTruthy();
    expect(api.list).toHaveBeenLastCalledWith({ view: "archived", limit: 50 }, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
  });

  it("shows server installation evidence and links the exact available release", async () => {
    const newer = item("업데이트 에셋");
    newer.confirmation = { state: "confirmed", scope: "account-ever", releaseId: newer.addedFrom.releaseId, resourceVersion: "1.0.0",
      releaseOrdinal: 1, manifestHash: "1".repeat(64), firstConfirmedAt: "2026-09-07T00:00:00Z", lastConfirmedAt: "2026-09-07T00:00:00Z" };
    newer.updateState = "account-confirmed-update-available";
    const current = { ...item("현재 에셋"), updateState: "account-confirmed-current-head" as const,
      confirmation: { ...newer.confirmation, releaseId: "123e4567-e89b-42d3-a456-426614174002", resourceVersion: "2.0.0",
        releaseOrdinal: 2, manifestHash: "2".repeat(64) } };
    api.list.mockResolvedValue(page([newer, current, item("미설치 에셋")]));
    render(view());
    const heading = await screen.findByRole("heading", { name: "업데이트 에셋" });
    const card = within(heading.closest("li")!);
    expect(card.getByText("계정 설치 확인 1.0.0 → 최신 2.0.0")).toBeTruthy();
    expect(card.getByRole("link", { name: "Studio에서 v2.0.0 업데이트" }).getAttribute("href"))
      .toContain("123e4567-e89b-42d3-a456-426614174002");
    expect(screen.getByText("이 계정에서 Studio v2.0.0 설치 확인")).toBeTruthy();
    expect(screen.getByText("이 계정에서 확인된 Studio 설치 없음")).toBeTruthy();
  });

  it.each([
    ["moderated", "관리자 검수로 현재 사용할 수 없음"],
    ["owner-delisted", "제작자가 공개 목록에서 내림"],
    ["publisher-unavailable", "제작자 계정을 사용할 수 없음"],
    ["removed", "현재 카탈로그에서 제거됨"],
  ] as const)("explains %s availability without offering installation", async (reason, text) => {
    api.list.mockResolvedValue(page([{ ...item(), catalog: { state: "unavailable", reason } }]));
    render(view());
    const heading = await screen.findByRole("heading", { name: "성검" });
    const card = within(heading.closest("li")!);
    expect(card.getAllByText(text).length).toBeGreaterThan(0);
    expect(card.queryByRole("link", { name: /Studio/u })).toBeNull();
    expect(card.getByRole("button", { name: "목록에서 보관" })).toBeTruthy();
  });

  it("retries an initial server failure without presenting stale ownership", async () => {
    api.list.mockRejectedValueOnce(new Error("offline"));
    render(view());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "성검" })).toBeNull();
    api.list.mockResolvedValueOnce(page([item()]));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "성검" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the loaded page on pagination failure and deduplicates a successful retry", async () => {
    api.list.mockResolvedValueOnce(page([item("처음")], "cursor-a"));
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    // A completed empty final page removes the control without removing prior entries.
    expect(await screen.findByRole("heading", { name: "처음" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
    api.list.mockResolvedValueOnce(page([item("처음")], "cursor-a"));
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    api.list.mockRejectedValueOnce(new Error("page unavailable"));
    fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "처음" })).toBeTruthy();
    const next = deferred<CreatorMarketplaceCloudLibraryPage>();
    api.list.mockReturnValueOnce(next.promise);
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(screen.getByRole("button", { name: "불러오는 중" })).toHaveProperty("disabled", true);
    await act(async () => next.resolve(page([item("처음"), item("다음")])));
    expect(screen.getAllByRole("heading", { name: "처음" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "다음" })).toBeTruthy();
    expect(api.list).toHaveBeenLastCalledWith({ view: "active", limit: 50, cursor: "cursor-a" }, expect.any(AbortSignal));
  });

  it("ignores an old account result and a cancelled pagination response", async () => {
    const first = deferred<CreatorMarketplaceCloudLibraryPage>();
    api.list.mockReturnValueOnce(first.promise);
    const rendered = render(view());
    const firstSignal = api.list.mock.calls[0]![1] as AbortSignal;
    api.session.mockReturnValue(authenticated("account-b"));
    api.list.mockResolvedValueOnce(page([item("B 소장")], "b-next"));
    rendered.rerender(view());
    expect(await screen.findByRole("heading", { name: "B 소장" })).toBeTruthy();
    expect(firstSignal.aborted).toBe(true);
    await act(async () => first.resolve(page([item("A 비공개")])));
    expect(screen.queryByText("A 비공개")).toBeNull();
    const next = deferred<CreatorMarketplaceCloudLibraryPage>();
    api.list.mockReturnValueOnce(next.promise);
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    const nextSignal = api.list.mock.lastCall![1] as AbortSignal;
    fireEvent.click(screen.getByRole("tab", { name: "보관됨" }));
    expect(await screen.findByText("보관된 에셋이 없어요")).toBeTruthy();
    await act(async () => next.resolve(page([item("늦은 소장")])));
    expect(nextSignal.aborted).toBe(true);
    expect(screen.queryByText("늦은 소장")).toBeNull();
  });

  it("archives and restores through server confirmation with pending controls locked", async () => {
    const asset = item();
    api.list.mockResolvedValueOnce(page([asset]));
    const pending = deferred<unknown>();
    api.archive.mockReturnValueOnce(pending.promise);
    render(view());
    const button = await screen.findByRole("button", { name: "목록에서 보관" });
    fireEvent.click(button);
    expect(button).toHaveProperty("disabled", true);
    expect(api.archive).toHaveBeenCalledWith(asset.id, true);
    await act(async () => pending.resolve({ changed: true }));
    expect(await screen.findByText("소장한 에셋이 없어요")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("소장 권한과 로컬 설치는 유지");
    api.list.mockResolvedValueOnce(page([{ ...asset, membership: "archived", archivedAt: "2026-09-07T00:00:00Z" }]));
    fireEvent.click(screen.getByRole("tab", { name: "보관됨" }));
    fireEvent.click(await screen.findByRole("button", { name: "소장 목록으로 복원" }));
    expect(api.archive).toHaveBeenLastCalledWith(asset.id, false);
    expect(await screen.findByText("보관된 에셋이 없어요")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("소장 목록으로 복원");
  });

  it.each(["active", "archived"] as const)("retains %s entries when the archive operation fails", async (mode) => {
    api.list.mockResolvedValue(page([item()]));
    api.archive.mockRejectedValue(new Error("not permitted"));
    render(view());
    await screen.findByRole("heading", { name: "성검" });
    if (mode === "archived") fireEvent.click(screen.getByRole("tab", { name: "보관됨" }));
    const button = await screen.findByRole("button", { name: mode === "active" ? "목록에서 보관" : "소장 목록으로 복원" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "성검" })).toBeTruthy();
    expect(button).toHaveProperty("disabled", false);
  });

  it("discards a late archive result after switching accounts", async () => {
    const pending = deferred<unknown>();
    api.archive.mockReturnValueOnce(pending.promise);
    api.list.mockResolvedValueOnce(page([item()]));
    const rendered = render(view());
    fireEvent.click(await screen.findByRole("button", { name: "목록에서 보관" }));
    api.session.mockReturnValue(authenticated("account-b"));
    rendered.rerender(view());
    expect(await screen.findByText("소장한 에셋이 없어요")).toBeTruthy();
    await act(async () => pending.resolve({ changed: true }));
    expect(screen.queryByText(/계정 라이브러리의 보관 목록으로 이동/u)).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});

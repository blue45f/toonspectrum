// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalBooksPage } from "./GlobalBooksPage";

import type { CreatorResource, ResourceSearchResult } from "@/shared/lib/creator-resources";

import { CREATOR_WORKSPACE_KEY } from "@/shared/lib/creator-workspace-persistence";

vi.mock("./ProviderStatus", () => ({ ProviderStatus: () => null }));

const request = vi.fn<typeof fetch>();
const now = "2026-09-07T12:00:00.000Z";

function book(provider: "openlibrary" | "openbd", title = "Drawing reference"): CreatorResource {
  return {
    id: `${provider}:${title}`, provider, title, creator: "Artist", description: "Edition notes",
    sourceUrl: provider === "openbd" ? "https://openbd.jp/" : "https://openlibrary.org/works/OL1W",
    license: provider === "openbd" ? "book-promotion" : "metadata-only", licenseUrl: "",
    credit: "Publisher", fetchedAt: now, dateLabel: "2026", isbn: "9784088820118",
  };
}

function response(provider: "openlibrary" | "openbd", options: Partial<ResourceSearchResult> = {}) {
  return Response.json({ provider, status: "ready", items: [book(provider)], page: 1,
    hasMore: false, fetchedAt: now, message: "", ...options });
}

function renderPage(search = "") {
  return render(<MemoryRouter initialEntries={[`/research/books${search}`]}><GlobalBooksPage /></MemoryRouter>);
}

function submit(query: string) {
  const input = screen.getByRole("searchbox", { name: "작품명·작가·ISBN 검색" });
  fireEvent.change(input, { target: { value: query } });
  fireEvent.submit(input.closest("form")!);
}

beforeEach(() => {
  localStorage.clear();
  request.mockReset().mockResolvedValue(response("openlibrary"));
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("global book search and saved sources", () => {
  it("starts without a request and submits an edited query through the page URL", async () => {
    renderPage();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "출처 내보내기" })).toHaveProperty("disabled", true);
    submit(" manga art ");
    expect(await screen.findByRole("heading", { name: "Drawing reference" })).toBeTruthy();
    const url = new URL(String(request.mock.calls[0]![0]), "https://local.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ provider: "openlibrary", q: "manga art", page: "1" });
    expect(screen.getByRole("link", { name: "원문 확인" }).getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("button", { name: "이전" })).toHaveProperty("disabled", true);
  });

  it.each(["x", "x".repeat(81)])("rejects invalid query length before requesting providers (%s)", async (query) => {
    renderPage(`?q=${query}`);
    expect((await screen.findByRole("alert")).textContent).toContain("2~80자");
    expect(request).not.toHaveBeenCalled();
  });

  it("queries both ISBN providers, keeps a partial result, and retries the failed provider", async () => {
    request.mockResolvedValueOnce(response("openlibrary", { message: "English editions" }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "9784088820118" }));
    expect(await screen.findByRole("heading", { name: "Drawing reference" })).toBeTruthy();
    expect(screen.getByText(/일부 제공처는 응답하지 않았지만/u)).toBeTruthy();
    expect(screen.getByText(/English editions/u)).toBeTruthy();
    expect(request.mock.calls.map(([url]) => new URL(String(url), "https://local.test").searchParams.get("provider")))
      .toEqual(["openlibrary", "openbd"]);
    request.mockResolvedValueOnce(response("openlibrary"))
      .mockResolvedValueOnce(response("openbd", { items: [book("openbd", "Japanese edition")] }));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "Japanese edition" })).toBeTruthy();
    expect(screen.getByText("도서 소개 목적")).toBeTruthy();
    expect(screen.queryByText(/일부 제공처는 응답하지 않았지만/u)).toBeNull();
  });

  it.each(["http", "wrong-provider", "malformed", "non-error"])("recovers from a provider %s failure", async (failure) => {
    if (failure === "http") request.mockResolvedValueOnce(new Response(null, { status: 503 }));
    if (failure === "wrong-provider") request.mockResolvedValueOnce(response("openbd"));
    if (failure === "malformed") request.mockResolvedValueOnce(Response.json({ items: "invalid" }));
    if (failure === "non-error") request.mockRejectedValueOnce("network unavailable");
    renderPage("?q=graphic+novel");
    expect((await screen.findByRole("alert")).textContent).toContain("모든 제공처");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "Drawing reference" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps results when the provider reports partial availability", async () => {
    request.mockResolvedValueOnce(response("openlibrary", { status: "partial" }));
    renderPage("?q=manga");
    expect(await screen.findByRole("heading", { name: "Drawing reference" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("reports an empty completed search and corrects invalid page parameters", async () => {
    request.mockResolvedValueOnce(response("openlibrary", { items: [] }));
    renderPage("?q=manga&page=NaN");
    expect(await screen.findByText(/표시할 판본을 찾지 못했습니다/u)).toBeTruthy();
    expect(String(request.mock.calls[0]![0])).toContain("page=1");
  });

  it("paginates ISBN results through Open Library and returns to the previous page", async () => {
    request.mockResolvedValueOnce(response("openlibrary", { hasMore: true, page: 2 }));
    renderPage("?q=9784088820118&page=2");
    expect(await screen.findByText("2 페이지")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(response("openlibrary", { hasMore: true, page: 3 }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(await screen.findByText("3 페이지")).toBeTruthy();
    request.mockResolvedValueOnce(response("openlibrary", { page: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(await screen.findByText("2 페이지")).toBeTruthy();
  });

  it("does not wrap the final supported page back to page one", async () => {
    request.mockResolvedValueOnce(response("openlibrary", { hasMore: true, page: 20 }));
    renderPage("?q=manga&page=20");
    expect(await screen.findByText("20 페이지")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음" })).toHaveProperty("disabled", true);
  });

  it("ignores a late response after a new search and aborts the superseded request", async () => {
    let resolveOld!: (value: Response) => void;
    request.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    renderPage("?q=old+query");
    const oldSignal = request.mock.calls[0]![1]!.signal!;
    submit("new query");
    expect(await screen.findByRole("heading", { name: "Drawing reference" })).toBeTruthy();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolveOld(response("openlibrary", { items: [book("openlibrary", "Old edition")] })));
    expect(screen.queryByRole("heading", { name: "Old edition" })).toBeNull();
  });

  it("saves and removes real board records and exports their attribution", async () => {
    const createUrl = vi.fn<(blob: Blob) => string>(() => "blob:book-sources");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage("?q=manga");
    fireEvent.click(await screen.findByRole("button", { name: "보드에 저장" }));
    expect((await screen.findByRole("button", { name: "저장 해제" })).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(localStorage.getItem(CREATOR_WORKSPACE_KEY)!).saved[0].title).toBe("Drawing reference");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "출처 내보내기" }));
    expect(createUrl.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(click.mock.instances[0]).toHaveProperty("download", "toonstudio-global-book-sources.md");
    act(() => vi.advanceTimersByTime(10_000));
    expect(revokeUrl).toHaveBeenCalledWith("blob:book-sources");
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "저장 해제" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CREATOR_WORKSPACE_KEY)!).saved).toEqual([]));
    expect(screen.getByRole("button", { name: "출처 내보내기" })).toHaveProperty("disabled", true);
  });

  it("keeps metadata readable when safe concurrent storage is unavailable", async () => {
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    request.mockResolvedValueOnce(response("openlibrary", { items: [{ ...book("openlibrary"), creator: "", description: "", credit: "", isbn: "", dateLabel: "" }] }));
    renderPage("?q=manga");
    const card = await screen.findByRole("article");
    expect(within(card).getByText(/저자 정보는 원문/u)).toBeTruthy();
    expect(within(card).getByRole("button", { name: "보드에 저장" })).toHaveProperty("disabled", true);
    expect(within(card).getByRole("link", { name: "원문 확인" })).toBeTruthy();
  });
});

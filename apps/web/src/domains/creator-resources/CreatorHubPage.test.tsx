// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorHubPage } from "./CreatorHubPage";

import type { CreatorResource, CreatorWorkspace } from "@/shared/lib/creator-resources";

import { CREATOR_WORKSPACE_KEY } from "@/shared/lib/creator-workspace-persistence";

vi.mock("./ProviderStatus", () => ({ ProviderStatus: () => <p>provider-status-loaded</p> }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function resource(options: Partial<CreatorResource> & Pick<CreatorResource, "id" | "provider" | "title">): CreatorResource {
  const sourceUrl = options.provider === "met"
    ? "https://www.metmuseum.org/art/collection/search/1"
    : options.provider === "bizinfo"
      ? "https://www.bizinfo.go.kr/example"
      : "https://openlibrary.org/works/OL1W";
  return {
    creator: "Creator",
    description: "Detailed visual reference",
    sourceUrl,
    license: options.provider === "met" ? "CC0" : "metadata-only",
    licenseUrl: "",
    credit: "Provider",
    fetchedAt: "2026-09-08T00:00:00.000Z",
    ...options,
  };
}

function workspace(values: Partial<CreatorWorkspace> = {}): CreatorWorkspace {
  return { version: 1, saved: [], story: {}, checks: [], ...values };
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/research"]}><CreatorHubPage /><LocationProbe /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
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

describe("research command center", () => {
  it("starts with an honest empty state, validates a query, and navigates to the selected provider workflow", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "창작 리서치 데스크" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "첫 장면의 근거를 하나 저장하세요" })).toBeTruthy();
    expect(screen.queryByText("provider-status-loaded")).toBeNull();

    const query = screen.getByRole("searchbox", { name: "시각 레퍼런스 검색" });
    fireEvent.change(query, { target: { value: "x" } });
    fireEvent.submit(query.closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain("2~80자");

    fireEvent.click(screen.getByRole("button", { name: /글로벌 판본/u }));
    expect(screen.getByRole("searchbox", { name: "글로벌 판본 검색" }).getAttribute("placeholder")).toContain("Alice");
    fireEvent.click(screen.getByRole("button", { name: "Alice in Wonderland" }));
    fireEvent.submit(screen.getByRole("searchbox", { name: "글로벌 판본 검색" }).closest("form")!);
    expect(screen.getByTestId("location").textContent).toBe("/research/books?q=Alice+in+Wonderland&page=1");

    const details = screen.getByText("데이터 제공처 연결 상태와 한계 확인").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText("provider-status-loaded")).toBeTruthy();
  });

  it("shows workspace evidence, recent sources, filtering, removal, and a downloadable research brief", async () => {
    const saved = [
      resource({ id: "met:costume", provider: "met", title: "Costume reference", imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP251139.jpg" }),
      resource({ id: "openlibrary:edition", provider: "openlibrary", title: "Edition reference" }),
      resource({ id: "bizinfo:grant", provider: "bizinfo", title: "Grant reference", deadline: "2026-09-20" }),
    ];
    localStorage.setItem(CREATOR_WORKSPACE_KEY, JSON.stringify(workspace({
      saved,
      story: { title: "Night Train", protagonist: "Mina", desire: "Escape", obstacle: "Closed border" },
      checks: ["publish-rights"],
    })));
    const createUrl = vi.fn<(blob: Blob) => string>(() => "blob:research-brief");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const { container } = renderPage();
    const overview = screen.getByText("저장한 자료").closest("div")!;
    await waitFor(() => expect(within(overview).getByText("3")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "다시 볼 자료" })).toBeTruthy();
    expect(container.querySelector('img[src="https://images.metmuseum.org/CRDImages/as/original/DP251139.jpg"]')).toBeTruthy();
    expect(screen.getByRole("heading", { name: "조사와 기획을 실제 장면으로 옮길 차례입니다" })).toBeTruthy();

    const board = screen.getByRole("heading", { name: "저장한 자료 찾기" }).closest("section")!;
    const boardQuery = within(board).getByRole("searchbox", { name: "제목·저작자·설명·ISBN 검색" });
    fireEvent.change(boardQuery, { target: { value: "Costume" } });
    expect(within(board).getByRole("status").textContent).toContain("전체 3개 중 1개");
    fireEvent.click(within(board).getByRole("button", { name: "필터 초기화" }));
    expect((boardQuery as HTMLInputElement).value).toBe("");

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "리서치 브리프 내보내기" }));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(createUrl.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(click.mock.instances[0]).toHaveProperty("download", "toonstudio-research-brief.md");
    act(() => vi.advanceTimersByTime(10_000));
    expect(revokeUrl).toHaveBeenCalledWith("blob:research-brief");
    vi.useRealTimers();

    fireEvent.click(within(board).getByRole("button", { name: "Costume reference 저장 해제" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CREATOR_WORKSPACE_KEY)!).saved).toHaveLength(2));
  });

  it("merges a valid backup without discarding the current board", async () => {
    localStorage.setItem(CREATOR_WORKSPACE_KEY, JSON.stringify(workspace({
      saved: [resource({ id: "met:current", provider: "met", title: "Current source" })],
      story: { title: "Current title" },
    })));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const input = await screen.findByLabelText("백업 합치기 · 현재 자료와 작성한 기획서 유지");
    const incoming = workspace({
      saved: [resource({ id: "openlibrary:new", provider: "openlibrary", title: "Backup source" })],
      story: { title: "Backup title", protagonist: "Backup protagonist" },
    });
    const file = new File([JSON.stringify(incoming)], "board.json", { type: "application/json" });
    if (typeof file.text !== "function") Object.defineProperty(file, "text", { value: async () => JSON.stringify(incoming) });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("현재 작업을 유지하고 백업을 합쳤습니다.")).toBeTruthy();
    const restored = JSON.parse(localStorage.getItem(CREATOR_WORKSPACE_KEY)!) as CreatorWorkspace;
    expect(restored.saved.map((item) => item.title)).toEqual(["Current source", "Backup source"]);
    expect(restored.story.title).toBe("Current title");
    expect(restored.story.protagonist).toBe("Backup protagonist");
  });
});

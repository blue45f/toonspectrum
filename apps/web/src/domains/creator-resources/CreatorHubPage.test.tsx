// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorHubPage } from "./CreatorHubPage";
import { RESEARCH_DESK_SESSION_KEY } from "./research-desk-session";

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

function renderPage(entry = "/research") {
  return render(<MemoryRouter initialEntries={[entry]}><CreatorHubPage /><LocationProbe /></MemoryRouter>);
}

function openDeskTab(name: RegExp | string) {
  fireEvent.click(screen.getByRole("tab", { name }));
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
    // 아무것도 하지 않은 첫 방문에는 0으로 채운 통계 대신 다음 행동과 짧은 안내만 보인다.
    expect(screen.queryByText("저장한 자료")).toBeNull();
    expect(screen.getByText(/자료를 저장하거나 리서치 초점·기획을 적으면/u)).toBeTruthy();
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

  it("persists a bounded research focus, supports keyboard search, and records cross-source launches", async () => {
    renderPage();
    openDeskTab("리서치 초점");
    const title = screen.getByLabelText("리서치 이름");
    const question = screen.getByLabelText("핵심 질문");
    const context = screen.getByLabelText("시대·장소·제약");
    fireEvent.change(title, { target: { value: "1화 야간 역무실" } });
    fireEvent.change(question, { target: { value: "역무원이 쓰던 도구는 무엇인가?" } });
    fireEvent.change(context, { target: { value: "1920년대 겨울밤" } });
    fireEvent.click(screen.getByRole("button", { name: "작품·판본" }));

    const search = screen.getByRole("searchbox", { name: "글로벌 판본 검색" });
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "Alice in Wonderland" } });
    expect(screen.getByRole("button", { name: "시각 레퍼런스에서 Alice in Wonderland 검색" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "작가 기회에서 Alice in Wonderland 검색" }));

    expect(screen.getByTestId("location").textContent).toBe("/opportunities?q=Alice+in+Wonderland&page=1");
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(RESEARCH_DESK_SESSION_KEY)!) as { title: string; intent: string; history: unknown[] };
      expect(persisted).toMatchObject({ title: "1화 야간 역무실", intent: "edition" });
      expect(persisted.history).toHaveLength(1);
    });
    expect(screen.getByRole("button", { name: "작가 기회 검색어 Alice in Wonderland 다시 사용" })).toBeTruthy();
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
    expect(screen.getByRole("heading", { name: "자료가 많은가보다 무엇이 비어 있는가" })).toBeTruthy();
    expect(container.querySelector('img[src="https://images.metmuseum.org/CRDImages/as/original/DP251139.jpg"]')).toBeTruthy();
    expect(screen.getByRole("heading", { name: "무엇을 찾을 수 있나요" })).toBeTruthy();
    // 범주 타일은 이 브라우저에 저장한 자료 수를 제공처 기준으로 함께 보여 준다(Met 1개).
    const referenceTile = screen.getByRole("link", { name: /레퍼런스 아틀라스/u });
    expect(referenceTile.getAttribute("href")).toBe("/research/assets");
    expect(referenceTile.textContent).toContain("저장 1");

    openDeskTab(/저장 보드/u);
    expect(screen.getByTestId("location").textContent).toBe("/research?view=board");
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
    renderPage("/research?view=board");
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

  it("leads with searchable categories and task recipes, and keeps every workspace area one tab away", async () => {
    localStorage.setItem(CREATOR_WORKSPACE_KEY, JSON.stringify(workspace({
      saved: [
        resource({ id: "met:one", provider: "met", title: "One" }),
        resource({ id: "met:two", provider: "met", title: "Two" }),
        resource({ id: "met:three", provider: "met", title: "Three" }),
        resource({ id: "openlibrary:four", provider: "openlibrary", title: "Four" }),
      ],
      story: { title: "A", protagonist: "B", desire: "C", obstacle: "D" },
    })));
    renderPage("/research#saved-board");

    // 첫 화면: 통합 검색 + 범주 타일(제공처 수·이용 조건) + 작업별 추천 조합.
    expect(screen.getByRole("searchbox", { name: "시각 레퍼런스 검색" })).toBeTruthy();
    const categories = screen.getByRole("list", { name: "리서치 자료 범주" });
    expect(within(categories).getAllByRole("link").length).toBeGreaterThanOrEqual(10);
    expect(within(categories).getByRole("link", { name: /3D 모델·HDRI/u }).textContent).toContain("CC0");
    expect(within(categories).getByRole("link", { name: /공개 데이터/u }).textContent).toMatch(/출처 \d+곳/u);
    // 이용 조건은 타일 배지와 같은 낱말(CC0·참고용)로 한 줄 안내한다.
    const licenseLine = document.querySelector("[data-research-license-line]")?.textContent ?? "";
    expect(licenseLine).toContain("CC0");
    expect(licenseLine).toContain("참고용");
    expect(licenseLine).toContain("저장하면 출처·조건이 함께 남아요");
    expect(within(categories).getByRole("link", { name: /폰트·레터링/u }).getAttribute("href")).toBe("/research/fonts");
    const recipes = screen.getByRole("list", { name: "작업별 추천 조합" });
    const backgroundRecipe = within(recipes).getByRole("heading", { name: "3D 배경 세트" }).closest("article")!;
    expect(within(backgroundRecipe).getByRole("link", { name: /HDRI 조명/u }).getAttribute("href")).toBe("/research/3d-assets?q=sunset&page=1");
    expect(within(backgroundRecipe).getByRole("link", { name: /3D 배경에서 조립/u }).getAttribute("href")).toBe("/studio/bg3d");

    // 예전 섹션 앵커(#saved-board)로 들어오면 저장 보드 탭이 열린다.
    const boardTab = await screen.findByRole("tab", { name: /저장 보드/u });
    await waitFor(() => expect(boardTab.getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("heading", { name: "저장한 자료 찾기" })).toBeTruthy();

    // 탭은 ←/→·Home·End로 이동하며 선택과 초점이 함께 움직인다.
    fireEvent.keyDown(boardTab, { key: "Home" });
    const overviewTab = screen.getByRole("tab", { name: "진행 현황" });
    expect(overviewTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(overviewTab);
    fireEvent.keyDown(overviewTab, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /저장 보드/u }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "진행 현황" }).getAttribute("aria-selected")).toBe("true");

    // 한 번 연 패널은 숨김 상태로 유지되어 입력값을 잃지 않는다.
    expect(screen.getByRole("heading", { name: "저장한 자료 찾기", hidden: true }).closest("[role=tabpanel]")?.hasAttribute("hidden")).toBe(true);
    openDeskTab(/판단 노트/u);
    expect(screen.getByRole("heading", { name: "자료를 장면 선택으로 바꾸는 판단 노트" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/research?view=notes");
  });
});

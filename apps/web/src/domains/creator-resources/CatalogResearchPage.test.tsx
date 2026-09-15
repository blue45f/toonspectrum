// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogResearchPage } from "./CatalogResearchPage";
import { downloadResearchFile, loadCatalogResearch } from "./catalog-research-data";
import { buildResearchSnapshot, emptyResearchNotebook, parseResearchSnapshot, RESEARCH_NOTE_KEY } from "@/shared/lib/catalog-research";

vi.mock("./catalog-research-data", () => ({ loadCatalogResearch: vi.fn(), downloadResearchFile: vi.fn() }));
const records = Array.from({ length: 30 }, (_, index) => ({ id: `w${index}`, slug: `w${index}`, title: `작품 ${String(index).padStart(2, "0")}`, author: "김 작가", type: "webtoon", status: "ongoing", ageRating: "all", releaseYear: 2020 + index % 5, genres: [index % 2 ? "액션" : "판타지"], tags: ["회귀"], availability: [{ platformId: "naver-webtoon" }] }));
const dataset = parseResearchSnapshot(buildResearchSnapshot(records, { crawledAt: "2026-06-27T03:50:38Z", sourceVersion: "test" }, "0123456789abcdef"));
const load = vi.mocked(loadCatalogResearch); const download = vi.mocked(downloadResearchFile);
function page(path = "/research/catalog") { return render(<MemoryRouter initialEntries={[path]}><CatalogResearchPage /></MemoryRouter>); }
beforeEach(() => {
  localStorage.clear(); load.mockReset().mockResolvedValue({ dataset, mode: "network", offlineReady: false }); download.mockReset();
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { locks: { request: async (_key: string, operation: () => unknown) => operation() } }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("catalog research user journeys", () => {
  it("renders provenance, visible count values, and paginated results", async () => {
    page(); await screen.findByRole("heading", { name: "비교할 작품 찾기" });
    expect(screen.getAllByRole("button", { name: /작품 \d+ 비교 선택/u })).toHaveLength(24);
    expect(screen.getByRole("button", { name: "이전 결과" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다음 결과" }));
    expect(screen.getAllByRole("button", { name: /작품 \d+ 비교 선택/u })).toHaveLength(6);
    expect(screen.getByText(/원본 전체 수집 기록/u).textContent).toContain("2026");
    expect(screen.getByRole("region", { name: "장르별 수록 분포" }).textContent).toContain("50.0%");
  });
  it("submits Korean searches without additional API calls and resets pagination", async () => {
    page("/research/catalog?page=2"); const input = await screen.findByRole("searchbox", { name: "작품명·작가·장르·태그 검색" });
    fireEvent.change(input, { target: { value: "작품 01" } }); fireEvent.submit(input.closest("form")!);
    expect(screen.getAllByRole("button", { name: /작품 \d+ 비교 선택/u })).toHaveLength(1); expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "작품 01 비교 선택" })).toBeTruthy();
  });
  it("enforces four selections and carries them to the planning page", async () => {
    page(); await screen.findByRole("heading", { name: "비교할 작품 찾기" });
    for (const index of [0, 1, 2, 3]) fireEvent.click(screen.getByRole("button", { name: `작품 0${index} 비교 선택` }));
    expect(screen.getByRole("button", { name: "작품 04 비교 선택" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "비교로 기획 시작" }));
    expect(screen.getByRole("heading", { name: "작품 비교·기획 노트" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /비교에서 제거/u })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "비교 목록 CSV 내보내기" })); expect(download.mock.calls[0]?.[1]).toContain("작품 03");
  });
  it("handles empty filters, malformed page values and unknown selected IDs", async () => {
    page("/research/catalog?genre=없는장르&page=Infinity&compare=missing");
    expect(await screen.findByText(/조건에 맞는 작품이 없습니다/u)).toBeTruthy();
    expect(screen.getByText(/선택 중 1편/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" })); expect(screen.getAllByRole("button", { name: /작품 \d+ 비교 선택/u })).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "선택 비우기" })); expect(screen.queryByText(/선택 중 1편/u)).toBeNull();
  });
  it("shows a failed index and allows retry", async () => {
    load.mockRejectedValueOnce(new Error("연결 실패")); page(); expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "색인 다시 불러오기" })); await screen.findByRole("heading", { name: "비교할 작품 찾기" }); expect(load).toHaveBeenCalledTimes(2);
  });
  it("saves a private notebook and exports it with source metadata", async () => {
    page("/research/catalog/notebook?compare=w0"); const input = await screen.findByLabelText(/조사 질문/u);
    fireEvent.change(input, { target: { value: "나만의 비밀 기획" } }); fireEvent.click(screen.getByRole("button", { name: "기획 노트 저장" }));
    await waitFor(() => expect(localStorage.getItem(RESEARCH_NOTE_KEY)).toContain("나만의 비밀 기획"));
    fireEvent.click(screen.getByRole("button", { name: "Markdown 내보내기" })); expect(download.mock.calls[0]?.[1]).toContain("2026-06-27");
    expect(download.mock.calls[0]?.[1]).toContain("나만의 비밀 기획");
  });
  it("preserves newer data written by another tab", async () => {
    page("/research/catalog/notebook"); await screen.findByLabelText(/조사 질문/u);
    const newer = JSON.stringify({ ...emptyResearchNotebook(), question: "다른 탭의 노트" }); localStorage.setItem(RESEARCH_NOTE_KEY, newer);
    fireEvent.click(screen.getByRole("button", { name: "기획 노트 저장" }));
    expect(await screen.findByText(/다른 탭에서 노트가 변경/u)).toBeTruthy(); expect(localStorage.getItem(RESEARCH_NOTE_KEY)).toBe(newer);
  });
  it("does not overwrite damaged stored notes", async () => {
    localStorage.setItem(RESEARCH_NOTE_KEY, "{"); page("/research/catalog/notebook"); await screen.findByLabelText(/조사 질문/u);
    expect(screen.getByRole("button", { name: "기획 노트 저장" }).hasAttribute("disabled")).toBe(true); expect(localStorage.getItem(RESEARCH_NOTE_KEY)).toBe("{");
  });
});

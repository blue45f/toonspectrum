import { describe, expect, it } from "vitest";
import { buildResearchSnapshot, countResearchFacets, emptyResearchNotebook, normalizeResearchText, parseResearchNotebook, parseResearchSnapshot, readResearchFilters, readResearchSelection, RESEARCH_NOTE_KEY, researchCsv, researchMarkdown, researchPrompts, saveResearchNotebook, selectResearchWorks } from "./catalog-research";

const hash = "0123456789abcdef";
const metadata = { crawledAt: "2026-06-27T03:50:38Z", sourceVersion: "crawl-v1", metadata: { kmas: { updatedAt: "2026-07-06T12:07:06Z" } } };
const source = [
  { id: "b", slug: "b", title: "회귀 학교", author: "김 작가", type: "webtoon", status: "ongoing", releaseYear: 2024, ageRating: "all", genres: ["판타지", "판타지"], tags: ["회귀", "학원"], availability: [{ platformId: "naver-webtoon" }, { platformId: "naver-webtoon" }], synopsis: "DO_NOT_COPY", coverImage: "https://example.com/no.jpg", stats: { views: 90000, trendingScore: 88 } },
  { id: "a", slug: "a", title: "다른 이야기", author: "박 작가", type: "webnovel", status: "completed", releaseYear: 2020, ageRating: "all", genres: ["판타지", "액션"], tags: ["모험"], availability: [{ platformId: "ridi" }] },
  { id: "c", slug: "c", title: "비공개 연령", author: "작가", type: "webtoon", ageRating: "19", genres: [], tags: [], availability: [] },
];
const build = () => buildResearchSnapshot(source, metadata, hash);
const works = () => parseResearchSnapshot(build()).works;
const filters = (query = "") => readResearchFilters(new URLSearchParams(query));
describe("metadata-only research index", () => {
  it("is deterministic and carries original collection time, not generation time", () => {
    expect(build()).toEqual(build()); expect(build().collectedAt).toBe(metadata.crawledAt);
    expect(build().enrichedAt).toBe(metadata.metadata.kmas.updatedAt); expect(build().sourceHash).toBe(hash);
    expect(JSON.stringify(build())).not.toMatch(/DO_NOT_COPY|no.jpg|trendingScore|views/u);
  });
  it("deduplicates IDs and facets, reports excluded records, leaves missing years unknown", () => {
    const snapshot = buildResearchSnapshot([...source, source[0], { id: "invalid", type: "movie" }, null], {}, hash);
    const parsed = parseResearchSnapshot(snapshot); expect(snapshot.excludedCount).toBe(3); expect(snapshot.inputCount).toBe(6);
    expect(parsed.works.find((work) => work.id === "b")?.genres).toEqual(["판타지"]);
    expect(parsed.works.find((work) => work.id === "c")?.year).toBeNull(); expect(snapshot.collectedAt).toBeNull();
  });
  it("sorts by Korean title once when decoding", () => { expect(works().map((work) => work.id)).toEqual(["a", "c", "b"]); });
  it.each([null, {}, { ...build(), sourceHash: "bad" }, { ...build(), inputCount: -1 }, { ...build(), collectedAt: "yesterday" }, { ...build(), rows: [build().rows[0], build().rows[0]], inputCount: 2 }])("rejects malformed snapshots", (value) => { expect(() => parseResearchSnapshot(value)).toThrow(); });
  it("rejects out-of-bounds dictionary indices without rendering partial data", () => { const data = build(); data.rows[0]![7] = [999999]; expect(() => parseResearchSnapshot(data)).toThrow(); });
});
describe("research filtering and honest counts", () => {
  it("excludes mature works by default and supports explicit inclusion", () => { expect(selectResearchWorks(works(), filters())).toHaveLength(2); expect(selectResearchWorks(works(), filters("mature=true"))).toHaveLength(3); });
  it("combines query, genre, tag, platform, type and status with AND", () => {
    expect(selectResearchWorks(works(), filters("q=김+회귀&genre=판타지&tag=학원&platform=naver-webtoon&type=webtoon&status=ongoing")).map((work) => work.id)).toEqual(["b"]);
    expect(selectResearchWorks(works(), filters("tag=없는태그"))).toEqual([]);
  });
  it("normalizes Korean decomposed and fullwidth characters", () => { expect(normalizeResearchText(" ＡＢＣ  가 ".normalize("NFD"))).toBe("abc 가"); });
  it("counts each work once per category while preserving overlapping categories", () => {
    const rows = countResearchFacets(selectResearchWorks(works(), filters()), "genres");
    expect(rows).toEqual([{ name: "판타지", count: 2, share: 100 }, { name: "액션", count: 1, share: 50 }]);
    expect(countResearchFacets([], "tags")).toEqual([]);
  });
  it("bounds URL parameters and selection to four unique IDs", () => {
    expect(readResearchSelection(new URLSearchParams("compare=a,a,b,c,d,e"))).toEqual(["a", "b", "c", "d"]);
    expect(filters("type=script&status=bad&sort=rating&q=" + "x".repeat(1000))).toMatchObject({ type: "", status: "", sort: "title", q: "x".repeat(100) });
  });
  it("provides rule-based creative prompts without inventing plot analysis", () => { expect(researchPrompts(works())).toHaveLength(4); expect(researchPrompts([])[0]).toContain("선택한 장르"); });
});
describe("safe exports and notebook persistence", () => {
  it("escapes CSV formulas, quotes and encoded detail paths", () => {
    const csv = researchCsv([{ ...works()[0]!, title: '=HYPERLINK("bad")', author: "\t+CMD", slug: "a/b?x" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true); expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain(`"'\t+CMD"`); expect(csv).toContain("a%2Fb%3Fx");
  });
  it("retains unknown years as empty fields, not zero", () => { const csv = researchCsv([works().find((work) => work.id === "c")!]); expect(csv).not.toContain('"0"'); });
  it("exports source-aware markdown with escaped metadata", () => {
    const md = researchMarkdown({ ...emptyResearchNotebook(), question: "내 질문" }, [{ ...works()[0]!, title: "[x](bad)", slug: "a/b?x" }], build());
    expect(md).toContain("시장점유율"); expect(md).toContain(metadata.crawledAt); expect(md).toContain("a%2Fb%3Fx"); expect(md).toContain("내 질문"); expect(md).not.toContain("[[x](bad)]");
  });
  it.each(["{", JSON.stringify({ version: 2 }), JSON.stringify({ ...emptyResearchNotebook(), question: "x".repeat(6001) }), "x".repeat(40001)])("rejects damaged or oversized notes", (raw) => { expect(() => parseResearchNotebook(raw)).toThrow(); });
  it("roundtrips a notebook without writing during reads", () => {
    const note = { ...emptyResearchNotebook(), question: "분석 질문", savedAt: "2026-09-13T10:00:00Z", selected: ["a"] };
    expect(parseResearchNotebook(JSON.stringify(note))).toEqual(note); expect(parseResearchNotebook(null)).toEqual(emptyResearchNotebook());
  });
  it("does not overwrite a concurrent tab's note", () => {
    const state = new Map([[RESEARCH_NOTE_KEY, "newer"]]);
    const storage = { getItem: (key: string) => state.get(key) ?? null, setItem: (key: string, value: string) => { state.set(key, value); } };
    expect(() => saveResearchNotebook(storage, null, emptyResearchNotebook())).toThrow("다른 탭"); expect(state.get(RESEARCH_NOTE_KEY)).toBe("newer");
  });
  it("writes only after the expected version matches and propagates quota failures", () => {
    let stored: string | null = null;
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    const raw = saveResearchNotebook(storage, null, emptyResearchNotebook()); expect(stored).toBe(raw);
    expect(() => saveResearchNotebook({ ...storage, setItem: () => { throw new Error("QuotaExceeded"); } }, raw, emptyResearchNotebook())).toThrow("QuotaExceeded");
  });
});

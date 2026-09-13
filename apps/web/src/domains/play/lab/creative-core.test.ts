import { describe, expect, it } from "vitest";

import { colorScore, colorTarget, drawingSvg, escapeXml, HARMONIES, hslHex, hslToRgb, koreaDay, LINE_GUIDES, MAX_POINTS, MAX_STROKES, paletteFor, parseStoryCode, promptFor, randomFrom, rerollStory, safeSeed, STORY_DECKS, storyIndices, traceScore, validStrokes, type Harmony, type Stroke } from "./creative-core";
import { boardSvg, boardText, createBoard, movePanel, validBoard } from "./storyboard-core";

const stroke: Stroke = { color: "#322b28", size: 6, points: [{ x: .12, y: .75 }, { x: .88, y: .25 }] };
describe("creative exercises", () => {
  it("produces repeatable bounded random sequences", () => {
    const a = randomFrom("daily"); const b = randomFrom("daily");
    for (let i = 0; i < 100; i++) { const n = a(); expect(n).toBe(b()); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); }
  });
  it("uses Korean midnight for daily prompts", () => {
    expect(koreaDay(new Date("2026-09-13T14:59:59Z"))).toBe("2026-09-13");
    expect(koreaDay(new Date("2026-09-13T15:00:00Z"))).toBe("2026-09-14");
  });
  it.each([null, undefined, "", "../escape", "<script>", "a".repeat(101)])("rejects invalid URL seeds %s", (seed) => expect(safeSeed(seed)).toBe("creative"));
  it("keeps valid seeds and cycles all 24 drawing prompts", () => {
    expect(safeSeed("2026-09-13")).toBe("2026-09-13");
    expect(new Set(Array.from({ length: 24 }, (_, i) => promptFor("today", i)[0])).size).toBe(24);
  });
  it("encodes only valid story indices", () => {
    const indices = storyIndices("test"); expect(parseStoryCode(indices.join("."))).toEqual(indices);
    expect(parseStoryCode("0.0.0.0.0")).toEqual([0, 0, 0, 0, 0]);
  });
  it.each([null, "0.0", "8.0.0.0.0", "0.12.0.0.0", "0.0.0.0.10", "-1.0.0.0.0", "0.0.0.0.0<script>"])("rejects malformed story code %s", (code) => expect(parseStoryCode(code)).toBeNull());
  it("changes only unlocked cards and keeps all choices in range", () => {
    const before = storyIndices("first"); const locks = [true, false, true, false, false];
    const after = rerollStory(before, locks, "next");
    after.forEach((n, i) => { if (locks[i]) expect(n).toBe(before[i]); else expect(n).not.toBe(before[i]); expect(n).toBeLessThan(STORY_DECKS[i].items.length); });
    expect(rerollStory(before, Array(5).fill(true), "other")).toEqual(before);
  });
  it("converts the standard RGB anchors and wraps hue", () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual([255, 0, 0]);
    expect(hslHex({ h: -240, s: 100, l: 50 })).toBe("#00ff00");
    expect(hslHex({ h: 240, s: 100, l: 50 })).toBe("#0000ff");
    expect(hslHex({ h: 0, s: 0, l: 100 })).toBe("#ffffff");
  });
  it("scores exact color matches at 100 and keeps other scores bounded", () => {
    const target = colorTarget("target"); expect(colorScore(target, target)).toBe(100);
    const score = colorScore(target, { h: 0, s: 0, l: 0 }); expect(score).toBeGreaterThanOrEqual(0); expect(score).toBeLessThan(100);
  });
  it.each(Object.keys(HARMONIES) as Harmony[])("creates reproducible five-color %s palettes", (harmony) => {
    const colors = paletteFor("palette", harmony); expect(colors).toEqual(paletteFor("palette", harmony)); expect(colors).toHaveLength(5);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("validates strokes without accepting executable SVG values", () => {
    expect(validStrokes([])).toBe(true); expect(validStrokes([stroke])).toBe(true);
    for (const value of [null, {}, [{ ...stroke, color: 'red" onload="alert(1)' }], [{ ...stroke, points: [null] }], [{ ...stroke, points: [{ x: Infinity, y: 0 }] }], [{ ...stroke, points: [{ x: 2, y: 0 }] }], [{ ...stroke, erase: "true" }], [{ ...stroke, size: 0 }]]) expect(validStrokes(value)).toBe(false);
  });
  it("bounds stroke and point counts", () => {
    expect(validStrokes(Array(MAX_STROKES + 1).fill(stroke))).toBe(false);
    expect(validStrokes([{ ...stroke, points: Array(MAX_POINTS).fill({ x: .5, y: .5 }) }])).toBe(true);
    expect(validStrokes([{ ...stroke, points: Array(MAX_POINTS + 1).fill({ x: .5, y: .5 }) }])).toBe(false);
  });
  it("escapes user text in SVG exports", () => {
    expect(escapeXml('<&>"')).toBe("&lt;&amp;&gt;&quot;");
    const svg = drawingSvg([stroke], "<script>alert(1)</script>"); expect(svg).not.toContain("<script>"); expect(svg).toContain("&lt;script&gt;"); expect(svg).toContain("viewBox=\"0 0 960 600\"");
  });
  it("compares reference coverage without judging empty or erased strokes", () => {
    expect(traceScore([], LINE_GUIDES[0].points)).toBe(0);
    expect(traceScore([{ ...stroke, erase: true }], LINE_GUIDES[0].points)).toBe(0);
    expect(traceScore([stroke], LINE_GUIDES[0].points)).toBeGreaterThan(90);
  });
});
describe("four-panel documents", () => {
  it("creates valid boards for every preset", () => { for (let i = 0; i < 6; i++) expect(validBoard(createBoard(i))).toBe(true); });
  it("reorders whole panels without mutating drawings or the input", () => {
    const board = createBoard(); board.panels[0].strokes = [stroke]; const ids = board.panels.map((p) => p.id);
    const moved = movePanel(board, 0, 3); expect(board.panels.map((p) => p.id)).toEqual(ids); expect(moved.panels[3]).toBe(board.panels[0]);
    expect(movePanel(board, -1, 2)).toBe(board); expect(movePanel(board, 0, 4)).toBe(board);
  });
  it("rejects malformed imports before replacing a draft", () => {
    const board = createBoard(); expect(validBoard({ ...board, version: 2 })).toBe(false); expect(validBoard({ ...board, panels: Array(4).fill(board.panels[0]) })).toBe(false);
    expect(validBoard({ ...board, title: "x".repeat(81) })).toBe(false); expect(validBoard({ ...board, panels: [null, ...board.panels.slice(1)] })).toBe(false);
    board.panels[0].strokes = [{ ...stroke, color: "url(https://invalid.test)" }]; expect(validBoard(board)).toBe(false);
  });
  it("roundtrips editable documents and escapes text in rendered exports", () => {
    const board = createBoard(); board.title = "<img onerror=alert(1)>"; board.panels[0].caption = "<script>bad</script>"; board.panels[0].direction = "긴 메모 ".repeat(30);
    const restored: unknown = JSON.parse(JSON.stringify(board)); expect(validBoard(restored)).toBe(true);
    const svg = boardSvg(board); expect(svg).not.toContain("<script>"); expect(svg).not.toContain("<img"); expect(svg).toContain("&lt;img"); expect(boardText(board)).toContain(board.panels[0].direction);
  });
});

import { describe, expect, it } from "vitest";

import {
  applyBackgroundToAllPages,
  applyGradeToAllPages,
  clearPage,
  createBlankPage,
  deletePageSafe,
  duplicateMirroredPage,
  duplicatePageState,
  findPageIndex,
  insertBlankPageAt,
  movePage,
  reorderPages,
  type PageLike,
} from "./studio-pages";

const CANVAS_W = 720;
let idCounter = 0;
const makeId = () => `p${++idCounter}`;

function resetIds() {
  idCounter = 0;
}

function samplePage(over: Partial<PageLike> = {}): PageLike {
  return {
    id: "p0",
    elements: [{ id: "e1", type: "image", x: 10, y: 20, width: 100, height: 80 }],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1080,
    ...over,
  };
}

describe("studio-pages (pure, real exports)", () => {
  it("createBlankPage produces fresh page with caller id and defaults", () => {
    resetIds();
    const p = createBlankPage(makeId);
    expect(p.id).toBe("p1");
    expect(p.elements).toEqual([]);
    expect(p.bg).toBe("#ffffff");
    expect(p.canvasH).toBe(1080);
    expect(p.bgGrad).toBeNull();
  });

  it("duplicatePageState clones structure with brand new ids for page and all elements; does not mutate input", () => {
    resetIds();
    const orig: PageLike = samplePage({ id: "orig", elements: [{ id: "eA", x: 5 }] });
    const dup = duplicatePageState(orig, makeId);
    expect(dup.id).toBe("p1");
    expect(dup).not.toBe(orig);
    expect(dup.elements).not.toBe(orig.elements);
    expect(dup.elements[0]).not.toBe(orig.elements[0]);
    expect(dup.elements[0]!.id).toBe("p2");
    expect(dup.elements[0]!.x).toBe(5);
    // orig intact
    expect(orig.id).toBe("orig");
    expect(orig.elements[0]!.id).toBe("eA");
  });

  it("insertBlankPageAt inserts at clamped index and preserves order of others", () => {
    resetIds();
    const p0 = samplePage({ id: "a" });
    const p1 = samplePage({ id: "b" });
    const res = insertBlankPageAt([p0, p1], 1, makeId, 1200);
    expect(res).toHaveLength(3);
    expect(res[0].id).toBe("a");
    expect(res[1].id).toBe("p1"); // new
    expect(res[1].canvasH).toBe(1200);
    expect(res[2].id).toBe("b");
  });

  it("reorderPages moves by index (adjusted) and is pure", () => {
    resetIds();
    const a = samplePage({ id: "a" });
    const b = samplePage({ id: "b" });
    const c = samplePage({ id: "c" });
    const res = reorderPages([a, b, c], 0, 2);
    expect(res.map((p) => p.id)).toEqual(["b", "c", "a"]);
    // original unchanged
    expect([a, b, c].map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("deletePageSafe leaves at least one; removes by id", () => {
    const a = samplePage({ id: "a" });
    const b = samplePage({ id: "b" });
    expect(deletePageSafe([a], "a")).toHaveLength(1);
    expect(deletePageSafe([a, b], "a").map((p) => p.id)).toEqual(["b"]);
  });

  it("movePage delegates to reorder for up/down", () => {
    const a = samplePage({ id: "a" });
    const b = samplePage({ id: "b" });
    const c = samplePage({ id: "c" });
    expect(movePage([a, b, c], "a", 1).map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(movePage([a, b, c], "c", -1).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("clearPage zeros elements on target only; keeps other fields", () => {
    const a = samplePage({ id: "a", elements: [{ id: "e" }] });
    const b = samplePage({ id: "b", elements: [{ id: "f" }] });
    const res = clearPage([a, b], "a");
    expect(res[0].elements).toEqual([]);
    expect(res[1].elements.length).toBe(1);
    expect(res[0].bg).toBe(a.bg);
  });

  it("applyGradeToAllPages and applyBackgroundToAllPages set uniformly", () => {
    const a = samplePage({ id: "a" });
    const b = samplePage({ id: "b" });
    const g = { contrast: 0.1 };
    const resG = applyGradeToAllPages([a, b], g);
    expect(resG[0].grade).toBe(g);
    expect(resG[1].grade).toBe(g);

    const resB = applyBackgroundToAllPages([a, b], "#111111", ["#000", "#fff"]);
    expect(resB[0].bg).toBe("#111111");
    expect(resB[0].bgGrad).toEqual(["#000", "#fff"]);
  });

  it("duplicateMirroredPage creates new ids and horizontally flips x/width/draw-points", () => {
    resetIds();
    const drawEl = {
      id: "d1",
      type: "draw",
      x: 100,
      width: 50,
      points: [100, 10, 120, 10, 140, 30],
    };
    const p = samplePage({ id: "src", elements: [drawEl as any] });
    const mir = duplicateMirroredPage(p, makeId, CANVAS_W);
    expect(mir.id).not.toBe("src");
    const me = mir.elements[0] as any;
    expect(me.id).not.toBe("d1");
    // x flipped: canvasW - x - w = 720-100-50=570
    expect(me.x).toBe(570);
    // points x flipped around canvas
    expect(me.points[0]).toBe(720 - 100);
    expect(me.points[2]).toBe(720 - 120);
    expect(me.points[4]).toBe(720 - 140);
  });

  it("findPageIndex works", () => {
    const a = samplePage({ id: "a" });
    const b = samplePage({ id: "b" });
    expect(findPageIndex([a, b], "b")).toBe(1);
    expect(findPageIndex([a, b], "z")).toBe(-1);
  });
});

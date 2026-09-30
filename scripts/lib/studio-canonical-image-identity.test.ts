import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  canonicalImageElementIds, newlyInsertedCanonicalImageId,
} from "./studio-canonical-image-identity";

const image = (id: string) => ({ type: "image", id });
const draw = (id: string) => ({ type: "draw", id });

describe("정본 이미지 식별자 추출", () => {
  it("다페이지에 걸친 이미지 식별자를 문서 순서대로 모은다", () => {
    expect(canonicalImageElementIds([
      { elements: [image("a"), draw("d")] },
      { elements: [image("b")] },
    ])).toEqual(["a", "b"]);
  });

  it("이미지가 아닌 요소와 id 가 없는 요소는 무시한다", () => {
    expect(canonicalImageElementIds([
      { elements: [draw("d"), { type: "image" }, { type: "image", id: "" }, image("keep")] },
    ])).toEqual(["keep"]);
  });

  it("pagesList 가 아니거나 elements 가 없으면 빈 목록을 준다", () => {
    expect(canonicalImageElementIds(undefined)).toEqual([]);
    expect(canonicalImageElementIds([{}, { elements: null }])).toEqual([]);
  });
});

describe("새로 삽입된 정본 이미지 판정", () => {
  it("합성 레이어가 이미 있어도 새 이미지가 하나면 그 식별자를 준다", () => {
    const pagesList = [
      { elements: [image("inserted-first"), image("composite-a")] },
      { elements: [image("composite-b"), image("inserted-second")] },
    ];
    const previous = new Set(["inserted-first", "composite-a", "composite-b"]);
    expect(newlyInsertedCanonicalImageId(pagesList, previous)).toBe("inserted-second");
  });

  it("새 이미지가 둘 이상이면 무엇이 잘못됐는지 알 수 없으므로 null 을 준다", () => {
    const pagesList = [{ elements: [image("old"), image("new-a"), image("new-b")] }];
    expect(newlyInsertedCanonicalImageId(pagesList, new Set(["old"]))).toBeNull();
  });

  it("새 이미지가 없으면 null 을 준다", () => {
    expect(newlyInsertedCanonicalImageId([{ elements: [image("old")] }], new Set(["old"]))).toBeNull();
  });
});

describe("필터 게이트는 삽입 직전 문서에서 기준 식별자를 읽는다", () => {
  const gate = () => readFileSync(
    new URL("../verify-studio-filter-dialog.mts", import.meta.url), "utf8");

  it("이미지 삽입 전에 기준 식별자 집합을 읽는다", () => {
    const source = gate();
    const readIndex = source.indexOf("const previousImageIds = new Set(canonicalImageElementIds(");
    const placeIndex = source.indexOf("await placeTestImage(page, { clip, baseline: beforeInsertPixels });");
    expect(readIndex).toBeGreaterThan(-1);
    expect(placeIndex).toBeGreaterThan(readIndex);
  });

  it("이미지 삽입은 캡처 영역에 그려질 때까지 기다린다", () => {
    const source = gate();
    expect(source).toMatch(/await placeTestImage\(page, \{ clip, baseline: beforeInsertPixels \}\)/u);
    expect(source).toMatch(/waitForPaintedEvidenceRegion/u);
  });

  it("기억된 식별자 하나만 제외하는 이전 방식을 사용하지 않는다", () => {
    expect(gate()).not.toMatch(/new Set\(canonicalImageId \? \[canonicalImageId\] : \[\]\)/u);
  });
});

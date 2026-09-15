import { describe, expect, it } from "vitest";

import {
  isFreeResourceSource,
  resourceSourceCostLabel,
  RESOURCE_SOURCES,
} from "./sources";

function source(name: string) {
  const value = RESOURCE_SOURCES.find((item) => item.name === name);
  if (!value) throw new Error(`Missing source: ${name}`);
  return value;
}

describe("creator resource cost labels", () => {
  it("labels free providers independently from key requirements", () => {
    expect(resourceSourceCostLabel(source("Wikidata·Wikimedia"))).toBe("무료 · 키 없음");
    expect(resourceSourceCostLabel(source("Google Books"))).toBe("무료 · 키/신청 필요");
    expect(resourceSourceCostLabel(source("기업마당"))).toBe("무료 · 키/신청 필요");
    expect(resourceSourceCostLabel(source("만화규장각 KMAS"))).toBe("무료 · 키/신청 필요");
    expect(resourceSourceCostLabel(source("YouTube Data API"))).toBe("무료 · 키/신청 필요");
  });

  it("keeps paid contracts and excluded sources distinct from free access", () => {
    expect(resourceSourceCostLabel(source("TMDB"))).toBe("유료·계약 필요");
    expect(resourceSourceCostLabel(source("Jikan·비공식 웹툰 API"))).toBe("운영 제외");
    expect(isFreeResourceSource(source("TMDB"))).toBe(false);
    expect(isFreeResourceSource(source("Google Books"))).toBe(true);
    expect(isFreeResourceSource(source("만화규장각 KMAS"))).toBe(true);
  });

  it("treats every keyless source as free", () => {
    for (const item of RESOURCE_SOURCES.filter((entry) => entry.freeKeyless === true)) {
      expect(isFreeResourceSource(item), item.name).toBe(true);
      expect(resourceSourceCostLabel(item), item.name).toBe("무료 · 키 없음");
    }
  });
});

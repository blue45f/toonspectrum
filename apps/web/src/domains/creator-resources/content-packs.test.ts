import { describe, expect, it } from "vitest";
import { buildContentBrief, CONTENT_FORMATS, CONTENT_PACKS, findContentPack, isContentFormat, MAX_BRIEF_SOURCES } from "./content-packs";
import type { ContentFormat } from "./content-packs";
import type { CreatorResource } from "@/shared/lib/creator-resources";

const source: CreatorResource = { id: "aic:42", provider: "aic", title: "Armor <script>", creator: "Maker", sourceUrl: "https://www.artic.edu/artworks/42", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", credit: "Gift of Collector", description: "", fetchedAt: "2026-09-13T10:00:00.000Z" };
describe("original free content packs", () => {
  it("has twelve unique original scenes with three research questions each", () => {
    expect(CONTENT_PACKS).toHaveLength(12);
    expect(new Set(CONTENT_PACKS.map((item) => item.id)).size).toBe(12);
    expect(new Set(CONTENT_PACKS.map((item) => item.premise)).size).toBe(12);
    for (const pack of CONTENT_PACKS) { expect(pack.keywords).toHaveLength(3); expect(pack.observe).toHaveLength(3); expect(pack.twist.length).toBeGreaterThan(10); }
    expect(findContentPack("unknown")).toBe(CONTENT_PACKS[0]); expect(isContentFormat("unknown")).toBe(false);
  });
  it.each(Object.keys(CONTENT_FORMATS) as ContentFormat[])("produces deterministic %s with real provenance and no invented observations", (format) => {
    const text = buildContentBrief(CONTENT_PACKS[0], format, [source], "메모 <b>안전</b>");
    expect(text).toBe(buildContentBrief(CONTENT_PACKS[0], format, [source], "메모 <b>안전</b>"));
    expect(text).toContain(source.sourceUrl); expect(text).toContain(source.credit); expect(text).toContain(source.fetchedAt);
    expect(text).toContain("AI 생성·이미지 분석·역사적 사실 판정 결과가 아닙니다"); expect(text).toContain("CC0");
    expect(text).not.toContain("<script>"); expect(text).not.toContain("<b>");
  });
  it("creates an honest empty-source template and refuses source overflow", () => {
    expect(buildContentBrief(CONTENT_PACKS[1], "comparison", [])).toContain("출처를 선택하세요");
    expect(() => buildContentBrief(CONTENT_PACKS[0], "world", Array.from({ length: MAX_BRIEF_SOURCES + 1 }, () => source))).toThrow();
  });
});

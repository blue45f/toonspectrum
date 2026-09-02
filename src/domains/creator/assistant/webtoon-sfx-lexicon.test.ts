import { describe, expect, it } from "vitest";

import {
  WebtoonSfxLexiconEngine,
  SFX_LEXICON_DATABASE,
} from "./webtoon-sfx-lexicon";

describe("WebtoonSfxLexiconEngine", () => {
  const engine = new WebtoonSfxLexiconEngine();

  it("contains rich database spanning 8 categories", () => {
    expect(SFX_LEXICON_DATABASE.length).toBeGreaterThanOrEqual(18);
    const categories = engine.listCategories();
    expect(categories.length).toBe(8);
  });

  it("filters items by category correctly", () => {
    const impacts = engine.search("", "impact");
    expect(impacts.length).toBeGreaterThanOrEqual(4);
    expect(impacts.every((i) => i.category === "impact")).toBe(true);

    const magic = engine.search("", "magic-scifi");
    expect(magic.length).toBeGreaterThanOrEqual(2);
  });

  it("searches by keyword in text, meaning, or tags", () => {
    // Search by word
    const res1 = engine.search("쿵");
    expect(res1.some((i) => i.text === "쿵")).toBe(true);

    // Search by tag
    const res2 = engine.search("암살");
    expect(res2.some((i) => i.text === "스윽")).toBe(true);

    // Search by meaning
    const res3 = engine.search("천둥");
    expect(res3.some((i) => i.text === "콰르릉")).toBe(true);
  });

  it("retrieves item by unique ID", () => {
    const item = engine.getById("sfx-dugeun");
    expect(item).toBeDefined();
    expect(item?.text).toBe("두근");
    expect(item?.category).toBe("emotion");
  });
});

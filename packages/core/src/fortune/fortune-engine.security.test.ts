import { describe, expect, it } from "vitest";

import { parsePanels, seededRandom } from "./fortune-engine";

describe("bounded fortune text parsing", () => {
  it("keeps Korean scene headers, quoted dialogue, sound effects and directions", () => {
    expect(parsePanels('[ 제 12 컷 — 달빛 아래 ]\n아라: “안녕!”\n효과음: 두근\n[잠시 후]\n단우：『왔구나』', "ara"))
      .toEqual([
        { scene: "달빛 아래", lines: [
          { speaker: "아라", characterId: "ara", text: "안녕!" },
          { speaker: "", characterId: null, text: "", sfx: "두근" },
        ] },
        { scene: "잠시 후", lines: [{ speaker: "단우", characterId: "danwoo", text: "왔구나" }] },
      ]);
  });

  it("keeps plain paragraphs and empty scene headers", () => {
    expect(parsePanels("첫 문단\n다음 줄\n\n둘째 문단", "ara"))
      .toEqual([
        { scene: null, lines: [{ speaker: "", characterId: "ara", text: "첫 문단 다음 줄" }] },
        { scene: null, lines: [{ speaker: "", characterId: "ara", text: "둘째 문단" }] },
      ]);
    expect(parsePanels("[1컷]\n아라: 안녕", "ara")[0].scene).toBeNull();
  });

  it.each([
    "[" + "\t".repeat(16_000),
    "[0컷" + "\t".repeat(16_000) + "!",
    "[a" + "\t".repeat(16_000) + "!",
    "효과음:" + "\t".repeat(16_000) + "!",
    "\"".repeat(16_000) + "!",
    "이름:" + "\t".repeat(16_000) + "대사",
  ])("parses adversarial quote/whitespace runs without ambiguous regex captures", (input) => {
    expect(parsePanels(input, "ara").length).toBeGreaterThan(0);
  });

  it("rejects excessive and forged text before parsing methods execute", () => {
    expect(() => parsePanels("a".repeat(65_537), "ara")).toThrow(RangeError);
    const forged = { length: Number.MAX_SAFE_INTEGER, replace: () => { throw new Error("called"); } };
    expect(() => parsePanels(forged as unknown as string, "ara")).toThrow(TypeError);
  });
});

describe("fortune seed validation", () => {
  it("preserves the released deterministic sequence for ordinary seeds", () => {
    const random = seededRandom("2026-09-08:ara");
    expect([random(), random(), random()]).toEqual([
      0.057887770468369126, 0.14753449941053987, 0.9920374457724392,
    ]);
  });

  it("rejects forged length properties and oversized seeds", () => {
    const forged = { length: Number.MAX_SAFE_INTEGER, charCodeAt: () => 65 };
    expect(() => seededRandom(forged as unknown as string)).toThrow(TypeError);
    expect(() => seededRandom("a".repeat(4097))).toThrow(RangeError);
  });
});

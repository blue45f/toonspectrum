import { describe, expect, it } from "vitest";

import {
  applyCanonPromptBlocks,
  buildCanonPromptBlock,
  hasCanonPromptBlock,
  parseCanonPromptBlocks,
  stripCanonPromptBlocks,
} from "./studio-character-canon-prompt";
import { buildCharacterCanonSheet } from "./studio-character-canon";

const EUJIN = buildCharacterCanonSheet(
  {
    name: "유진",
    appearance: "긴 흑발, 회색 눈",
    outfit: "남색 교복 재킷",
    tags: ["차분함", "안경"],
    referenceImage: null,
    referenceSource: null,
    referenceLabel: null,
  },
  { id: "c-eujin" },
);

const SEOHA = buildCharacterCanonSheet(
  {
    name: "서하",
    appearance: "짧은 갈발, 주근깨",
    outfit: "",
    tags: [],
    referenceImage: null,
    referenceSource: null,
    referenceLabel: null,
  },
  { id: "c-seoha" },
);

describe("캐논 프롬프트 블록", () => {
  it("시트를 마커 블록으로 만든다", () => {
    const block = buildCanonPromptBlock(EUJIN);
    expect(block).toBe(
      [
        "[캐릭터 캐논: 유진]",
        "- 외모: 긴 흑발, 회색 눈",
        "- 의상: 남색 교복 재킷",
        "- 특징: 차분함, 안경",
      ].join("\n"),
    );
    // 빈 의상·태그는 줄을 만들지 않는다.
    expect(buildCanonPromptBlock(SEOHA)).toBe(
      ["[캐릭터 캐논: 서하]", "- 외모: 짧은 갈발, 주근깨"].join("\n"),
    );
  });

  it("프롬프트에 캐논을 붙이고 다시 떼어낼 수 있다", () => {
    const body = "비 내리는 폐역에 두 인물이 선다.";
    const injected = applyCanonPromptBlocks(body, [EUJIN, SEOHA]);
    expect(injected).toContain("[캐릭터 캐논: 유진]");
    expect(injected).toContain("[캐릭터 캐논: 서하]");
    expect(injected.startsWith(body)).toBe(true);
    expect(parseCanonPromptBlocks(injected)).toEqual(["유진", "서하"]);
    expect(hasCanonPromptBlock(injected, "유진")).toBe(true);
    expect(hasCanonPromptBlock(injected, "없는이름")).toBe(false);

    // 본문만 남기고 블록이 깨끗이 제거된다.
    expect(stripCanonPromptBlocks(injected)).toBe(body);
  });

  it("여러 번 적용해도 블록이 중복되지 않는다(멱등)", () => {
    const once = applyCanonPromptBlocks("폐역 플랫폼.", [EUJIN]);
    const twice = applyCanonPromptBlocks(once, [EUJIN]);
    expect(twice).toBe(once);
    // 캐릭터를 바꾸면 예전 블록은 교체된다.
    const replaced = applyCanonPromptBlocks(once, [SEOHA]);
    expect(parseCanonPromptBlocks(replaced)).toEqual(["서하"]);
    expect(replaced).toContain("폐역 플랫폼.");
  });

  it("캐논 블록이 프롬프트 앞부분에 있어도 제거된다", () => {
    const injected = applyCanonPromptBlocks("", [EUJIN]);
    const withBody = `앞 문장\n\n${injected}\n\n뒷 문장`;
    expect(stripCanonPromptBlocks(withBody)).toBe("앞 문장\n\n뒷 문장");
  });

  it("캐논이 없으면 프롬프트를 그대로 돌려준다", () => {
    expect(applyCanonPromptBlocks("그대로", [])).toBe("그대로");
    expect(stripCanonPromptBlocks("그대로")).toBe("그대로");
  });
});

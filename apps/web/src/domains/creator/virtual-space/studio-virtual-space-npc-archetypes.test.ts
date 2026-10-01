import { describe, expect, it } from "vitest";
import {
  STUDIO_NPC_ARCHETYPES,
  STUDIO_NPC_ARCHETYPE_KEYS,
  studioNpcArchetypeByKey,
  studioNpcArchetypeDialogue,
  studioNpcArchetypeDialogueLines,
  studioNpcArchetypeHasKey,
  studioNpcArchetypeNameLabel,
} from "./studio-virtual-space-npc-archetypes";

describe("STUDIO_NPC_ARCHETYPES", () => {
  it("아키타입 7종을 등록한다 (안내원·바리스타·경비·상점주인·도우미·멘토·방문객)", () => {
    expect(STUDIO_NPC_ARCHETYPE_KEYS).toEqual([
      "guide", "barista", "guard", "shopkeeper", "cleaner", "mentor", "visitor",
    ]);
    expect(STUDIO_NPC_ARCHETYPES).toHaveLength(7);
  });

  it("모든 아키타입이 고유 스킨 키·이름·직함을 가진다", () => {
    const skinKeys = new Set<string>();
    for (const archetype of STUDIO_NPC_ARCHETYPES) {
      expect(archetype.nameKo.trim().length).toBeGreaterThan(0);
      expect(archetype.nameEn.trim().length).toBeGreaterThan(0);
      expect(archetype.roleKo.trim().length).toBeGreaterThan(0);
      expect(archetype.roleEn.trim().length).toBeGreaterThan(0);
      expect(skinKeys.has(archetype.proceduralSkinKey)).toBe(false);
      skinKeys.add(archetype.proceduralSkinKey);
      expect(archetype.proceduralSkinKey.startsWith("npc-")).toBe(true);
    }
  });

  it("상점주인 아키타입이 보리 스킨과 연결된다", () => {
    const shopkeeper = studioNpcArchetypeByKey("shopkeeper");
    expect(shopkeeper?.proceduralSkinKey).toBe("npc-shopkeeper");
    expect(shopkeeper?.nameKo).toBe("보리");
  });

  it("알 수 없는 키 조회는 null·false를 반환한다", () => {
    expect(studioNpcArchetypeByKey("dragon")).toBeNull();
    expect(studioNpcArchetypeHasKey("dragon")).toBe(false);
    expect(studioNpcArchetypeHasKey("guard")).toBe(true);
  });

  it("이름표 라벨을 만든다", () => {
    const guide = studioNpcArchetypeByKey("guide");
    expect(guide).not.toBeNull();
    if (guide) {
      expect(studioNpcArchetypeNameLabel(guide)).toEqual({ ko: "두리 · 안내원", en: "Duri · Guide" });
    }
  });
});

describe("studioNpcArchetypeDialogue", () => {
  it("아키타입별 인사 대사를 반환한다", () => {
    const greet = studioNpcArchetypeDialogue("barista", "greet", "seed-1");
    expect(greet.ko.length).toBeGreaterThan(0);
    expect(greet.en.length).toBeGreaterThan(0);
  });

  it("같은 시드에서는 같은 대사를 고른다 (결정적)", () => {
    const first = studioNpcArchetypeDialogue("guard", "greet", "hello");
    const second = studioNpcArchetypeDialogue("guard", "greet", "hello");
    expect(first).toEqual(second);
  });

  it("한국어 대사는 18자 이하이다", () => {
    for (const key of STUDIO_NPC_ARCHETYPE_KEYS) {
      for (const kind of ["greet", "idle"] as const) {
        for (const line of studioNpcArchetypeDialogueLines(key, kind)) {
          expect(line.ko.length).toBeLessThanOrEqual(18);
        }
      }
    }
  });

  it("알 수 없는 키는 안내원 대사로 폴백한다", () => {
    const fallback = studioNpcArchetypeDialogue("unknown", "greet", "x");
    const guide = studioNpcArchetypeDialogue("guide", "greet", "x");
    expect(fallback).toEqual(guide);
  });
});

import { describe, expect, it } from "vitest";

import {
  APPEARANCE_SLOT_KINDS,
  CAMERA_FRAMING_MODES,
  SLOT_GROUPS,
  SLOT_PRESET_IDS,
  catalogInvariants,
  createPresetCatalog,
  isVocabularyPresetId,
  presetSlot,
  recipePatchSchema,
} from "../contracts";
import { stableStringify } from "../shared/stable-json";
import { vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { APPEARANCE_PRESETS, APPEARANCE_PRESET_COUNT, appearancePresetsForSlot, requiresForPatch } from "./appearance-presets";

const EXPECTED_COUNTS = { "face-shape": 6, eyes: 6, irises: 5, nose: 5, mouth: 5, ears: 4, hair: 7, body: 6, top: 5, bottom: 5, shoes: 4, accessory: 6 } as const;

describe("presets/appearance-presets", () => {
  it("12개 외형 슬롯 64개이며 슬롯별 개수가 어휘와 같다", () => {
    expect(APPEARANCE_PRESETS).toHaveLength(APPEARANCE_PRESET_COUNT);
    expect(APPEARANCE_PRESET_COUNT).toBe(64);
    for (const slot of APPEARANCE_SLOT_KINDS) {
      const entries = appearancePresetsForSlot(slot);
      expect(entries.map((e) => e.id)).toEqual(SLOT_PRESET_IDS[slot].map((name) => `${slot}/${name}`));
      expect(entries).toHaveLength(EXPECTED_COUNTS[slot as keyof typeof EXPECTED_COUNTS]);
    }
    expect(APPEARANCE_PRESETS.some((e) => SLOT_GROUPS.performance.includes(e.slot))).toBe(false);
  });

  it("전부 어휘 안·id 유일·slot 일치·license original·한글 라벨 유일", () => {
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const entry of APPEARANCE_PRESETS) {
      expect(isVocabularyPresetId(entry.id)).toBe(true);
      expect(presetSlot(entry.id)).toBe(entry.slot);
      expect(entry.license).toBe("original");
      expect(entry.labelKo).toMatch(/[가-힣]/u);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(labels.has(entry.labelKo)).toBe(false);
      labels.add(entry.labelKo);
      expect(CAMERA_FRAMING_MODES).toContain(entry.thumbnailFraming.mode);
      expect(entry.thumbnailFraming.distanceScale).toBeGreaterThan(0);
    }
  });

  it("patch가 레시피 부분 스키마를 통과하고 같은 슬롯 안에서 서로 다르다", () => {
    for (const slot of APPEARANCE_SLOT_KINDS) {
      const seen = new Set<string>();
      for (const entry of appearancePresetsForSlot(slot)) {
        const parsed = recipePatchSchema.safeParse(entry.patch);
        expect(parsed.success, `${entry.id}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
        expect(Object.keys(entry.patch).length, `${entry.id} patch가 비어 있다`).toBeGreaterThan(0);
        const digest = stableStringify(entry.patch);
        expect(seen.has(digest), `${entry.id}의 patch가 같은 슬롯의 다른 프리셋과 같다`).toBe(false);
        seen.add(digest);
      }
    }
  });

  it("파라미터 프리셋은 슬롯이 다루는 키 전부를 적고(0 포함) 파츠 프리셋은 자기 슬롯의 parts를 적는다", () => {
    const paramKeys: Record<string, readonly string[]> = {
      "face-shape": ["faceShape", "jawWidth", "chinLength", "cheekVolume", "forehead"],
      nose: ["noseHeight", "noseWidth", "noseDepth"],
      mouth: ["mouthWidth", "lipFullness"],
      ears: ["earSize", "earAngle"],
      eyes: ["eyeSize", "eyeSpacing", "eyeTilt"],
    };
    for (const [slot, keys] of Object.entries(paramKeys)) {
      for (const entry of appearancePresetsForSlot(slot as never)) expect(Object.keys(entry.patch.face ?? {}).sort()).toEqual([...keys].sort());
    }
    for (const entry of appearancePresetsForSlot("body")) expect(Object.keys(entry.patch.body ?? {})).toHaveLength(9);
    for (const slot of ["eyes", "irises", "hair", "top", "bottom", "shoes", "accessory"] as const) {
      for (const entry of appearancePresetsForSlot(slot)) expect(entry.patch.parts?.[slot]).toBe(entry.id.slice(entry.id.indexOf("/") + 1));
    }
    for (const slot of ["top", "bottom", "shoes", "accessory"] as const) {
      for (const entry of appearancePresetsForSlot(slot)) expect(entry.patch.colors?.[slot]).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  it("requires는 patch의 0이 아닌 파라미터 morph 이름에서 유도되고 형식이 맞다", () => {
    for (const entry of APPEARANCE_PRESETS) {
      expect(entry.requires).toEqual(requiresForPatch(entry.patch));
      for (const requirement of entry.requires) expect(requirement).toMatch(/^morph:param:[a-zA-Z]+:[+-]$/u);
    }
    expect(requiresForPatch({ face: { eyeSize: 0.3, eyeTilt: -0.2, eyeSpacing: 0 } })).toEqual(["morph:param:eyeSize:+", "morph:param:eyeTilt:-"]);
    expect(requiresForPatch({ parts: { hair: "soft-bob" } })).toEqual([]);
    const oval = APPEARANCE_PRESETS.find((e) => e.id === "face-shape/oval");
    expect(oval?.requires).toEqual([]);
  });

  it("conflictsWith는 유효한 외형 프리셋을 가리키고 대칭이다", () => {
    const byId = new Map(APPEARANCE_PRESETS.map((e) => [e.id, e]));
    let conflictCount = 0;
    for (const entry of APPEARANCE_PRESETS) {
      for (const conflict of entry.conflictsWith) {
        conflictCount += 1;
        const other = byId.get(conflict);
        expect(other, `${entry.id} → ${conflict}`).toBeDefined();
        expect(other?.slot).not.toBe(entry.slot);
        expect(other?.conflictsWith).toContain(entry.id);
      }
    }
    expect(conflictCount).toBeGreaterThan(0);
  });

  it("연기 프리셋 fixture와 병합하면 catalogInvariants를 통과한다", () => {
    const performance = vocabularyCatalogEntries().filter((e) => SLOT_GROUPS.performance.includes(e.slot));
    const catalog = createPresetCatalog([...APPEARANCE_PRESETS, ...performance]);
    expect(catalog.entries).toHaveLength(64 + 30);
    expect(catalogInvariants(catalog)).toEqual([]);
  });

  it("프리셋 목록은 동결되어 있다", () => {
    expect(Object.isFrozen(APPEARANCE_PRESETS)).toBe(true);
  });
});

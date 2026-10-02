import { describe, expect, it } from "vitest";

import { FINGER_BONE_NAMES } from "../../contracts/bones";
import { catalogInvariants, createPresetCatalog } from "../../contracts/catalog";
import { FACS_UNITS } from "../../contracts/expression";
import { isVocabularyPresetId } from "../../contracts/preset-vocabulary";
import { fnv1a64Hex } from "../../shared/hash";
import { stableStringify } from "../../shared/stable-json";

import { HAND_POSE_FRAMING, PERFORMANCE_PRESETS } from "./index";

describe("PERFORMANCE_PRESETS", () => {
  it("30개(표정 12·포즈 10·손 포즈 8)이고 catalogInvariants를 통과한다", () => {
    expect(PERFORMANCE_PRESETS).toHaveLength(30);
    const catalog = createPresetCatalog(PERFORMANCE_PRESETS);
    expect(catalog.bySlot("expression")).toHaveLength(12);
    expect(catalog.bySlot("pose")).toHaveLength(10);
    expect(catalog.bySlot("hand-pose")).toHaveLength(8);
    const failures = catalogInvariants(catalog, 0).filter((f) => f.code !== "catalog-slot-min");
    expect(failures).toEqual([]);
    // 외형 슬롯 최소 개수 실패만 남는다(외형은 state-presets 소유)
    const slotMin = catalogInvariants(catalog, 0).filter((f) => f.code === "catalog-slot-min");
    expect(slotMin.every((f) => !/expression|pose|hand-pose/u.test(f.reasonKo.split(" ")[1] ?? ""))).toBe(true);
  });

  it("id는 어휘 안이고 유일하며, 라벨은 한글, 라이선스는 original, 서로 다른 patch", () => {
    const ids = new Set<string>();
    const digests = new Set<string>();
    for (const entry of PERFORMANCE_PRESETS) {
      expect(isVocabularyPresetId(entry.id)).toBe(true);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.labelKo).toMatch(/[가-힣]/u);
      expect(entry.license).toBe("original");
      expect(entry.conflictsWith).toEqual([]);
      digests.add(`${entry.slot}:${fnv1a64Hex(stableStringify(entry.patch))}`);
    }
    expect(digests.size).toBe(30);
  });

  it("requires는 표정=morph:facs:*, 포즈·손 포즈=bone:* 형식이고 patch 내용과 일치한다", () => {
    const fingers = new Set<string>(FINGER_BONE_NAMES);
    for (const entry of PERFORMANCE_PRESETS) {
      if (entry.slot === "expression") {
        const units = FACS_UNITS.filter((u) => (entry.patch.expression?.[u] ?? 0) > 0);
        expect(entry.requires).toEqual(units.map((u) => `morph:facs:${u}`));
        expect(entry.thumbnailFraming.mode).toBe("face");
      } else if (entry.slot === "pose") {
        expect(entry.requires).toEqual(Object.keys(entry.patch.pose ?? {}).map((b) => `bone:${b}`));
        expect(entry.thumbnailFraming.mode).toBe("full-body");
        expect(entry.patch.handPose).toBeUndefined();
      } else {
        expect(entry.slot).toBe("hand-pose");
        const bones = new Set([...Object.keys(entry.patch.handPose?.left ?? {}), ...Object.keys(entry.patch.handPose?.right ?? {})]);
        expect(new Set(entry.requires)).toEqual(new Set([...bones].map((b) => `bone:${b}`)));
        for (const bone of bones) expect(fingers.has(bone)).toBe(true);
        expect(entry.thumbnailFraming).toBe(HAND_POSE_FRAMING);
      }
    }
  });
});

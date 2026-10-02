import { describe, expect, it } from "vitest";

import { FACS_UNITS } from "./expression";
import {
  ALL_FACS_MORPH_NAMES,
  BLENDER_SHAPE_KEY_ALIASES,
  FACS_SHAPE_KEY_ALIASES,
  allParamMorphNames,
  expressionToMorphWeights,
  facsMorphName,
  paramMorphName,
  paramToMorphWeights,
  parseMorphTargetName,
} from "./morph-names";
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS } from "./params";

/** tools/blender/toonstudio_blender_kit/face.py `_shape_specs` 실측 24종 */
const FACE_PY_SHAPE_KEYS = [
  "faceCheekVolumeHigh",
  "faceCheekVolumeLow",
  "faceChinLengthLong",
  "faceChinLengthShort",
  "faceEarSizeBig",
  "faceEarSizeSmall",
  "faceEyeSizeBig",
  "faceEyeSizeSmall",
  "faceEyeSpacingNarrow",
  "faceEyeSpacingWide",
  "faceEyeTiltDown",
  "faceEyeTiltUp",
  "faceJawWidthNarrow",
  "faceJawWidthWide",
  "faceLipFullnessHigh",
  "faceLipFullnessLow",
  "faceMouthWidthNarrow",
  "faceMouthWidthWide",
  "faceNoseDepthHigh",
  "faceNoseDepthLow",
  "faceNoseHeightHigh",
  "faceNoseHeightLow",
  "faceNoseWidthNarrow",
  "faceNoseWidthWide",
];

describe("contracts/morph-names", () => {
  it("이름 규칙과 파싱이 round-trip한다", () => {
    expect(paramMorphName("eyeSize", "+")).toBe("param:eyeSize:+");
    expect(facsMorphName("jawOpen")).toBe("facs:jawOpen");
    expect(parseMorphTargetName("param:eyeSize:+")).toEqual({ kind: "param", key: "eyeSize", sign: "+" });
    expect(parseMorphTargetName("param:height:-")).toEqual({ kind: "param", key: "height", sign: "-" });
    expect(parseMorphTargetName("facs:jawOpen")).toEqual({ kind: "facs", unit: "jawOpen" });
    expect(parseMorphTargetName("param:unknown:+")).toBeNull();
    expect(parseMorphTargetName("param:eyeSize:x")).toBeNull();
    expect(parseMorphTargetName("facs:nope")).toBeNull();
    expect(parseMorphTargetName("random")).toBeNull();
  });

  it("paramToMorphWeights가 부호를 분리하고 0은 생략한다", () => {
    const weights = paramToMorphWeights({ eyeSize: 0.5, height: -0.25, waist: 0, noseWidth: Number.NaN });
    expect(weights).toEqual({ "param:eyeSize:+": 0.5, "param:height:-": 0.25 });
    expect(paramToMorphWeights({ eyeSize: 3 })).toEqual({ "param:eyeSize:+": 1 });
  });

  it("expressionToMorphWeights가 facs 이름으로 바꾼다", () => {
    expect(expressionToMorphWeights({ jawOpen: 0.4, mouthSmile: 0, eyeWide: 2 })).toEqual({ "facs:jawOpen": 0.4, "facs:eyeWide": 1 });
  });

  it("Blender 별칭 24개가 face.py 목록과 일치하고 모두 얼굴 파라미터로 매핑된다", () => {
    expect(Object.keys(BLENDER_SHAPE_KEY_ALIASES).sort()).toEqual([...FACE_PY_SHAPE_KEYS].sort());
    const faceKeys = new Set<string>(FACE_PARAM_KEYS);
    for (const [name, alias] of Object.entries(BLENDER_SHAPE_KEY_ALIASES)) {
      expect(faceKeys.has(alias.key), name).toBe(true);
      expect(["+", "-"]).toContain(alias.sign);
    }
    // 각 파라미터는 ± 한 쌍씩
    const pairs = new Map<string, Set<string>>();
    for (const alias of Object.values(BLENDER_SHAPE_KEY_ALIASES)) {
      const set = pairs.get(alias.key) ?? new Set<string>();
      set.add(alias.sign);
      pairs.set(alias.key, set);
    }
    for (const [key, signs] of pairs) expect(signs.size, key).toBe(2);
  });

  it("FACS 별칭은 모두 16 유닛 안으로 떨어진다", () => {
    const units = new Set<string>(FACS_UNITS);
    for (const unit of Object.values(FACS_SHAPE_KEY_ALIASES)) expect(units.has(unit)).toBe(true);
    expect(ALL_FACS_MORPH_NAMES).toHaveLength(16);
  });

  it("allParamMorphNames가 키 × ± 순서를 지킨다", () => {
    const names = allParamMorphNames([...BODY_PARAM_KEYS, ...FACE_PARAM_KEYS]);
    expect(names).toHaveLength((BODY_PARAM_KEYS.length + FACE_PARAM_KEYS.length) * 2);
    expect(names.slice(0, 2)).toEqual(["param:height:+", "param:height:-"]);
  });
});

import { describe, expect, it } from "vitest";

import { BLENDER_SHAPE_KEY_ALIASES, FACE_PARAM_KEYS, FACS_SHAPE_KEY_ALIASES, facsMorphName, paramMorphName } from "../../contracts";
import { BLENDER_FACE_SHAPE_KEYS } from "../../testing/manifest-fixtures";

import { classifyShapeKeys, faceParamPairCoverage, facsUnitsInMap, invertShapeKeyMap, mapShapeKeys, resolveShapeKeyAlias, splitShapeKeyName, stripTsPrefix } from "./shape-key-mapping";

describe("authored/shape-key-mapping", () => {
  it("Blender face.py shape key 24종이 전부 param morph 이름으로 매핑된다", () => {
    expect(BLENDER_FACE_SHAPE_KEYS.length).toBe(24);
    const mapped = mapShapeKeys(BLENDER_FACE_SHAPE_KEYS);
    expect(Object.keys(mapped).length).toBe(24);
    for (const key of BLENDER_FACE_SHAPE_KEYS) {
      const alias = BLENDER_SHAPE_KEY_ALIASES[key];
      expect(alias).toBeDefined();
      if (alias) expect(mapped[key]).toBe(paramMorphName(alias.key, alias.sign));
    }
    expect(new Set(Object.values(mapped)).size).toBe(24);
  });

  it("ARKit·VRM 표정 별칭과 보조 별칭(대소문자·VRM 0.x)이 facs 이름으로 매핑된다", () => {
    expect(resolveShapeKeyAlias("jawOpen")).toBe(facsMorphName("jawOpen"));
    expect(resolveShapeKeyAlias("mouthSmileLeft")).toBe("facs:mouthSmile");
    expect(resolveShapeKeyAlias("Blink_L")).toBe("facs:eyeBlinkLeft");
    expect(resolveShapeKeyAlias("Joy")).toBe("facs:mouthSmile");
    expect(resolveShapeKeyAlias("A")).toBe("facs:jawOpen");
    for (const [alias, unit] of Object.entries(FACS_SHAPE_KEY_ALIASES)) expect(resolveShapeKeyAlias(alias)).toBe(facsMorphName(unit));
  });

  it("`<mesh>:<key>` 표기와 ts 접두는 벗겨서 판정하고 규약 이름은 그대로 통과한다", () => {
    expect(splitShapeKeyName("Avatar_Orion_Body:faceEyeSizeBig")).toEqual({ mesh: "Avatar_Orion_Body", key: "faceEyeSizeBig" });
    expect(splitShapeKeyName("param:eyeSize:+")).toEqual({ mesh: null, key: "param:eyeSize:+" });
    expect(splitShapeKeyName("plain")).toEqual({ mesh: null, key: "plain" });
    expect(stripTsPrefix("tsFaceEyeSizeBig")).toBe("faceEyeSizeBig");
    expect(stripTsPrefix("faceEyeSizeBig")).toBe("faceEyeSizeBig");
    expect(resolveShapeKeyAlias("Avatar_Orion_Body:faceEyeSizeBig")).toBe("param:eyeSize:+");
    expect(resolveShapeKeyAlias("tsFaceNoseWidthNarrow")).toBe("param:noseWidth:-");
    expect(resolveShapeKeyAlias("facs:cheekPuff")).toBe("facs:cheekPuff");
    expect(resolveShapeKeyAlias("blendShape2.vrc_v_aa")).toBeNull();
  });

  it("규약 밖 이름과 잘못된 override는 unmapped에 한글 사유로 남는다", () => {
    const result = classifyShapeKeys(["faceEyeSizeBig", "Unknown_Key"], { Custom: "facs:jawOpen", Bad: "nope", Alias: "happy" });
    expect(result.mapped).toEqual({ Custom: "facs:jawOpen", Alias: "facs:mouthSmile", faceEyeSizeBig: "param:eyeSize:+" });
    expect(result.overridden).toEqual(["Custom", "Alias"]);
    expect(result.unmapped.map((entry) => entry.name)).toEqual(["Bad", "Unknown_Key"]);
    expect(result.unmapped[0]?.reasonKo).toMatch(/규약 morph 이름/u);
    expect(result.unmapped[1]?.reasonKo).toMatch(/face\.py 24종/u);
  });

  it("± 쌍 커버리지와 FACS 유닛 집합, 역방향 매핑", () => {
    const mapped = mapShapeKeys(["faceEyeSizeBig", "faceNoseWidthWide", "faceNoseWidthNarrow", "jawOpen", "mouthSmileLeft", "mouthSmileRight"]);
    const coverage = faceParamPairCoverage(mapped);
    expect(coverage.eyeSize).toEqual({ plus: true, minus: false });
    expect(coverage.noseWidth).toEqual({ plus: true, minus: true });
    expect(coverage.jawWidth).toEqual({ plus: false, minus: false });
    expect(Object.keys(coverage).length).toBe(FACE_PARAM_KEYS.length);
    expect(facsUnitsInMap(mapped)).toEqual(["jawOpen", "mouthSmile"]);
    const inverted = invertShapeKeyMap(mapped);
    expect(inverted["facs:mouthSmile"]).toBe("mouthSmileLeft");
    expect(inverted["param:eyeSize:+"]).toBe("faceEyeSizeBig");
  });
});

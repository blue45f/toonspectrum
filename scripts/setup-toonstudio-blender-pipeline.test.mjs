import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Blender는 `bpy.ops.<module>.<op>` 접근에 항상 지연 프록시를 돌려주므로 `hasattr` 기반 프로브는
// 애드온이 없어도 True가 된다. 실제 등록 여부는 `get_rna_type()`가 예외 없이 성공하는지로만 알 수 있다.
const source = readFileSync(join(process.cwd(), "scripts/setup-toonstudio-blender-pipeline.mts"), "utf8");
const probeStart = source.indexOf("const probe = [");
const probeEnd = source.indexOf("].join(", probeStart);
const probeBlock = source.slice(probeStart, probeEnd);

describe("setup-toonstudio-blender-pipeline --check 프로브", () => {
  it("hasattr 대신 get_rna_type()로 연산자 등록 여부를 판정한다", () => {
    expect(probeBlock).not.toContain("hasattr(");
    expect(probeBlock).toContain(".get_rna_type()");
    expect(probeBlock).toContain("def registered(module, name):");
    expect(probeBlock).toContain("except Exception:");
  });

  it("세 애드온 연산자를 모두 등록 판정으로 조회한다", () => {
    expect(probeBlock).toContain("registered('toonstudio', 'run_character_pipeline')");
    expect(probeBlock).toContain("registered('import_scene', 'vrm')");
    expect(probeBlock).toContain("registered('export_scene', 'vrm')");
  });

  it("여러 줄 파이썬이므로 줄바꿈으로 결합한다", () => {
    expect(probeStart).toBeGreaterThan(-1);
    expect(probeEnd).toBeGreaterThan(probeStart);
    expect(source.slice(probeEnd).startsWith('].join("\\n");')).toBe(true);
  });
});

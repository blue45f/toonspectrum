import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

import { CharacterMaterialOverrideRuntime } from "./character-material-override-runtime";

function fixture() {
  const root = new Group();
  const material = new MeshStandardMaterial({ color: "#112233" });
  material.name = "skin";
  const mesh = new Mesh(new BoxGeometry(), material);
  root.add(mesh);
  return { root, material, mesh, runtime: new CharacterMaterialOverrideRuntime(root) };
}

describe("CharacterMaterialOverrideRuntime", () => {
  it("재질 색·투명도 preview, cancel, redo를 같은 원본 위에서 재생한다", () => {
    const { material, runtime } = fixture();
    const original = material.color.clone();
    const dispose = vi.spyOn(material, "dispose");
    const overrides = [{ materialId: "material:skin", baseColor: "#ff0000", opacity: 0.3 }];
    expect(runtime.update(overrides)).toEqual({ materialCount: 1, warnings: [] });
    expect(material.color.getHexString()).toBe("ff0000");
    expect(material.opacity).toBe(0.3);
    expect(material.transparent).toBe(true);
    runtime.update([]);
    expect(material.color.equals(original)).toBe(true);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    runtime.update(overrides);
    expect(material.color.getHexString()).toBe("ff0000");
    runtime.dispose();
    expect(material.color.equals(original)).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("MToon의 실제 속성을 적용하고 지원하지 않는 shader 속성을 정확히 알린다", () => {
    const { root, material, runtime } = fixture();
    Object.assign(material, { shadeColorFactor: new Color("#334455"), outlineColorFactor: new Color("#112233"), outlineWidthFactor: 0.2 });
    expect(runtime.update([{ materialId: "skin", shadowColor: "#abcdef", outlineColor: "#998877", outlineWidth: 0.1 }]).warnings).toEqual([]);
    expect(Reflect.get(material, "shadeColorFactor").getHexString()).toBe("abcdef");
    expect(Reflect.get(material, "outlineWidthFactor")).toBe(0.1);
    runtime.dispose();
    expect(Reflect.get(material, "outlineWidthFactor")).toBe(0.2);
    const unsupported = new MeshStandardMaterial();
    unsupported.name = "shirt";
    root.add(new Mesh(new BoxGeometry(), unsupported));
    const result = runtime.update([{ materialId: "shirt", baseColor: "#ffffff", outlineWidth: 0.1 }]);
    expect(result.materialCount).toBe(1);
    expect(result.warnings).toEqual([expect.stringContaining("outlineWidthFactor")]);
    runtime.dispose();
  });

  it("문서의 RGBA 색을 실제 RGB와 opacity로 분리해 적용한다", () => {
    const { material, runtime } = fixture();
    expect(runtime.update([{ materialId: "skin", baseColor: "#abcdef80", opacity: 0.5 }]).warnings).toEqual([]);
    expect(material.color.getHexString()).toBe("abcdef");
    expect(material.opacity).toBeCloseTo(0.5 * 128 / 255);
    expect(material.transparent).toBe(true);
    runtime.dispose();
    expect(material.opacity).toBe(1);
    expect(material.color.getHexString()).toBe("112233");
  });

  it("아직 Worker가 생성 중인 groom override는 담당 renderer에 맡기고 누락으로 오표시하지 않는다", () => {
    const { runtime } = fixture();
    expect(runtime.update([{ materialId: "material:hair", baseColor: "#abcdef" }], ["material:hair"]))
      .toEqual({ materialCount: 0, warnings: [] });
    runtime.dispose();
  });

  it("호스트가 나중에 바꾼 palette는 새 바탕으로 보존하고 렌더 직전에 override를 재생한다", () => {
    const { mesh, material, runtime } = fixture();
    const previous = vi.fn();
    mesh.onBeforeRender = previous;
    runtime.update([{ materialId: "skin", baseColor: "#ff0000" }]);
    material.color.set("#00ff00");
    Reflect.apply(mesh.onBeforeRender, mesh, [{}, {}, {}, mesh.geometry, material, null]);
    expect(previous).toHaveBeenCalledOnce();
    expect(material.color.getHexString()).toBe("ff0000");
    runtime.dispose();
    expect(material.color.getHexString()).toBe("00ff00");
    expect(mesh.onBeforeRender).toBe(previous);
  });

  it("외부 수정·중복 재질·찾을 수 없는 ID를 덮어쓰지 않는다", () => {
    const { root, mesh, material, runtime } = fixture();
    runtime.update([{ materialId: "skin", baseColor: "#ff0000" }]);
    material.color.set("#00ff00");
    const external = vi.fn();
    mesh.onBeforeRender = external;
    runtime.clear();
    expect(material.color.getHexString()).toBe("00ff00");
    expect(mesh.onBeforeRender).toBe(external);
    const duplicate = material.clone();
    root.add(new Mesh(new BoxGeometry(), duplicate));
    const result = runtime.update([{ materialId: "skin", opacity: 0.1 }, { materialId: "missing", opacity: 0.1 }]);
    expect(result.materialCount).toBe(0);
    expect(result.warnings).toHaveLength(2);
    expect(material.opacity).toBe(1);
    expect(duplicate.opacity).toBe(1);
  });

  it("캡처 잠금 중 PSD의 임시 재질 변경을 덮어쓰거나 바탕색으로 저장하지 않는다", () => {
    const { root, mesh, material } = fixture();
    let capturing = false;
    const runtime = new CharacterMaterialOverrideRuntime(root, () => capturing);
    runtime.update([{ materialId: "skin", baseColor: "#ff0000" }]);
    capturing = true;
    material.color.set("#ffffff");
    Reflect.apply(mesh.onBeforeRender, mesh, [{}, {}, {}, mesh.geometry, material, null]);
    expect(material.color.getHexString()).toBe("ffffff");
    material.color.set("#ff0000");
    capturing = false;
    runtime.dispose();
    expect(material.color.getHexString()).toBe("112233");
  });
});

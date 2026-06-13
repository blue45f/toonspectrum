import { describe, expect, it } from "vitest";

import {
  PROP_ATTACH_BONES,
  VRM_PROPS,
  buildPropObject,
  createPropInstance,
  parseVrmProps,
  propDefById,
  propsByCategory,
  serializeVrmProps,
  type PropDef,
  type ThreeLike,
  type ThreeObject,
} from "./studio-vrm-props";

describe("VRM 소품 카탈로그", () => {
  it("id가 모두 고유하다", () => {
    const ids = VRM_PROPS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("16종 이상이 등록되어 있다", () => {
    expect(VRM_PROPS.length).toBeGreaterThanOrEqual(16);
  });

  it("모든 기본 부착 본이 부착 가능 본 집합에 속한다", () => {
    for (const p of VRM_PROPS) {
      expect(PROP_ATTACH_BONES).toContain(p.defaultBone);
    }
  });

  it("세 카테고리에 모두 소품이 있다", () => {
    expect(propsByCategory("hand").length).toBeGreaterThan(0);
    expect(propsByCategory("head").length).toBeGreaterThan(0);
    expect(propsByCategory("body").length).toBeGreaterThan(0);
  });
});

describe("부착 인스턴스 생성·직렬화", () => {
  it("카탈로그 기본값으로 인스턴스를 만든다", () => {
    const inst = createPropInstance("smartphone", "fixed");
    expect(inst).not.toBeNull();
    expect(inst!.propId).toBe("smartphone");
    expect(inst!.uid).toBe("fixed");
    expect(inst!.bone).toBe("rightHand");
  });

  it("알 수 없는 propId는 null", () => {
    expect(createPropInstance("nope")).toBeNull();
  });

  it("빈 배열은 직렬화 시 undefined(문서에 키 미생성)", () => {
    expect(serializeVrmProps([])).toBeUndefined();
  });

  it("직렬화 라운드트립이 값을 보존한다", () => {
    const inst = createPropInstance("crown", "c1")!;
    inst.position = [0.1, 0.2, -0.3];
    inst.rotationDeg = [10, 20, 30];
    inst.scale = 1.5;
    inst.color = "#abcdef";
    const ser = serializeVrmProps([inst]);
    const parsed = parseVrmProps(ser);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      propId: "crown",
      uid: "c1",
      position: [0.1, 0.2, -0.3],
      rotationDeg: [10, 20, 30],
      scale: 1.5,
      color: "#abcdef",
    });
  });

  it("범위를 벗어난 값을 클램프한다", () => {
    const parsed = parseVrmProps({
      items: [{ propId: "mug", uid: "m1", bone: "rightHand", position: [99, -99, 0], rotationDeg: [999, 0, 0], scale: 99, color: "#fff" }],
    });
    const item = parsed.items[0];
    expect(item.position[0]).toBeLessThanOrEqual(1);
    expect(item.position[1]).toBeGreaterThanOrEqual(-1);
    expect(Math.abs(item.rotationDeg[0])).toBeLessThanOrEqual(180);
    expect(item.scale).toBeLessThanOrEqual(4);
    expect(item.color).toBe("#e8e2d6"); // 잘못된 6자리 아님(#fff) → 기본색 폴백
  });

  it("알 수 없는 propId 항목은 파싱에서 제거된다", () => {
    const parsed = parseVrmProps({ items: [{ propId: "ghost" }, { propId: "book" }] });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].propId).toBe("book");
  });

  it("잘못된 본 이름은 기본 본으로 폴백한다", () => {
    const parsed = parseVrmProps({ items: [{ propId: "cap", bone: "tail" }] });
    expect(parsed.items[0].bone).toBe(propDefById("cap")!.defaultBone);
  });
});

/* three 목 — 메시 빌더가 three 없이도 동작하는지 검증 */
function makeThreeMock(): { three: ThreeLike; created: string[] } {
  const created: string[] = [];
  class Obj implements ThreeObject {
    name = "";
    children: Obj[] = [];
    position = { set() {} };
    rotation = { set() {} };
    scale = { setScalar() {} };
    add(child: ThreeObject) {
      this.children.push(child as Obj);
    }
  }
  const three: ThreeLike = {
    Group: Obj as unknown as ThreeLike["Group"],
    Mesh: class {
      constructor() {
        created.push("mesh");
        return new Obj();
      }
    } as unknown as ThreeLike["Mesh"],
    MeshStandardMaterial: class {} as unknown as ThreeLike["MeshStandardMaterial"],
    BoxGeometry: class {} as unknown as ThreeLike["BoxGeometry"],
    CylinderGeometry: class {} as unknown as ThreeLike["CylinderGeometry"],
    SphereGeometry: class {} as unknown as ThreeLike["SphereGeometry"],
    ConeGeometry: class {} as unknown as ThreeLike["ConeGeometry"],
    TorusGeometry: class {} as unknown as ThreeLike["TorusGeometry"],
    Color: class {} as unknown as ThreeLike["Color"],
    DoubleSide: 2,
  };
  return { three, created };
}

describe("소품 메시 빌더", () => {
  it("모든 소품이 에러 없이 메시 그룹을 만든다", () => {
    for (const def of VRM_PROPS as readonly PropDef[]) {
      const { three } = makeThreeMock();
      const obj = buildPropObject(three, def, def.defaultColor);
      expect(obj.name).toBe(`prop:${def.id}`);
    }
  });

  it("색상 인스턴스 오버라이드를 수용한다", () => {
    const { three } = makeThreeMock();
    const def = propDefById("cape")!;
    const obj = buildPropObject(three, def, "#123456");
    expect(obj.name).toBe("prop:cape");
  });
});

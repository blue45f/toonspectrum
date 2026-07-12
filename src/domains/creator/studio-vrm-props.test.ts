import { describe, expect, it, vi } from "vitest";

import {
  PROP_ATTACH_BONES,
  VRM_PROPS_VERSION,
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
    expect(VRM_PROPS.length).toBeGreaterThanOrEqual(37);
  });

  it("의료진 역할을 구분할 수 있는 의료 소품 7종을 제공한다", () => {
    const medicalIds = [
      "clipboard",
      "syringe",
      "medicalBag",
      "surgicalCap",
      "faceMask",
      "stethoscope",
      "idBadge",
    ];
    for (const id of medicalIds) {
      expect(propDefById(id), id).toBeDefined();
    }
    expect(propsByCategory("hand").map((prop) => prop.id)).toEqual(
      expect.arrayContaining(["clipboard", "syringe", "medicalBag"])
    );
    expect(propsByCategory("head").map((prop) => prop.id)).toEqual(
      expect.arrayContaining(["surgicalCap", "faceMask"])
    );
    expect(propsByCategory("body").map((prop) => prop.id)).toEqual(
      expect.arrayContaining(["stethoscope", "idBadge"])
    );
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

  it("37개 소품 모두 유효한 접촉 앵커와 자동 맞춤 프로필을 가진다", () => {
    expect(VRM_PROPS).toHaveLength(37);

    for (const def of VRM_PROPS) {
      expect(def.anchors.length, `${def.id}: anchors`).toBeGreaterThan(0);
      expect(
        def.anchors.some((candidate) => candidate.role === "primary" || candidate.role === "surface"),
        `${def.id}: primary/surface`
      ).toBe(true);
      expect(new Set(def.anchors.map((candidate) => candidate.id)).size, `${def.id}: unique anchor id`).toBe(def.anchors.length);

      for (const candidate of def.anchors) {
        const values = [...candidate.position, ...candidate.forward, ...candidate.up];
        expect(values.every(Number.isFinite), `${def.id}/${candidate.id}: finite`).toBe(true);
        const forwardLength = Math.hypot(...candidate.forward);
        const upLength = Math.hypot(...candidate.up);
        const dot = candidate.forward[0] * candidate.up[0]
          + candidate.forward[1] * candidate.up[1]
          + candidate.forward[2] * candidate.up[2];
        expect(forwardLength, `${def.id}/${candidate.id}: forward`).toBeCloseTo(1, 6);
        expect(upLength, `${def.id}/${candidate.id}: up`).toBeCloseTo(1, 6);
        expect(dot, `${def.id}/${candidate.id}: orthogonal`).toBeCloseTo(0, 6);
        if (candidate.gripRadius !== undefined) {
          expect(candidate.gripRadius, `${def.id}/${candidate.id}: grip radius`).toBeGreaterThan(0);
        }
      }

      expect(Number.isFinite(def.fit.designReference), `${def.id}: design reference`).toBe(true);
      expect(def.fit.designReference, `${def.id}: design reference`).toBeGreaterThan(0);
      expect(def.fit.minScale, `${def.id}: min scale`).toBeGreaterThan(0);
      expect(def.fit.maxScale, `${def.id}: scale range`).toBeGreaterThanOrEqual(def.fit.minScale);
    }
  });

  it("모든 손 소품에 실제 그립 프로필과 primary 앵커가 있다", () => {
    for (const def of propsByCategory("hand")) {
      expect(def.grip, `${def.id}: grip`).toBeDefined();
      expect(def.grip!.radius, `${def.id}: radius`).toBeGreaterThan(0);
      expect(def.grip!.fingerCurlDeg, `${def.id}: finger curl`).toBeGreaterThanOrEqual(0);
      expect(def.grip!.thumbOppositionDeg, `${def.id}: thumb`).toBeGreaterThanOrEqual(0);
      const primary = def.anchors.find((candidate) => candidate.role === "primary");
      expect(primary, `${def.id}: primary`).toBeDefined();
      expect(primary!.gripRadius, `${def.id}: anchor grip radius`).toBeGreaterThan(0);
    }
  });

  it("양손 사용 소품은 secondary 앵커를 명시한다", () => {
    const twoHanded = ["book", "clipboard", "flute", "sword", "staff", "umbrella", "bouquet"];
    for (const id of twoHanded) {
      const def = propDefById(id)!;
      expect(def.anchors.some((candidate) => candidate.role === "secondary"), id).toBe(true);
    }
  });

  it("핵심 소품 앵커가 geometry의 실제 접촉점과 일치한다", () => {
    expect(propDefById("sword")!.anchors.find((candidate) => candidate.id === "primary")!.position).toEqual([0, -0.37, 0]);
    expect(propDefById("mug")!.anchors.find((candidate) => candidate.id === "primary")!.position).toEqual([0.07, 0, 0]);
    expect(propDefById("medicalBag")!.anchors.find((candidate) => candidate.id === "primary")!.position).toEqual([0, 0.155, 0]);
    expect(propDefById("umbrella")!.anchors.find((candidate) => candidate.id === "primary")!.position).toEqual([-0.03, -0.35, 0]);
  });
});

describe("부착 인스턴스 생성·직렬화", () => {
  it("카탈로그 기본값으로 인스턴스를 만든다", () => {
    const inst = createPropInstance("smartphone", "fixed");
    expect(inst).not.toBeNull();
    expect(inst!.propId).toBe("smartphone");
    expect(inst!.uid).toBe("fixed");
    expect(inst!.bone).toBe("rightHand");
    expect(inst!.rig).toEqual({
      version: 2,
      mode: "auto",
      anchorId: "primary",
      autoScale: true,
      autoFingerPose: true,
      deltaPosition: [0, 0, 0],
      deltaRotationDeg: [0, 0, 0],
      deltaScale: 1,
    });
  });

  it("알 수 없는 propId는 null", () => {
    expect(createPropInstance("nope")).toBeNull();
  });

  it("빈 배열은 직렬화 시 undefined(문서에 키 미생성)", () => {
    expect(serializeVrmProps([])).toBeUndefined();
  });

  it("직렬화 문서는 V2 버전을 명시한다", () => {
    expect(serializeVrmProps([createPropInstance("mug", "v2")!])?.version).toBe(VRM_PROPS_VERSION);
    expect(VRM_PROPS_VERSION).toBe(2);
  });

  it("저장 후 앱을 다시 연 다음 같은 소품을 추가해도 uid가 충돌하지 않는다", async () => {
    vi.resetModules();
    const beforeReload = await import("./studio-vrm-props");
    const saved = beforeReload.serializeVrmProps([beforeReload.createPropInstance("mug")!])!;

    vi.resetModules();
    const afterReload = await import("./studio-vrm-props");
    const loaded = afterReload.parseVrmProps(saved);
    const added = afterReload.createPropInstance("mug")!;

    expect(loaded.items[0].uid).toBe(saved.items[0].uid);
    expect(added.uid).not.toBe(loaded.items[0].uid);
  });

  it("중복·빈 직렬화 uid를 고유한 값으로 재발급하고 첫 유효 uid는 보존한다", () => {
    const parsed = parseVrmProps({
      version: VRM_PROPS_VERSION,
      items: [
        { propId: "mug", uid: "shared" },
        { propId: "book", uid: "shared" },
        { propId: "sword", uid: "" },
        { propId: "cap", uid: "   " },
        { propId: "crown", uid: "keep-me" },
      ],
    });
    const uids = parsed.items.map((item) => item.uid);

    expect(uids[0]).toBe("shared");
    expect(uids[1]).not.toBe("shared");
    expect(uids[4]).toBe("keep-me");
    expect(uids.every((uid) => uid.trim().length > 0)).toBe(true);
    expect(new Set(uids).size).toBe(uids.length);
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

  it("version 없음 또는 V1 문서는 기존 transform을 보존하고 rig를 해석하지 않는다", () => {
    const legacyItem = {
      uid: "legacy",
      propId: "sword",
      bone: "leftHand",
      position: [0.123, -0.234, 0.345],
      rotationDeg: [11, -22, 33],
      scale: 1.37,
      color: "#ABCDEF",
      rig: createPropInstance("sword")!.rig,
    };

    for (const raw of [{ items: [legacyItem] }, { version: 1, items: [legacyItem] }]) {
      const item = parseVrmProps(raw).items[0];
      expect(item).toMatchObject({
        uid: "legacy",
        propId: "sword",
        bone: "leftHand",
        position: [0.123, -0.234, 0.345],
        rotationDeg: [11, -22, 33],
        scale: 1.37,
        color: "#abcdef",
      });
      expect(item.rig).toBeUndefined();
    }
  });

  it("V2 문서라도 rig가 없는 항목은 레거시 항목으로 유지한다", () => {
    const item = parseVrmProps({
      version: 2,
      items: [{ uid: "legacy-v2", propId: "mug", position: [0.1, 0.2, 0.3] }],
    }).items[0];
    expect(item.position).toEqual([0.1, 0.2, 0.3]);
    expect(item.rig).toBeUndefined();
  });

  it("V2 rig와 양손 보조점을 직렬화 라운드트립한다", () => {
    const book = createPropInstance("book", "book-v2")!;
    book.rig = {
      ...book.rig!,
      mode: "custom",
      deltaPosition: [0.03, -0.02, 0.01],
      deltaRotationDeg: [12, -18, 4],
      deltaScale: 1.2,
      secondary: {
        enabled: true,
        anchorId: "secondary",
        bone: "rightHand",
        influence: 0.75,
        elbowHint: [0.1, 0.2, -0.1],
      },
    };

    const parsed = parseVrmProps(serializeVrmProps([book]));
    expect(parsed.version).toBe(2);
    expect(parsed.items[0].rig).toEqual(book.rig);
  });

  it("손상된 V2 rig를 카탈로그 기본 앵커와 안전 범위로 정규화한다", () => {
    const parsed = parseVrmProps({
      version: 2,
      items: [{
        uid: "bad-rig",
        propId: "book",
        bone: "leftHand",
        rig: {
          version: 2,
          mode: "unexpected",
          anchorId: "missing",
          autoScale: "yes",
          autoFingerPose: null,
          deltaPosition: [99, -99, Number.NaN],
          deltaRotationDeg: [999, -999, Number.POSITIVE_INFINITY],
          deltaScale: 99,
          secondary: {
            enabled: "yes",
            anchorId: "missing-secondary",
            bone: "leftHand",
            influence: 99,
            elbowHint: [99, -99, Number.NaN],
          },
        },
      }],
    });

    expect(parsed.items[0].rig).toEqual({
      version: 2,
      mode: "auto",
      anchorId: "primary",
      autoScale: true,
      autoFingerPose: true,
      deltaPosition: [1, -1, 0],
      deltaRotationDeg: [180, -180, 0],
      deltaScale: 4,
      secondary: {
        enabled: false,
        anchorId: "secondary",
        bone: "rightHand",
        influence: 1,
        elbowHint: [1, -1, 0],
      },
    });
  });

  it("양손 소품의 누락된 영향도와 스마트 회전을 소품별 안전 기본값으로 복구한다", () => {
    const parsed = parseVrmProps({
      version: 2,
      items: [{
        uid: "book-safe-defaults",
        propId: "book",
        bone: "leftHand",
        rig: {
          version: 2,
          mode: "auto",
          anchorId: "primary",
          secondary: {
            enabled: true,
            anchorId: "secondary",
            bone: "rightHand",
          },
        },
      }],
    });

    expect(parsed.items[0].rig?.secondary?.influence).toBe(0.65);
    expect(propDefById("book")?.smartRotationDeg).toEqual([0, 0, 90]);
  });

  it("V2가 아닌 item rig와 secondary 미지원 소품의 보조점은 제거한다", () => {
    const parsed = parseVrmProps({
      version: 2,
      items: [
        { propId: "sword", rig: { version: 1, anchorId: "primary" } },
        {
          propId: "mug",
          rig: {
            version: 2,
            mode: "auto",
            anchorId: "primary",
            secondary: { enabled: true, anchorId: "secondary", bone: "leftHand", influence: 1 },
          },
        },
      ],
    });

    expect(parsed.items[0].rig).toBeUndefined();
    expect(parsed.items[1].rig).toBeDefined();
    expect(parsed.items[1].rig!.secondary).toBeUndefined();
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

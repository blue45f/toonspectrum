import { describe, expect, it } from "vitest";

import {
  FALLBACK_WARDROBE_METRICS,
  WARDROBE_BONES,
  WARDROBE_FIT_MAX,
  WARDROBE_FIT_MIN,
  WARDROBE_HIDE_COSTUME_SLOTS,
  WARDROBE_ITEMS,
  WARDROBE_SETS,
  WARDROBE_SLOTS,
  applyWardrobeSet,
  buildGarmentParts,
  createWardrobeEquip,
  parseWardrobe,
  sanitizeWardrobeMetrics,
  serializeWardrobe,
  wardrobeItemById,
  wardrobeItemsBySlot,
  type GarmentPart,
  type WardrobeMetrics,
  type WardrobeState,
} from "./studio-vrm-wardrobe";

describe("워드로브 카탈로그", () => {
  it("id가 모두 고유하다", () => {
    const ids = WARDROBE_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("슬롯별 6종씩 24종이 등록되어 있다", () => {
    expect(WARDROBE_ITEMS.length).toBe(24);
    for (const slot of WARDROBE_SLOTS) {
      expect(wardrobeItemsBySlot(slot).length).toBe(6);
    }
  });

  it("모든 아이템이 라벨·힌트·기본색을 가진다", () => {
    for (const item of WARDROBE_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.hint.length).toBeGreaterThan(0);
      expect(item.defaultColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("wardrobeItemById는 미지의 id에 undefined를 준다", () => {
    expect(wardrobeItemById("no-such-item")).toBeUndefined();
    expect(wardrobeItemById("blazer")?.slot).toBe("outer");
  });
});

describe("파츠 빌더", () => {
  const collectDims = (part: GarmentPart): number[] => {
    switch (part.shape.kind) {
      case "cylinder":
        return [part.shape.rTop, part.shape.rBottom, part.shape.h];
      case "box":
        return [part.shape.w, part.shape.h, part.shape.d];
      case "sphere":
        return [part.shape.r];
      case "torus":
        return [part.shape.r, part.shape.tube];
    }
  };

  it("모든 아이템이 1개 이상의 파츠를 만들고 치수가 양수·유한하다", () => {
    for (const item of WARDROBE_ITEMS) {
      const parts = buildGarmentParts(item.id, FALLBACK_WARDROBE_METRICS);
      expect(parts.length, item.id).toBeGreaterThan(0);
      for (const part of parts) {
        expect(WARDROBE_BONES).toContain(part.bone);
        for (const dim of collectDims(part)) {
          expect(Number.isFinite(dim), `${item.id} dim`).toBe(true);
          expect(dim, `${item.id} dim`).toBeGreaterThan(0);
        }
        for (const off of part.offset) {
          expect(Number.isFinite(off), `${item.id} offset`).toBe(true);
        }
      }
    }
  });

  it("신발은 좌우 발 본에 대칭으로 파츠를 만든다", () => {
    for (const item of wardrobeItemsBySlot("shoes")) {
      const parts = buildGarmentParts(item.id, FALLBACK_WARDROBE_METRICS);
      const bones = new Set(parts.map((p) => p.bone));
      expect(bones.has("leftFoot") || bones.has("leftLowerLeg"), item.id).toBe(true);
      expect(bones.has("rightFoot") || bones.has("rightLowerLeg"), item.id).toBe(true);
    }
  });

  it("fit 배율은 반경을 키운다", () => {
    const base = buildGarmentParts("blazer", FALLBACK_WARDROBE_METRICS, 1);
    const loose = buildGarmentParts("blazer", FALLBACK_WARDROBE_METRICS, 1.4);
    const baseTorso = base.find((p) => p.bone === "spine" && p.shape.kind === "cylinder");
    const looseTorso = loose.find((p) => p.bone === "spine" && p.shape.kind === "cylinder");
    if (baseTorso?.shape.kind !== "cylinder" || looseTorso?.shape.kind !== "cylinder") {
      throw new Error("torso cylinder part missing");
    }
    expect(looseTorso.shape.rTop).toBeGreaterThan(baseTorso.shape.rTop);
  });

  it("치수는 체형을 따른다 — 작은 골격이면 파츠도 작아진다", () => {
    const small: WardrobeMetrics = sanitizeWardrobeMetrics({
      ...FALLBACK_WARDROBE_METRICS,
      shoulderW: 0.16,
      hipW: 0.09,
      hipsToSpine: 0.05,
      spineToNeck: 0.16,
    });
    const bigTorso = buildGarmentParts("tshirt", FALLBACK_WARDROBE_METRICS)[0];
    const smallTorso = buildGarmentParts("tshirt", small)[0];
    if (bigTorso.shape.kind !== "cylinder" || smallTorso.shape.kind !== "cylinder") {
      throw new Error("unexpected torso shape");
    }
    expect(smallTorso.shape.rTop).toBeLessThan(bigTorso.shape.rTop);
    expect(smallTorso.shape.h).toBeLessThan(bigTorso.shape.h);
  });

  it("미지의 아이템은 빈 배열을 준다", () => {
    expect(buildGarmentParts("no-such-item", FALLBACK_WARDROBE_METRICS)).toEqual([]);
  });
});

describe("측정값 정규화", () => {
  it("NaN·0·비정상 값은 폴백으로 대체된다", () => {
    const m = sanitizeWardrobeMetrics({
      shoulderW: Number.NaN,
      hipW: 0,
      up: [0, 0, 0],
      upperArm: { left: { len: Number.POSITIVE_INFINITY, axis: [0, 0, 0] }, right: { len: -1, axis: [0, 1, 0] } },
    });
    expect(m.shoulderW).toBe(FALLBACK_WARDROBE_METRICS.shoulderW);
    expect(m.hipW).toBeGreaterThan(0);
    expect(m.up).toEqual(FALLBACK_WARDROBE_METRICS.up);
    expect(Number.isFinite(m.upperArm.left.len)).toBe(true);
    expect(m.upperArm.left.len).toBeGreaterThan(0);
    expect(m.upperArm.right.len).toBeGreaterThan(0);
  });

  it("null 입력은 폴백 전체를 준다", () => {
    expect(sanitizeWardrobeMetrics(null)).toEqual(FALLBACK_WARDROBE_METRICS);
  });

  it("방향 벡터는 단위 벡터로 정규화된다", () => {
    const m = sanitizeWardrobeMetrics({ up: [0, 4, 0] });
    expect(m.up[1]).toBeCloseTo(1);
  });
});

describe("장착 상태 직렬화", () => {
  it("정상 상태를 왕복 직렬화한다", () => {
    const state: WardrobeState = {
      outer: { itemId: "blazer", color: "#123456", fit: 1.2 },
      shoes: { itemId: "sneakers", color: "#ffffff", fit: 0.9 },
    };
    const serialized = serializeWardrobe(state);
    expect(serialized?.version).toBe(1);
    const parsed = parseWardrobe(serialized);
    expect(parsed).toEqual(state);
  });

  it("빈 상태는 undefined로 직렬화된다(문서 하위호환)", () => {
    expect(serializeWardrobe({})).toBeUndefined();
  });

  it("미지의 아이템·슬롯 불일치 장착은 버린다", () => {
    const parsed = parseWardrobe({
      version: 1,
      slots: {
        outer: { itemId: "no-such", color: "#000000", fit: 1 },
        top: { itemId: "blazer", color: "#000000", fit: 1 }, // blazer는 outer 슬롯
        bottom: { itemId: "pleated", color: "#101010", fit: 1 },
      },
    });
    expect(parsed.outer).toBeUndefined();
    expect(parsed.top).toBeUndefined();
    expect(parsed.bottom?.itemId).toBe("pleated");
  });

  it("fit은 허용 범위로, 색상은 hex로 클램프된다", () => {
    const parsed = parseWardrobe({
      slots: { bottom: { itemId: "pants", color: "red", fit: 99 } },
    });
    expect(parsed.bottom?.fit).toBe(WARDROBE_FIT_MAX);
    expect(parsed.bottom?.color).toBe(wardrobeItemById("pants")?.defaultColor);
    const parsed2 = parseWardrobe({ slots: { bottom: { itemId: "pants", fit: 0.1 } } });
    expect(parsed2.bottom?.fit).toBe(WARDROBE_FIT_MIN);
  });

  it("쓰레기 입력은 빈 상태를 준다", () => {
    expect(parseWardrobe(null)).toEqual({});
    expect(parseWardrobe("junk")).toEqual({});
    expect(parseWardrobe({ slots: "junk" })).toEqual({});
  });

  it("createWardrobeEquip은 카탈로그 기본값을 쓴다", () => {
    const equip = createWardrobeEquip("heels");
    expect(equip).toEqual({ itemId: "heels", color: wardrobeItemById("heels")?.defaultColor, fit: 1 });
    expect(createWardrobeEquip("no-such")).toBeNull();
  });
});

describe("테마 세트", () => {
  it("모든 세트가 유효한 아이템만 참조하고 슬롯이 일치한다", () => {
    for (const set of WARDROBE_SETS) {
      const state = applyWardrobeSet(set);
      const equipped = Object.keys(state);
      expect(equipped.length, set.id).toBeGreaterThan(0);
      for (const slot of WARDROBE_SLOTS) {
        const pick = set.equips[slot];
        if (!pick) continue;
        expect(wardrobeItemById(pick.itemId)?.slot, `${set.id}.${slot}`).toBe(slot);
        expect(state[slot]?.itemId).toBe(pick.itemId);
      }
      // 세트 상태는 파서를 그대로 통과해야 한다.
      expect(parseWardrobe({ version: 1, slots: state })).toEqual(state);
    }
  });

  it("세트 id가 고유하다", () => {
    const ids = WARDROBE_SETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("기존 의상 자동 숨김 매핑", () => {
  it("모든 슬롯에 매핑이 있고 유효한 의상 슬롯만 가리킨다", () => {
    const validCostumeSlots = ["outer", "tops", "bottoms", "onepiece", "shoes", "accessory", "innerwear"];
    for (const slot of WARDROBE_SLOTS) {
      const mapped = WARDROBE_HIDE_COSTUME_SLOTS[slot];
      expect(mapped.length).toBeGreaterThan(0);
      for (const cs of mapped) expect(validCostumeSlots).toContain(cs);
    }
  });
});

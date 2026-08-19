import { describe, expect, it } from "vitest";

import {
  FALLBACK_WARDROBE_METRICS,
  DEFAULT_WARDROBE_OPTIONS,
  VRM_WARDROBE_VERSION,
  WARDROBE_BONES,
  WARDROBE_FABRICS,
  WARDROBE_FIT_MAX,
  WARDROBE_FIT_MIN,
  WARDROBE_HIDE_COSTUME_SLOTS,
  WARDROBE_ITEMS,
  LEGACY_WARDROBE_REPLACEMENTS,
  SELECTABLE_WARDROBE_SETS,
  WARDROBE_SETS,
  WARDROBE_SLOTS,
  applyWardrobeItemSelection,
  applyWardrobeSet,
  buildGarmentParts,
  createWardrobeEquip,
  mergeWardrobeCostumeVisibility,
  parseWardrobe,
  parseWardrobeDocument,
  sanitizeWardrobeMetrics,
  selectableWardrobeItemsBySlot,
  selectableWardrobeSetById,
  serializeWardrobe,
  wardrobeItemById,
  wardrobeFabricById,
  wardrobeItemsBySlot,
  resolveWardrobeItemForNewSelection,
  type GarmentPart,
  type WardrobeMetrics,
  type WardrobeState,
} from "./studio-vrm-wardrobe";

describe("워드로브 카탈로그", () => {
  it("id가 모두 고유하다", () => {
    const ids = WARDROBE_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("슬롯별 7종씩 28종이 등록되어 있다", () => {
    expect(WARDROBE_ITEMS.length).toBe(28);
    for (const slot of WARDROBE_SLOTS) {
      expect(wardrobeItemsBySlot(slot).length).toBe(7);
    }
  });

  it("의료 가운·스크럽·팬츠·클로그를 실제 파츠로 제공한다", () => {
    expect(wardrobeItemById("labcoat")?.slot).toBe("outer");
    expect(wardrobeItemById("scrubs")?.slot).toBe("top");
    expect(wardrobeItemById("scrubpants")?.slot).toBe("bottom");
    expect(wardrobeItemById("clogs")?.slot).toBe("shoes");
    for (const id of ["labcoat", "scrubs", "scrubpants", "clogs"]) {
      expect(buildGarmentParts(id, FALLBACK_WARDROBE_METRICS).length, id).toBeGreaterThan(1);
    }
  });

  it("모든 아이템이 라벨·힌트·기본색을 가진다", () => {
    for (const item of WARDROBE_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.hint.length).toBeGreaterThan(0);
      expect(item.defaultColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(wardrobeFabricById(item.defaultFabricId)).toBeDefined();
      expect(item.fitProfile.version).toBe(1);
      expect(item.fitProfile.regions.length).toBeGreaterThan(0);
      expect(item.geometrySource).toBe(
        item.id === "pleated" || item.id === "longskirt"
          ? "xpbd-skirt-v1"
          : item.slot === "shoes"
            ? "rigid-procedural"
            : "skinned-procedural-v1",
      );
    }
  });

  it("플리츠·롱스커트의 XPBD 범위와 자기 충돌 미지원을 과장 없이 안내한다", () => {
    for (const itemId of ["pleated", "longskirt"] as const) {
      const item = wardrobeItemById(itemId);
      expect(item?.geometrySource).toBe("xpbd-skirt-v1");
      expect(item?.hint).toContain("신체");
      expect(item?.hint).toContain("자기 충돌은 아직 지원하지 않습니다");
      expect(item?.hint).not.toContain("절대 뚫리지 않");
    }
  });

  it("직물 프리셋은 유효한 물성과 쉬운 설명을 제공한다", () => {
    expect(WARDROBE_FABRICS.length).toBeGreaterThanOrEqual(8);
    for (const fabric of WARDROBE_FABRICS) {
      expect(fabric.label.length).toBeGreaterThan(0);
      expect(fabric.hint.length).toBeGreaterThan(0);
      expect(fabric.roughness).toBeGreaterThanOrEqual(0);
      expect(fabric.roughness).toBeLessThanOrEqual(1);
      expect(fabric.metalness).toBeGreaterThanOrEqual(0);
      expect(fabric.metalness).toBeLessThanOrEqual(1);
      expect(fabric.weaveStrength).toBeGreaterThanOrEqual(0);
    }
  });

  it("wardrobeItemById는 미지의 id에 undefined를 준다", () => {
    expect(wardrobeItemById("no-such-item")).toBeUndefined();
    expect(wardrobeItemById("blazer")?.slot).toBe("outer");
  });

  it("Wave 3에서 저품질 10종을 다중 파츠 본 추종형 의상으로 승격한다", () => {
    const upgradedIds = [
      "tank",
      "tshirt",
      "shorts",
      "scrubs",
      "sailor",
      "dress",
      "cardigan",
      "pants",
      "wide",
      "scrubpants",
    ].sort();

    expect(LEGACY_WARDROBE_REPLACEMENTS).toEqual({});
    expect(
      WARDROBE_ITEMS.filter((item) => item.catalogStatus === "legacy-only")
        .map((item) => item.id)
        .sort(),
    ).toEqual([]);

    for (const id of upgradedIds) {
      const item = wardrobeItemById(id);
      const resolved = resolveWardrobeItemForNewSelection(id);
      const parts = buildGarmentParts(id, FALLBACK_WARDROBE_METRICS);
      expect(item?.quality, id).toBe("standard-procedural");
      expect(item?.catalogStatus, id).toBe("selectable");
      expect(item?.replacementId, id).toBeNull();
      expect(item?.geometrySource, id).toBe("skinned-procedural-v1");
      expect(resolved?.id, id).toBe(id);
      expect(parts.length, id).toBeGreaterThanOrEqual(5);
      expect(new Set(parts.map((part) => part.shape.kind)).size, id).toBeGreaterThanOrEqual(2);
    }
  });

  it("신규 선택 목록과 세트에는 legacy-only ID가 없고 승격 ID를 그대로 쓴다", () => {
    const legacyIds = new Set(Object.keys(LEGACY_WARDROBE_REPLACEMENTS));
    for (const slot of WARDROBE_SLOTS) {
      const selectable = selectableWardrobeItemsBySlot(slot);
      expect(selectable.length).toBeGreaterThan(0);
      for (const item of selectable) {
        expect(item.catalogStatus).toBe("selectable");
        expect(legacyIds.has(item.id), item.id).toBe(false);
      }
    }

    expect(SELECTABLE_WARDROBE_SETS).toHaveLength(WARDROBE_SETS.length);
    for (const set of SELECTABLE_WARDROBE_SETS) {
      expect(selectableWardrobeSetById(set.id)).toEqual(set);
      for (const pick of Object.values(set.equips)) {
        expect(legacyIds.has(pick.itemId), `${set.id}.${pick.itemId}`).toBe(
          false,
        );
      }
    }
  });
});

describe("베이크드 의상 자동 숨김", () => {
  const meshes = [
    { key: "shirt-mesh", slot: "tops" as const },
    { key: "coat-mesh", slot: "outer" as const },
    { key: "pants-mesh", slot: "bottoms" as const },
    { key: "dress-mesh", slot: "onepiece" as const },
    { key: "shoes-mesh", slot: "shoes" as const },
    { key: "accessory-mesh", slot: "accessory" as const },
  ];

  it("복원된 워드로브와 겹치는 원본 의상만 숨긴다", () => {
    const wardrobe = applyWardrobeSet(WARDROBE_SETS.find((set) => set.id === "doctor")!);
    const result = mergeWardrobeCostumeVisibility(
      { hidden: ["manual-hidden"], recolor: { "shirt-mesh": "#123456" } },
      wardrobe,
      meshes,
      true,
    );

    expect(result.hidden).toEqual(expect.arrayContaining([
      "manual-hidden",
      "shirt-mesh",
      "coat-mesh",
      "pants-mesh",
      "dress-mesh",
      "shoes-mesh",
    ]));
    expect(result.hidden).not.toContain("accessory-mesh");
    expect(result.recolor).toEqual({ "shirt-mesh": "#123456" });
  });

  it("자동 숨김을 끄면 사용자 상태만 복제해 반환한다", () => {
    const original = { hidden: ["manual-hidden"], recolor: { "shirt-mesh": "#123456" } };
    const result = mergeWardrobeCostumeVisibility(
      original,
      applyWardrobeSet(WARDROBE_SETS.find((set) => set.id === "doctor")!),
      meshes,
      false,
    );

    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    expect(result.hidden).not.toBe(original.hidden);
    expect(result.recolor).not.toBe(original.recolor);
  });

  it("빈 워드로브는 원본 의상 가시성을 바꾸지 않고 중복 숨김 키를 제거한다", () => {
    expect(mergeWardrobeCostumeVisibility(
      { hidden: ["shirt-mesh", "shirt-mesh"], recolor: {} },
      {},
      meshes,
      true,
    )).toEqual({ hidden: ["shirt-mesh"], recolor: {} });
  });

  it("equip→unequip 뒤에도 사용자가 직접 숨긴 원본 의상은 그대로 숨긴다", () => {
    const authored = { hidden: ["shirt-mesh"], recolor: {} };
    const equipped = { top: createWardrobeEquip("shirt")! };
    expect(mergeWardrobeCostumeVisibility(authored, equipped, meshes, true).hidden)
      .toContain("shirt-mesh");
    expect(mergeWardrobeCostumeVisibility(authored, {}, meshes, true).hidden)
      .toEqual(["shirt-mesh"]);
    expect(authored.hidden).toEqual(["shirt-mesh"]);
  });

  it("top과 bottom 중 하나를 해제해도 남은 슬롯이 onepiece 숨김 소유권을 유지한다", () => {
    const both: WardrobeState = {
      top: createWardrobeEquip("shirt")!,
      bottom: createWardrobeEquip("jeans")!,
    };
    const bottomOnly: WardrobeState = { bottom: both.bottom };
    expect(mergeWardrobeCostumeVisibility({ hidden: [], recolor: {} }, both, meshes, true).hidden)
      .toContain("dress-mesh");
    expect(mergeWardrobeCostumeVisibility({ hidden: [], recolor: {} }, bottomOnly, meshes, true).hidden)
      .toContain("dress-mesh");
  });

  it("세트 교체는 현재 전체 슬롯에서 다시 파생해 이전 자동 숨김을 남기지 않는다", () => {
    const full = applyWardrobeSet(WARDROBE_SETS.find((set) => set.id === "school")!);
    const shoesOnly: WardrobeState = { shoes: createWardrobeEquip("heels")! };
    expect(mergeWardrobeCostumeVisibility({ hidden: [], recolor: {} }, full, meshes, true).hidden)
      .toEqual(expect.arrayContaining(["shirt-mesh", "coat-mesh", "pants-mesh", "shoes-mesh"]));
    expect(mergeWardrobeCostumeVisibility({ hidden: [], recolor: {} }, shoesOnly, meshes, true).hidden)
      .toEqual(["shoes-mesh"]);
  });
});

describe("파츠 빌더", () => {
  const collectDims = (part: GarmentPart): number[] => {
    switch (part.shape.kind) {
      case "cylinder":
        return [part.shape.rTop, part.shape.rBottom, part.shape.h];
      case "lathe": {
        const ys = part.shape.profile.map((point) => point.y);
        return [
          ...part.shape.profile.map((point) => point.radius),
          Math.max(...ys) - Math.min(...ys),
        ];
      }
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
    const baseTorso = base.find((p) => p.bone === "spine" && p.shape.kind === "lathe");
    const looseTorso = loose.find((p) => p.bone === "spine" && p.shape.kind === "lathe");
    if (baseTorso?.shape.kind !== "lathe" || looseTorso?.shape.kind !== "lathe") {
      throw new Error("torso silhouette part missing");
    }
    expect(Math.max(...looseTorso.shape.profile.map((point) => point.radius)))
      .toBeGreaterThan(Math.max(...baseTorso.shape.profile.map((point) => point.radius)));
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
    if (bigTorso.shape.kind !== "lathe" || smallTorso.shape.kind !== "lathe") {
      throw new Error("unexpected torso shape");
    }
    expect(Math.max(...smallTorso.shape.profile.map((point) => point.radius)))
      .toBeLessThan(Math.max(...bigTorso.shape.profile.map((point) => point.radius)));
    const bigYs = bigTorso.shape.profile.map((point) => point.y);
    const smallYs = smallTorso.shape.profile.map((point) => point.y);
    expect(Math.max(...smallYs) - Math.min(...smallYs))
      .toBeLessThan(Math.max(...bigYs) - Math.min(...bigYs));
  });

  it("몸통과 스커트는 직선 원통 대신 곡선 실루엣 프로필을 만든다", () => {
    const blazerTorso = buildGarmentParts("blazer", FALLBACK_WARDROBE_METRICS)
      .find((part) => part.bone === "spine" && part.shape.kind === "lathe");
    const skirt = buildGarmentParts("pleated", FALLBACK_WARDROBE_METRICS)
      .find((part) => part.bone === "hips" && part.shape.kind === "lathe");
    if (blazerTorso?.shape.kind !== "lathe" || skirt?.shape.kind !== "lathe") {
      throw new Error("curved garment profiles missing");
    }

    expect(blazerTorso.shape.profile).toHaveLength(6);
    const torsoRadii = blazerTorso.shape.profile.map((point) => point.radius);
    expect(torsoRadii[2]).toBeLessThan(torsoRadii[0]);
    expect(torsoRadii[2]).toBeLessThan(torsoRadii[4]);
    expect(new Set(torsoRadii.map((radius) => radius.toFixed(6))).size).toBeGreaterThan(3);

    expect(skirt.shape.profile).toHaveLength(5);
    expect(skirt.shape.profile[0]!.radius).toBeGreaterThan(skirt.shape.profile.at(-1)!.radius);
    expect(skirt.shape.profile.every((point, index, points) => (
      index === 0 || point.y > points[index - 1]!.y
    ))).toBe(true);
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
  it("원피스와 하의는 신규 선택에서 상호 배타적으로 장착된다", () => {
    const pants = createWardrobeEquip("pants")!;
    const dress = applyWardrobeItemSelection({ bottom: pants }, "top", "dress");
    expect(dress.top?.itemId).toBe("dress");
    expect(dress.bottom).toBeUndefined();

    const nextPants = applyWardrobeItemSelection(dress, "bottom", "pants");
    expect(nextPants.top).toBeUndefined();
    expect(nextPants.bottom?.itemId).toBe("pants");
    expect(applyWardrobeItemSelection(nextPants, "top", null).bottom).toEqual(nextPants.bottom);
  });

  it("과거 저장·공유 문서의 원피스와 하의 중첩도 복원·직렬화 경계에서 제거한다", () => {
    const dress = createWardrobeEquip("dress")!;
    const pants = createWardrobeEquip("pants")!;
    const conflicting = { top: dress, bottom: pants } satisfies WardrobeState;

    expect(parseWardrobeDocument({
      version: VRM_WARDROBE_VERSION,
      slots: conflicting,
    }).slots).toEqual({ top: dress });
    expect(serializeWardrobe(conflicting)?.slots).toEqual({ top: dress });
  });

  it("정상 상태를 왕복 직렬화한다", () => {
    const state: WardrobeState = {
      outer: { itemId: "blazer", color: "#123456", fit: 1.2, fitMode: "manual", fabricId: "wool" },
      shoes: { itemId: "sneakers", color: "#ffffff", fit: 0.9, fitMode: "auto", fabricId: "jersey" },
    };
    const serialized = serializeWardrobe(state, { autoHideOriginal: false });
    expect(serialized?.version).toBe(VRM_WARDROBE_VERSION);
    expect(serialized?.options.autoHideOriginal).toBe(false);
    const parsed = parseWardrobe(serialized);
    expect(parsed).toEqual(state);
  });

  it("Wave 3 승격 의상 ID는 기존 저장 문서 복원과 렌더 호환을 유지한다", () => {
    const parsed = parseWardrobe({
      version: 1,
      slots: {
        outer: { itemId: "cardigan", color: "#112233", fit: 1.1 },
        top: { itemId: "tshirt", color: "#445566", fit: 1 },
        bottom: { itemId: "pants", color: "#778899", fit: 0.95 },
      },
    });

    expect(parsed).toEqual({
      outer: { itemId: "cardigan", color: "#112233", fit: 1.1, fitMode: "auto", fabricId: "knit" },
      top: { itemId: "tshirt", color: "#445566", fit: 1, fitMode: "auto", fabricId: "jersey" },
      bottom: { itemId: "pants", color: "#778899", fit: 0.95, fitMode: "auto", fabricId: "denim" },
    });
    expect(buildGarmentParts("cardigan", FALLBACK_WARDROBE_METRICS)).not.toEqual(
      [],
    );
    expect(serializeWardrobe(parsed)?.slots).toEqual(parsed);
  });

  it("빈 상태는 undefined로 직렬화된다(문서 하위호환)", () => {
    expect(serializeWardrobe({})).toBeUndefined();
  });

  it("v1 문서는 v2 기본 옵션·핏 방식·직물로 결정론적으로 마이그레이션한다", () => {
    const parsed = parseWardrobeDocument({
      version: 1,
      slots: { top: { itemId: "shirt", color: "#ABCDEF", fit: 1.05 } },
    });
    expect(parsed.sourceVersion).toBe(1);
    expect(parsed.supported).toBe(true);
    expect(parsed.options).toEqual(DEFAULT_WARDROBE_OPTIONS);
    expect(parsed.slots.top).toEqual({
      itemId: "shirt",
      color: "#abcdef",
      fit: 1.05,
      fitMode: "auto",
      fabricId: "cotton",
    });
  });

  it("빈 워드로브라도 auto-hide OFF는 v2 문서로 보존한다", () => {
    const serialized = serializeWardrobe({}, { autoHideOriginal: false });
    expect(serialized).toEqual({
      version: VRM_WARDROBE_VERSION,
      slots: {},
      options: { autoHideOriginal: false },
    });
    expect(parseWardrobeDocument(serialized).options.autoHideOriginal).toBe(false);
  });

  it("알 수 없는 미래 버전은 v1처럼 추측하지 않고 fail-closed 한다", () => {
    const parsed = parseWardrobeDocument({
      version: 999,
      slots: { top: { itemId: "shirt", color: "#ffffff", fit: 1 } },
    });
    expect(parsed.supported).toBe(false);
    expect(parsed.slots).toEqual({});
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
    expect(equip).toEqual({
      itemId: "heels",
      color: wardrobeItemById("heels")?.defaultColor,
      fit: 1,
      fitMode: "auto",
      fabricId: "leather",
    });
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

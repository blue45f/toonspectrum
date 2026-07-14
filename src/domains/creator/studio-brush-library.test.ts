import { describe, it, expect } from "vitest";

import {
  DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS,
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";
import {
  BRUSH_EXPORT_KIND,
  BRUSH_LIBRARY_KEY,
  BRUSH_LIBRARY_STORAGE_VERSION,
  BRUSH_OPACITY_RANGE,
  BRUSH_STROKE_WIDTH_RANGE,
  brushFileName,
  brushMatchesSnapshot,
  createBrush,
  deleteBrush,
  deleteBrushWithRecord,
  duplicateBrush,
  duplicateBrushName,
  importBrushFromJson,
  listBrushes,
  markBrushUsed,
  markBrushUsedWithResult,
  MAX_BRUSHES,
  readBrushLibrary,
  renameBrush,
  restoreDeletedBrush,
  sanitizeBrushSnapshot,
  saveBrush,
  saveBrushWithResult,
  selectQuickBrushes,
  sortBrushesForLibrary,
  toggleBrushPinned,
  writeBrushJson,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";

// 인메모리 가짜 저장소 (studio-palette-library.test.ts와 동일 패턴)
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    _map: map,
  };
}

const validSnapshot: StudioBrushSnapshot = {
  brushId: "gpen",
  strokeWidth: 12,
  brushOpacity: 0.8,
  color: "#ff0000",
  stabilizer: 4,
  stabilizerMode: "precision",
  postCorrection: 7,
  preserveCorners: true,
  pressureCurve: 1.8,
  useVelocityPressure: true,
  velocitySensitivity: 0.5,
  tiltEnabled: true,
  tipAngle: -35,
  tipRoundness: 0.3,
  brushDynamics: normalizeStudioBrushDynamicsSettings({
    ...studioBrushDynamicsPresetSettings("dry-media"),
    seed: 492,
  }),
};

const brush = (id: string, createdAt = 1): StudioSavedBrush => ({
  id,
  name: `브러시 ${id}`,
  createdAt,
  updatedAt: createdAt,
  pinned: false,
  lastUsedAt: null,
  ...validSnapshot,
});

describe("sanitizeBrushSnapshot", () => {
  it("유효한 스냅샷은 그대로 통과시키고 adjustedFields는 비어있다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot(validSnapshot);
    expect(snapshot).toEqual(validSnapshot);
    expect(adjustedFields).toEqual([]);
  });

  it("객체가 아니면 전부 기본값으로 채우고 각 필드를 adjustedFields에 기록한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot(null);
    expect(snapshot.brushId).toBe("pen");
    expect(snapshot.color).toBe("#7c5cfc");
    expect(adjustedFields).toContain("brushId");
    expect(adjustedFields).toContain("color");
    expect(adjustedFields).toContain("useVelocityPressure");
    expect(adjustedFields).toContain("stabilizerMode");
    expect(adjustedFields).toContain("postCorrection");
    expect(adjustedFields).toContain("preserveCorners");
    expect(adjustedFields).toContain("tiltEnabled");
    expect(adjustedFields).toContain("tipAngle");
    expect(adjustedFields).toContain("tipRoundness");
    expect(adjustedFields).toContain("brushDynamics");
  });

  it("알 수 없는 brushId는 pen으로 대체한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({ ...validSnapshot, brushId: "not-a-real-brush" });
    expect(snapshot.brushId).toBe("pen");
    expect(adjustedFields).toEqual(["brushId"]);
  });

  it(`strokeWidth를 [${BRUSH_STROKE_WIDTH_RANGE[0]}, ${BRUSH_STROKE_WIDTH_RANGE[1]}] 범위로 clamp한다`, () => {
    const tooBig = sanitizeBrushSnapshot({ ...validSnapshot, strokeWidth: 999 });
    expect(tooBig.snapshot.strokeWidth).toBe(BRUSH_STROKE_WIDTH_RANGE[1]);
    expect(tooBig.adjustedFields).toEqual(["strokeWidth"]);

    const tooSmall = sanitizeBrushSnapshot({ ...validSnapshot, strokeWidth: -5 });
    expect(tooSmall.snapshot.strokeWidth).toBe(BRUSH_STROKE_WIDTH_RANGE[0]);
  });

  it(`brushOpacity를 [${BRUSH_OPACITY_RANGE[0]}, ${BRUSH_OPACITY_RANGE[1]}] 범위로 clamp한다`, () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({ ...validSnapshot, brushOpacity: 5 });
    expect(snapshot.brushOpacity).toBe(BRUSH_OPACITY_RANGE[1]);
    expect(adjustedFields).toEqual(["brushOpacity"]);
  });

  it("NaN/Infinity/문자열 숫자 필드는 기본값으로 대체한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({
      ...validSnapshot,
      strokeWidth: Number.NaN,
      stabilizer: Number.POSITIVE_INFINITY,
      pressureCurve: "1.0" as unknown as number,
    });
    expect(snapshot.strokeWidth).toBe(6);
    expect(snapshot.stabilizer).toBe(6);
    expect(snapshot.pressureCurve).toBe(1.0);
    expect(adjustedFields).toEqual(["strokeWidth", "stabilizer", "pressureCurve"]);
  });

  it("유효하지 않은 색은 기본 색으로 대체한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({ ...validSnapshot, color: "not-a-color" });
    expect(snapshot.color).toBe("#7c5cfc");
    expect(adjustedFields).toEqual(["color"]);
  });

  it("3자리 축약 헥스 색을 정규화한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({ ...validSnapshot, color: "#f00" });
    expect(snapshot.color).toBe("#ff0000");
    expect(adjustedFields).toEqual([]);
  });

  it("useVelocityPressure가 boolean이 아니면 기본값(true)으로 대체한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({ ...validSnapshot, useVelocityPressure: "yes" });
    expect(snapshot.useVelocityPressure).toBe(true);
    expect(adjustedFields).toEqual(["useVelocityPressure"]);
  });

  it("선 보정 모드·후보정·각점 보존을 정규화한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({
      ...validSnapshot,
      stabilizerMode: "unknown",
      postCorrection: 999,
      preserveCorners: "yes",
    });
    expect(snapshot.stabilizerMode).toBe("adaptive");
    expect(snapshot.postCorrection).toBe(10);
    expect(snapshot.preserveCorners).toBe(true);
    expect(adjustedFields).toEqual(["postCorrection", "stabilizerMode", "preserveCorners"]);
  });

  it("펜촉 틸트 설정을 타입과 안전 범위로 정규화한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({
      ...validSnapshot,
      tiltEnabled: "yes",
      tipAngle: 999,
      tipRoundness: 0,
    });
    expect(snapshot.tiltEnabled).toBe(true);
    expect(snapshot.tipAngle).toBe(180);
    expect(snapshot.tipRoundness).toBe(0.08);
    expect(adjustedFields).toEqual(["tipAngle", "tipRoundness", "tiltEnabled"]);
  });

  it("브러시 동역학을 렌더러 안전 범위와 완전한 JSON 구조로 정규화한다", () => {
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({
      ...validSnapshot,
      brushDynamics: {
        seed: -3,
        maxSpeed: Number.POSITIVE_INFINITY,
        spacingRatio: 999,
        width: {
          base: -100,
          mappings: [{ source: "pressure", amount: 9 }],
        },
      },
    });

    expect(snapshot.brushDynamics).toEqual(normalizeStudioBrushDynamicsSettings({
      seed: -3,
      maxSpeed: Number.POSITIVE_INFINITY,
      spacingRatio: 999,
      width: {
        base: -100,
        mappings: [{ source: "pressure", amount: 9 }],
      },
    }));
    expect(snapshot.brushDynamics.seed).toBe(0);
    expect(snapshot.brushDynamics.spacingRatio).toBe(16);
    expect(snapshot.brushDynamics.width.base).toBe(0.05);
    expect(snapshot.brushDynamics.width.mappings[0]?.amount).toBe(1);
    expect(adjustedFields).toEqual(["brushDynamics"]);
    expect(() => JSON.stringify(snapshot.brushDynamics)).not.toThrow();
  });

  it("키 순서가 달라도 이미 정규화된 동역학은 보정된 것으로 표시하지 않는다", () => {
    const reordered = {
      roundness: validSnapshot.brushDynamics.roundness,
      angle: validSnapshot.brushDynamics.angle,
      scatter: validSnapshot.brushDynamics.scatter,
      spacing: validSnapshot.brushDynamics.spacing,
      flow: validSnapshot.brushDynamics.flow,
      opacity: validSnapshot.brushDynamics.opacity,
      width: validSnapshot.brushDynamics.width,
      scatterRatio: validSnapshot.brushDynamics.scatterRatio,
      spacingRatio: validSnapshot.brushDynamics.spacingRatio,
      maxSpeed: validSnapshot.brushDynamics.maxSpeed,
      fallbackPressure: validSnapshot.brushDynamics.fallbackPressure,
      seed: validSnapshot.brushDynamics.seed,
      version: validSnapshot.brushDynamics.version,
    };
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot({ ...validSnapshot, brushDynamics: reordered });
    expect(snapshot.brushDynamics).toEqual(validSnapshot.brushDynamics);
    expect(adjustedFields).toEqual([]);
  });

  it("무관한 필드에 순환 참조가 있어도 던지거나 멈추지 않는다(필드별 단순 읽기만 하므로 재귀 순회 없음)", () => {
    const circular: Record<string, unknown> = { ...validSnapshot };
    circular.selfRef = circular;
    expect(() => sanitizeBrushSnapshot(circular)).not.toThrow();
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot(circular);
    expect(snapshot).toEqual(validSnapshot);
    expect(adjustedFields).toEqual([]);
  });
});

describe("createBrush", () => {
  it("이름과 스냅샷으로 저장 레코드를 만든다", () => {
    const b = createBrush("내 펜", validSnapshot);
    expect(b.name).toBe("내 펜");
    expect(b.brushId).toBe("gpen");
    expect(b.strokeWidth).toBe(12);
    expect(typeof b.id).toBe("string");
    expect(b.createdAt).toBe(b.updatedAt);
    expect(b.pinned).toBe(false);
    expect(b.lastUsedAt).toBe(b.createdAt);
  });

  it("빈 이름은 DEFAULT_BRUSH_NAME으로 대체한다", () => {
    const b = createBrush("   ", validSnapshot);
    expect(b.name).toBe("이름 없는 브러시");
  });

  it("범위를 벗어난 스냅샷도 clamp해 절대 던지지 않는다", () => {
    const b = createBrush("망가진 값", { ...validSnapshot, strokeWidth: -100, brushOpacity: 100 });
    expect(b.strokeWidth).toBe(BRUSH_STROKE_WIDTH_RANGE[0]);
    expect(b.brushOpacity).toBe(BRUSH_OPACITY_RANGE[1]);
  });
});

describe("listBrushes", () => {
  it("저장소 없으면 빈 배열", () => {
    expect(listBrushes(null)).toEqual([]);
    expect(listBrushes(undefined)).toEqual([]);
  });

  it("빈/깨진 JSON은 빈 배열", () => {
    expect(listBrushes(fakeStorage())).toEqual([]);
    expect(listBrushes(fakeStorage({ [BRUSH_LIBRARY_KEY]: "{not json" }))).toEqual([]);
    expect(listBrushes(fakeStorage({ [BRUSH_LIBRARY_KEY]: '{"a":1}' }))).toEqual([]); // 배열 아님
  });

  it("형식이 맞는 브러시만 통과시킨다", () => {
    const s = fakeStorage({
      [BRUSH_LIBRARY_KEY]: JSON.stringify([brush("a"), { id: "x" }, brush("b")]),
    });
    expect(listBrushes(s).map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("이전 저장 브러시에 펜촉 필드가 없어도 안전 기본값으로 마이그레이션한다", () => {
    const legacy = brush("legacy") as Partial<StudioSavedBrush>;
    delete legacy.tiltEnabled;
    delete legacy.tipAngle;
    delete legacy.tipRoundness;
    const s = fakeStorage({ [BRUSH_LIBRARY_KEY]: JSON.stringify([legacy]) });
    expect(listBrushes(s)[0]).toMatchObject({
      id: "legacy",
      tiltEnabled: true,
      tipAngle: -30,
      tipRoundness: 0.24,
    });
  });

  it("이전 저장 브러시에 동역학 필드가 없어도 기본 동역학으로 마이그레이션한다", () => {
    const legacy = brush("legacy-dynamics") as Partial<StudioSavedBrush>;
    delete legacy.brushDynamics;
    const s = fakeStorage({ [BRUSH_LIBRARY_KEY]: JSON.stringify([legacy]) });
    expect(listBrushes(s)[0]?.brushDynamics).toEqual(DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS);
  });

  it("v2 저장 브러시에 새 선 보정 필드가 없어도 안전 기본값으로 마이그레이션한다", () => {
    const legacy = brush("legacy-v2") as Partial<StudioSavedBrush>;
    delete legacy.stabilizerMode;
    delete legacy.postCorrection;
    delete legacy.preserveCorners;
    const s = fakeStorage({ [BRUSH_LIBRARY_KEY]: JSON.stringify([legacy]) });
    expect(listBrushes(s)[0]).toMatchObject({
      id: "legacy-v2",
      stabilizerMode: "adaptive",
      postCorrection: 4,
      preserveCorners: true,
    });
  });

  it("v1~v3 저장 브러시에 선반 메타데이터가 없어도 고정 해제·미사용으로 마이그레이션한다", () => {
    const legacy = brush("legacy-meta") as Partial<StudioSavedBrush>;
    delete legacy.pinned;
    delete legacy.lastUsedAt;
    const s = fakeStorage({ [BRUSH_LIBRARY_KEY]: JSON.stringify([legacy]) });
    expect(listBrushes(s)[0]).toMatchObject({ pinned: false, lastUsedAt: null });
  });

  it("유효하지 않은 선반 메타데이터는 안전한 기본값으로 정규화한다", () => {
    const raw = { ...brush("bad-meta"), pinned: "yes", lastUsedAt: Number.POSITIVE_INFINITY };
    const s = fakeStorage({ [BRUSH_LIBRARY_KEY]: JSON.stringify([raw]) });
    expect(listBrushes(s)[0]).toMatchObject({ pinned: false, lastUsedAt: null });
  });
});

describe("readBrushLibrary", () => {
  it("버전 envelope와 레거시 배열 저장 형식을 모두 읽는다", () => {
    const envelope = fakeStorage({
      [BRUSH_LIBRARY_KEY]: JSON.stringify({
        version: BRUSH_LIBRARY_STORAGE_VERSION,
        brushes: [brush("envelope")],
      }),
    });
    const legacy = fakeStorage({
      [BRUSH_LIBRARY_KEY]: JSON.stringify([brush("legacy")]),
    });

    expect(readBrushLibrary(envelope)).toMatchObject({
      status: "ok",
      brushes: [{ id: "envelope" }],
    });
    expect(readBrushLibrary(legacy)).toMatchObject({
      status: "ok",
      brushes: [{ id: "legacy" }],
    });
  });

  it.each([
    {
      name: "깨진 JSON",
      raw: "{not json",
      expectedReadStatus: "corrupt",
      expectedBrushIds: [],
    },
    {
      name: "brushes가 배열이 아닌 envelope",
      raw: JSON.stringify({ version: BRUSH_LIBRARY_STORAGE_VERSION, brushes: { id: "not-an-array" } }),
      expectedReadStatus: "corrupt",
      expectedBrushIds: [],
    },
    {
      name: "미지원 미래 버전",
      raw: JSON.stringify({ version: BRUSH_LIBRARY_STORAGE_VERSION + 1, brushes: [] }),
      expectedReadStatus: "unsupported-version",
      expectedBrushIds: [],
    },
    {
      name: "일부 레코드가 손상된 배열",
      raw: JSON.stringify([brush("valid"), { id: "invalid" }]),
      expectedReadStatus: "corrupt",
      expectedBrushIds: ["valid"],
    },
  ])("$name을 읽은 mutation은 기존 데이터를 덮어쓰지 않는다", ({ raw, expectedReadStatus, expectedBrushIds }) => {
    let setItemCalls = 0;
    const storage = {
      getItem: () => raw,
      setItem: () => {
        setItemCalls += 1;
      },
    };

    const read = readBrushLibrary(storage);
    expect(read.status).toBe(expectedReadStatus);
    expect(read.brushes.map((item) => item.id)).toEqual(expectedBrushIds);

    const result = saveBrushWithResult(storage, brush("new"));
    expect(result.status).toBe("library-unreadable");
    expect(result.brushes.map((item) => item.id)).toEqual(expectedBrushIds);
    expect(setItemCalls).toBe(0);
  });

  it("getItem이 던지면 mutation은 setItem을 호출하지 않고 library-unreadable을 반환한다", () => {
    let setItemCalls = 0;
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        setItemCalls += 1;
      },
    };

    expect(readBrushLibrary(storage)).toEqual({ brushes: [], status: "read-error" });
    expect(saveBrushWithResult(storage, brush("new"))).toEqual({
      brushes: [],
      status: "library-unreadable",
    });
    expect(setItemCalls).toBe(0);
  });
});

describe("saveBrush", () => {
  it("맨 앞에 추가한다", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    const next = saveBrush(s, brush("b"));
    expect(next.map((b) => b.id)).toEqual(["b", "a"]);
  });

  it("같은 id는 교체하며 맨 앞으로", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a", 1));
    saveBrush(s, brush("b", 1));
    const next = saveBrush(s, brush("a", 2));
    expect(next.map((b) => b.id)).toEqual(["a", "b"]);
    expect(next[0].createdAt).toBe(2);
  });

  it(`최대 ${MAX_BRUSHES}개에서 새 항목을 거부하고 기존 항목을 자동 삭제하지 않는다`, () => {
    const s = fakeStorage();
    let result: StudioSavedBrush[] = [];
    for (let i = 0; i < MAX_BRUSHES; i++) result = saveBrush(s, brush(`b${i}`, i));
    const overflow = saveBrushWithResult(s, brush("overflow", 999));
    expect(overflow.status).toBe("full");
    expect(overflow.brushes.map((item) => item.id)).not.toContain("overflow");
    expect(result).toHaveLength(MAX_BRUSHES);
    expect(result.map((item) => item.id)).toContain("b0");
    expect(listBrushes(s)).toHaveLength(MAX_BRUSHES);
  });

  it(`최대 ${MAX_BRUSHES}개여도 같은 id 갱신은 허용한다`, () => {
    const s = fakeStorage();
    for (let i = 0; i < MAX_BRUSHES; i++) saveBrush(s, brush(`b${i}`, i));
    const updated = { ...brush("b0", 999), name: "갱신됨" };
    const result = saveBrushWithResult(s, updated);
    expect(result.status).toBe("saved");
    expect(result.brushes).toHaveLength(MAX_BRUSHES);
    expect(result.brushes[0]).toMatchObject({ id: "b0", name: "갱신됨" });
  });

  it("저장소 쓰기가 실패하면 성공으로 가장하지 않고 원본 목록을 유지한다", () => {
    const s = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    const result = saveBrushWithResult(s, brush("a"));
    expect(result).toEqual({ brushes: [], status: "storage-error" });
  });

  it("저장소에 영속된다", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    expect(listBrushes(s).map((b) => b.id)).toEqual(["a"]);
  });
});

describe("renameBrush", () => {
  it("배열 순서를 유지하며 updatedAt을 갱신한다", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a", 1));
    saveBrush(s, brush("b", 2));
    const before = listBrushes(s).find((b) => b.id === "b")!.updatedAt;
    const next = renameBrush(s, "b", "새 이름");
    expect(next.map((b) => b.id)).toEqual(["b", "a"]); // 순서 유지(맨 앞으로 옮기지 않음)
    const renamed = next.find((b) => b.id === "b")!;
    expect(renamed.name).toBe("새 이름");
    expect(renamed.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("빈 이름은 무시한다(원본 목록 그대로)", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    const next = renameBrush(s, "a", "   ");
    expect(next.find((b) => b.id === "a")!.name).toBe("브러시 a");
  });

  it("없는 id는 무시한다", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    const next = renameBrush(s, "zzz", "새 이름");
    expect(next.map((b) => b.id)).toEqual(["a"]);
  });
});

describe("deleteBrush", () => {
  it("id로 삭제", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    saveBrush(s, brush("b"));
    const next = deleteBrush(s, "a");
    expect(next.map((b) => b.id)).toEqual(["b"]);
    expect(listBrushes(s).map((b) => b.id)).toEqual(["b"]);
  });

  it("없는 id는 그대로", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    expect(deleteBrush(s, "zzz").map((b) => b.id)).toEqual(["a"]);
  });
});

describe("빠른 선반·복제·삭제 취소", () => {
  it("고정 브러시를 먼저, 나머지는 최근 사용순으로 최대 8개 반환하며 입력을 바꾸지 않는다", () => {
    const source = Array.from({ length: 10 }, (_, index) => ({
      ...brush(`b${index}`, index),
      pinned: index === 1 || index === 4,
      lastUsedAt: index === 9 ? null : index * 10,
    }));
    const before = source.map((item) => item.id);
    const quick = selectQuickBrushes(source);
    expect(quick).toHaveLength(8);
    expect(quick.slice(0, 2).map((item) => item.id)).toEqual(["b4", "b1"]);
    expect(quick[2].id).toBe("b8");
    expect(quick.map((item) => item.id)).not.toContain("b9");
    expect(source.map((item) => item.id)).toEqual(before);
  });

  it("고정 토글과 최근 적용 시각 기록을 저장한다", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    const pinned = toggleBrushPinned(s, "a");
    expect(pinned[0].pinned).toBe(true);
    const used = markBrushUsed(s, "a", 1234);
    expect(used[0].lastUsedAt).toBe(1234);
    expect(listBrushes(s)[0]).toMatchObject({ pinned: true, lastUsedAt: 1234 });
  });

  it("최근 사용 시각 저장이 실패하면 storage-error와 영속된 원본을 명시적으로 반환한다", () => {
    const original = brush("a");
    const storage = {
      getItem: () => JSON.stringify({
        version: BRUSH_LIBRARY_STORAGE_VERSION,
        brushes: [original],
      }),
      setItem: () => {
        throw new Error("quota");
      },
    };

    const result = markBrushUsedWithResult(storage, "a", 1234);
    expect(result.status).toBe("storage-error");
    expect(result.brushes).toEqual([original]);
    expect(result.brushes[0].lastUsedAt).toBeNull();
  });

  it("복제 이름은 충돌을 건너뛰고 기존 숫자 접미사도 정규화한다", () => {
    expect(duplicateBrushName("먹펜", ["먹펜", "먹펜 2", "먹펜 3"])).toBe("먹펜 4");
    expect(duplicateBrushName("먹펜 2", ["먹펜", "먹펜 2"])).toBe("먹펜 3");
  });

  it("원본 바로 다음에 독립 브러시를 복제하고 고정·최근 메타데이터는 초기화한다", () => {
    const s = fakeStorage();
    saveBrush(s, { ...brush("a"), pinned: true, lastUsedAt: 100 });
    saveBrush(s, brush("b"));
    const result = duplicateBrush(s, "a");
    expect(result.status).toBe("duplicated");
    expect(result.brush).toMatchObject({ name: "브러시 a 2", pinned: false, lastUsedAt: null });
    expect(result.brush?.id).not.toBe("a");
    expect(result.brushes.map((item) => item.id)).toEqual(["b", "a", result.brush?.id]);
  });

  it("40개에서 복제를 거부하고 모든 원본을 유지한다", () => {
    const s = fakeStorage();
    for (let index = 0; index < MAX_BRUSHES; index++) saveBrush(s, brush(`b${index}`));
    const result = duplicateBrush(s, "b0");
    expect(result.status).toBe("full");
    expect(result.brushes).toHaveLength(MAX_BRUSHES);
  });

  it("삭제 receipt로 동일 id와 원래 위치를 복원한다", () => {
    const s = fakeStorage();
    saveBrush(s, brush("a"));
    saveBrush(s, brush("b"));
    saveBrush(s, brush("c"));
    const removed = deleteBrushWithRecord(s, "b");
    expect(removed.status).toBe("deleted");
    expect(removed.deleted).toMatchObject({ brush: { id: "b" }, index: 1 });
    const restored = restoreDeletedBrush(s, removed.deleted!);
    expect(restored.status).toBe("restored");
    expect(restored.brushes.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("전체 목록도 고정과 최근 사용순으로 안정 정렬한다", () => {
    const ordered = sortBrushesForLibrary([
      { ...brush("old", 1), lastUsedAt: 10 },
      { ...brush("pinned", 2), pinned: true, lastUsedAt: 2 },
      { ...brush("recent", 3), lastUsedAt: 30 },
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["pinned", "recent", "old"]);
  });

  it("현재 스냅샷과 모든 물리 속성이 같을 때만 활성 브러시로 판별한다", () => {
    const saved = brush("match");
    expect(brushMatchesSnapshot(saved, validSnapshot)).toBe(true);
    expect(brushMatchesSnapshot(saved, { ...validSnapshot, strokeWidth: 13 })).toBe(false);
    expect(brushMatchesSnapshot(saved, {
      ...validSnapshot,
      brushDynamics: { width: validSnapshot.brushDynamics.width } as StudioBrushSnapshot["brushDynamics"],
    })).toBe(false);
    expect(brushMatchesSnapshot(saved, {
      ...validSnapshot,
      brushDynamics: normalizeStudioBrushDynamicsSettings({ ...validSnapshot.brushDynamics, version: 999 }),
    })).toBe(true);
    expect(brushMatchesSnapshot(saved, {
      ...validSnapshot,
      brushDynamics: normalizeStudioBrushDynamicsSettings({ ...validSnapshot.brushDynamics, seed: 493 }),
    })).toBe(false);
  });
});

describe("writeBrushJson / importBrushFromJson 왕복", () => {
  it("kind 필드를 포함한 JSON을 만든다", () => {
    const out = writeBrushJson(brush("a"));
    const parsed = JSON.parse(out);
    expect(parsed.kind).toBe(BRUSH_EXPORT_KIND);
    expect(parsed.name).toBe("브러시 a");
    expect(parsed.brushId).toBe("gpen");
    expect(parsed.stabilizerMode).toBe("precision");
    expect(parsed.postCorrection).toBe(7);
    expect(parsed.preserveCorners).toBe(true);
    expect(parsed.tiltEnabled).toBe(true);
    expect(parsed.tipAngle).toBe(-35);
    expect(parsed.tipRoundness).toBe(0.3);
    expect(parsed.brushDynamics).toEqual(validSnapshot.brushDynamics);
    expect(parsed).not.toHaveProperty("pinned");
    expect(parsed).not.toHaveProperty("lastUsedAt");
  });

  it("왕복하면 같은 스냅샷을 얻는다(adjustedFields 없음)", () => {
    const original = brush("a");
    const out = writeBrushJson(original);
    const { brush: imported, adjustedFields } = importBrushFromJson(out);
    expect(imported.name).toBe(original.name);
    expect(imported.brushId).toBe(original.brushId);
    expect(imported.strokeWidth).toBe(original.strokeWidth);
    expect(imported.color).toBe(original.color);
    expect(imported.brushDynamics).toEqual(original.brushDynamics);
    expect(imported).toMatchObject({ pinned: false, lastUsedAt: null });
    expect(adjustedFields).toEqual([]);
    expect(imported.id).not.toBe(original.id); // 가져오기는 새 id를 발급한다(같은 id 충돌 방지)
  });

  it("v1~v3 내보내기처럼 brushDynamics가 없어도 기본값으로 가져온다", () => {
    const legacy = JSON.parse(writeBrushJson(brush("legacy-export")));
    legacy.version = 3;
    delete legacy.brushDynamics;
    const { brush: imported, adjustedFields } = importBrushFromJson(JSON.stringify(legacy));
    expect(imported.brushDynamics).toEqual(DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS);
    expect(adjustedFields).toContain("brushDynamics");
  });

  it("kind가 없거나 다르면 던진다", () => {
    expect(() => importBrushFromJson("{}")).toThrow();
    expect(() => importBrushFromJson(JSON.stringify({ kind: "something-else" }))).toThrow();
  });

  it("빈 문자열/공백은 던진다", () => {
    expect(() => importBrushFromJson("")).toThrow();
    expect(() => importBrushFromJson("   ")).toThrow();
  });

  it("깨진 JSON은 던진다", () => {
    expect(() => importBrushFromJson("{not json")).toThrow();
  });

  it("kind는 맞지만 필드가 깨졌으면 기본값으로 보정하고 adjustedFields로 알린다", () => {
    const { brush: imported, adjustedFields } = importBrushFromJson(
      JSON.stringify({ kind: BRUSH_EXPORT_KIND, name: "깨진 파일", strokeWidth: 9999, color: "invalid" })
    );
    expect(imported.name).toBe("깨진 파일");
    expect(imported.strokeWidth).toBe(BRUSH_STROKE_WIDTH_RANGE[1]);
    expect(imported.color).toBe("#7c5cfc");
    expect(adjustedFields).toEqual(expect.arrayContaining(["strokeWidth", "color"]));
  });

  it("이름이 없으면 fallbackName을, 그것도 없으면 DEFAULT_BRUSH_NAME을 쓴다", () => {
    const withFallback = importBrushFromJson(JSON.stringify({ kind: BRUSH_EXPORT_KIND }), "내파일");
    expect(withFallback.brush.name).toBe("내파일");

    const withoutFallback = importBrushFromJson(JSON.stringify({ kind: BRUSH_EXPORT_KIND }));
    expect(withoutFallback.brush.name).toBe("이름 없는 브러시");
  });
});

describe("brushFileName", () => {
  it("파일시스템 금지 문자를 제거한다", () => {
    expect(brushFileName({ name: 'a/b\\c:d*e?f"g<h>i|j' })).toBe("abcdefghij.json");
  });

  it("한글과 공백은 그대로 유지한다", () => {
    expect(brushFileName({ name: "내 지스펜" })).toBe("내 지스펜.json");
  });

  it("정제 후 이름이 비면 brush.json으로 대체한다", () => {
    expect(brushFileName({ name: "///" })).toBe("brush.json");
    expect(brushFileName({ name: "   " })).toBe("brush.json");
  });
});

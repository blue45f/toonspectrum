import { describe, it, expect } from "vitest";

import {
  BRUSH_EXPORT_KIND,
  BRUSH_LIBRARY_KEY,
  BRUSH_OPACITY_RANGE,
  BRUSH_STROKE_WIDTH_RANGE,
  brushFileName,
  createBrush,
  deleteBrush,
  importBrushFromJson,
  listBrushes,
  MAX_BRUSHES,
  renameBrush,
  sanitizeBrushSnapshot,
  saveBrush,
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
};

const brush = (id: string, createdAt = 1): StudioSavedBrush => ({
  id,
  name: `브러시 ${id}`,
  createdAt,
  updatedAt: createdAt,
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

  it(`최대 ${MAX_BRUSHES}개로 제한`, () => {
    const s = fakeStorage();
    let result: StudioSavedBrush[] = [];
    for (let i = 0; i < MAX_BRUSHES + 5; i++) result = saveBrush(s, brush(`b${i}`, i));
    expect(result).toHaveLength(MAX_BRUSHES);
    expect(result[0].id).toBe(`b${MAX_BRUSHES + 4}`);
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
  });

  it("왕복하면 같은 스냅샷을 얻는다(adjustedFields 없음)", () => {
    const original = brush("a");
    const out = writeBrushJson(original);
    const { brush: imported, adjustedFields } = importBrushFromJson(out);
    expect(imported.name).toBe(original.name);
    expect(imported.brushId).toBe(original.brushId);
    expect(imported.strokeWidth).toBe(original.strokeWidth);
    expect(imported.color).toBe(original.color);
    expect(adjustedFields).toEqual([]);
    expect(imported.id).not.toBe(original.id); // 가져오기는 새 id를 발급한다(같은 id 충돌 방지)
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

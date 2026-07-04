import { describe, expect, it } from "vitest";

import {
  BUBBLE_CUSTOM_SHAPE_MIN_POINTS,
  bubbleShapeCanvasPointToLocal,
  bubbleShapeLocalPointToCanvas,
  bubbleShapePointHandles,
  computeBubbleShapeGeometry,
  computeCustomShapePointsForBubble,
  hasCustomBubbleShape,
  normalizeCustomShapePoints,
  polygonPointsToPathData,
  sampleBubbleOutlineToPolygon,
} from "./studio-bubble-custom-shape";

describe("computeBubbleShapeGeometry", () => {
  it("classic 테마 반지름 18, tail=none 이면 tailSpec null", () => {
    const g = computeBubbleShapeGeometry({ width: 200, height: 120, theme: "classic", tail: "none" });
    expect(g.radius).toBe(18);
    expect(g.tailSpec).toBeNull();
    expect(g.extraTails).toEqual([]);
  });

  it("soft 테마 반지름 24, vivid 테마 반지름은 min(w,h)/2", () => {
    const soft = computeBubbleShapeGeometry({ width: 200, height: 120, theme: "soft" });
    expect(soft.radius).toBe(24);
    const vivid = computeBubbleShapeGeometry({ width: 200, height: 120, theme: "vivid" });
    expect(vivid.radius).toBe(60);
  });

  it("tail이 있으면(기본 left/bottom) tailSpec을 만든다", () => {
    const g = computeBubbleShapeGeometry({ width: 200, height: 120, theme: "classic" });
    expect(g.tailSpec).not.toBeNull();
    expect(g.tailSpec?.direction).toBe("bottom");
  });

  it("같은 입력 → 같은 결과(결정적)", () => {
    const a = computeBubbleShapeGeometry({ width: 200, height: 120, theme: "classic", tailDirection: "left" });
    const b = computeBubbleShapeGeometry({ width: 200, height: 120, theme: "classic", tailDirection: "left" });
    expect(a).toEqual(b);
  });
});

describe("sampleBubbleOutlineToPolygon", () => {
  it("꼬리 없는 둥근사각형 — 폴리곤은 bbox [0,w]x[0,h] 안에 있고 닫혀있다(첫/끝점 중복 없음)", () => {
    const geo = computeBubbleShapeGeometry({ width: 200, height: 100, theme: "classic", tail: "none" });
    const pts = sampleBubbleOutlineToPolygon(200, 100, geo, 6);
    expect(pts.length % 2).toBe(0);
    expect(pts.length / 2).toBeGreaterThanOrEqual(BUBBLE_CUSTOM_SHAPE_MIN_POINTS);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]!);
      maxX = Math.max(maxX, pts[i]!);
      minY = Math.min(minY, pts[i + 1]!);
      maxY = Math.max(maxY, pts[i + 1]!);
    }
    expect(minX).toBeGreaterThanOrEqual(-0.5);
    expect(maxX).toBeLessThanOrEqual(200.5);
    expect(minY).toBeGreaterThanOrEqual(-0.5);
    expect(maxY).toBeLessThanOrEqual(100.5);
    // 첫 점과 마지막 점이 중복되지 않아야 한다(closed=true 로 렌더할 때 자동으로 이어짐).
    const fx = pts[0]!;
    const fy = pts[1]!;
    const lx = pts.at(-2)!;
    const ly = pts.at(-1)!;
    expect(Math.hypot(fx - lx, fy - ly)).toBeGreaterThan(1e-6);
  });

  it("모서리 아크 샘플 점이 실제 코너 중심에서 반지름만큼 떨어진 위치에 온다(우상단 코너)", () => {
    // w=200,h=100,r=20 → 우상단 코너 중심은 (w-r, r) = (180, 20). samplesPerCurve=6 이면
    // i=3(중간) 샘플은 -90°→0° 사이 중점인 -45° 위치: center + r*(cos-45, sin-45).
    const geo = { radius: 20, tailSpec: null, extraTails: [] };
    const pts = sampleBubbleOutlineToPolygon(200, 100, geo, 6);
    const cx = 180;
    const cy = 20;
    const r = 20;
    const found = [];
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i]! - cx, pts[i + 1]! - cy);
      if (Math.abs(d - r) < 0.05 && pts[i]! > cx && pts[i + 1]! < cy) found.push({ x: pts[i]!, y: pts[i + 1]! });
    }
    expect(found.length).toBeGreaterThan(0);
    const expectedX = cx + r * Math.cos(-Math.PI / 4);
    const expectedY = cy + r * Math.sin(-Math.PI / 4);
    const hit = found.find((p) => Math.abs(p.x - expectedX) < 0.5 && Math.abs(p.y - expectedY) < 0.5);
    expect(hit).toBeDefined();
  });

  it("아래쪽 꼬리가 있으면 일부 점이 본체 아래(y>h)로 뻗는다", () => {
    const geo = computeBubbleShapeGeometry({ width: 200, height: 100, theme: "classic", tailDirection: "bottom", tailHeight: 30 });
    const pts = sampleBubbleOutlineToPolygon(200, 100, geo, 6);
    const maxY = Math.max(...Array.from({ length: pts.length / 2 }, (_, i) => pts[i * 2 + 1]!));
    expect(maxY).toBeGreaterThan(100);
  });

  it("vivid 테마(반지름=min(w,h)/2)처럼 한 변의 직선 구간이 0으로 퇴화해도 정상 폴리곤을 만든다", () => {
    // width=100,height=60 → vivid radius=min(100,60)/2=30. 높이(60)가 반지름의 2배와 정확히
    // 같아서 좌/우변의 V 직선 구간 길이가 0이 된다(h-r === r) — 연속 중복점 제거 로직이 이
    // 퇴화 구간을 안전하게 무시하는지 확인한다(단순 아크 잇기, 점 소실/NaN 없음). vivid 테마는
    // radius 가 항상 min(w,h)/2 라 이 퇴화 케이스가 예외가 아니라 일상적으로 발생한다.
    const geo = computeBubbleShapeGeometry({ width: 100, height: 60, theme: "vivid", tail: "none" });
    expect(geo.radius).toBe(30);
    const pts = sampleBubbleOutlineToPolygon(100, 60, geo, 8);
    expect(pts.length % 2).toBe(0);
    expect(pts.every((v) => Number.isFinite(v))).toBe(true);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]!);
      maxX = Math.max(maxX, pts[i]!);
      minY = Math.min(minY, pts[i + 1]!);
      maxY = Math.max(maxY, pts[i + 1]!);
    }
    expect(minX).toBeGreaterThanOrEqual(-0.5);
    expect(maxX).toBeLessThanOrEqual(100.5);
    expect(minY).toBeGreaterThanOrEqual(-0.5);
    expect(maxY).toBeLessThanOrEqual(60.5);
  });

  it("다중 꼬리(extraTails)가 있으면 단일 꼬리보다 점이 더 많다", () => {
    const single = computeBubbleShapeGeometry({ width: 240, height: 140, theme: "classic", tailDirection: "bottom" });
    const singlePts = sampleBubbleOutlineToPolygon(240, 140, single, 6);
    const multi = computeBubbleShapeGeometry({
      width: 240,
      height: 140,
      theme: "classic",
      tailDirection: "bottom",
      extraTails: [{ direction: "bottom", ratio: 0.7, length: 20, base: 14, side: "center" }],
    });
    const multiPts = sampleBubbleOutlineToPolygon(240, 140, multi, 6);
    expect(multiPts.length).toBeGreaterThan(singlePts.length);
  });

  it("같은 입력이면 항상 같은 결과(결정적)", () => {
    const geo = computeBubbleShapeGeometry({ width: 180, height: 90, theme: "vivid", tailDirection: "left" });
    const a = sampleBubbleOutlineToPolygon(180, 90, geo, 6);
    const b = sampleBubbleOutlineToPolygon(180, 90, geo, 6);
    expect(a).toEqual(b);
  });

  it("극단적으로 작은 치수(0)에서도 던지지 않는다(퇴화 아크 방어)", () => {
    expect(() => sampleBubbleOutlineToPolygon(0, 0, { radius: 18, tailSpec: null, extraTails: [] }, 6)).not.toThrow();
  });

  it("computeCustomShapePointsForBubble 은 geometry+sampling 을 합성한 단일 진입점이다", () => {
    const direct = sampleBubbleOutlineToPolygon(
      200,
      120,
      computeBubbleShapeGeometry({ width: 200, height: 120, theme: "soft" }),
      6
    );
    const composed = computeCustomShapePointsForBubble({ width: 200, height: 120, theme: "soft" }, 6);
    expect(composed).toEqual(direct);
  });
});

describe("polygonPointsToPathData", () => {
  it("M으로 시작해 Z로 끝나고 L 개수는 점 개수-1", () => {
    const pts = [0, 0, 10, 0, 10, 10, 0, 10];
    const d = polygonPointsToPathData(pts);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d.match(/L /g)?.length).toBe(3);
  });

  it("점이 3개 미만(6칸 미만)이면 빈 문자열", () => {
    expect(polygonPointsToPathData([0, 0, 1, 1])).toBe("");
  });
});

describe("normalizeCustomShapePoints / hasCustomBubbleShape", () => {
  it("유효한 배열은 그대로 통과", () => {
    const raw = [0, 0, 10, 0, 10, 10];
    expect(normalizeCustomShapePoints(raw)).toEqual(raw);
  });

  it("배열이 아니거나 홀수 길이거나 점이 부족하면 undefined", () => {
    expect(normalizeCustomShapePoints(null)).toBeUndefined();
    expect(normalizeCustomShapePoints("nope")).toBeUndefined();
    expect(normalizeCustomShapePoints([0, 0, 1])).toBeUndefined(); // 홀수
    expect(normalizeCustomShapePoints([0, 0, 1, 1])).toBeUndefined(); // 점 2개(< 3)
  });

  it("숫자가 아니거나 비유한 값이 섞이면 undefined", () => {
    expect(normalizeCustomShapePoints([0, 0, 1, "x", 2, 2])).toBeUndefined();
    expect(normalizeCustomShapePoints([0, 0, 1, Infinity, 2, 2])).toBeUndefined();
  });

  it("hasCustomBubbleShape 가드", () => {
    expect(hasCustomBubbleShape(undefined)).toBe(false);
    expect(hasCustomBubbleShape([0, 0, 1])).toBe(false);
    expect(hasCustomBubbleShape([0, 0, 1, 1, 2, 2])).toBe(true);
  });
});

describe("bubbleShapePointHandles", () => {
  it("점마다 pointIndex 가 순차적인 핸들을 만든다", () => {
    const pts = [0, 0, 10, 0, 10, 10, 0, 10];
    const handles = bubbleShapePointHandles(pts);
    expect(handles).toEqual([
      { pointIndex: 0, x: 0, y: 0 },
      { pointIndex: 1, x: 10, y: 0 },
      { pointIndex: 2, x: 10, y: 10 },
      { pointIndex: 3, x: 0, y: 10 },
    ]);
  });
});

describe("bubbleShapeCanvasPointToLocal / bubbleShapeLocalPointToCanvas", () => {
  it("회전 없는 프레임 — 캔버스 좌표는 그냥 이동만 뺀 값", () => {
    const frame = { x: 50, y: 30 };
    const local = bubbleShapeCanvasPointToLocal(60, 40, frame);
    expect(local.x).toBeCloseTo(10);
    expect(local.y).toBeCloseTo(10);
  });

  it("정방향→역방향 왕복이 원래 캔버스 좌표로 돌아온다(회전 포함)", () => {
    const frame = { x: 20, y: 15, rotation: 37 };
    const canvasPt = { x: 123.4, y: 87.6 };
    const local = bubbleShapeCanvasPointToLocal(canvasPt.x, canvasPt.y, frame);
    const back = bubbleShapeLocalPointToCanvas(local, frame);
    expect(back.x).toBeCloseTo(canvasPt.x, 6);
    expect(back.y).toBeCloseTo(canvasPt.y, 6);
  });

  it.each([0, 90, 180, 270, 360, -45])(
    "축정렬 회전(%d°)에서도 왕복 변환이 원래 캔버스 좌표로 돌아온다",
    (rotation) => {
      // 37°처럼 임의각이 아니라 cos/sin 이 정확히 0/±1 이 되는 축정렬 각도 — 사용자가 회전을
      // shift 로 스냅하는 실사용과 겹치고, 삼각함수 특이값 근방에서의 부동소수 오차도 함께 검증한다.
      const frame = { x: 20, y: 15, rotation };
      const canvasPt = { x: 123.4, y: 87.6 };
      const local = bubbleShapeCanvasPointToLocal(canvasPt.x, canvasPt.y, frame);
      const back = bubbleShapeLocalPointToCanvas(local, frame);
      expect(back.x).toBeCloseTo(canvasPt.x, 6);
      expect(back.y).toBeCloseTo(canvasPt.y, 6);
    }
  );
});

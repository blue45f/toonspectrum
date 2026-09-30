import { describe, expect, it } from "vitest";

import {
  QUICK_SHAPE_DEFAULT_CONFIDENCE_THRESHOLD,
  QUICK_SHAPE_DEFAULT_HOLD_MS,
  classifyQuickShape,
  perfectifyQuickShape,
  quickShapeCenter,
  quickShapeGeometryToSvgPathData,
  snapAngleToStep,
  startQuickShapeHold,
  transformQuickShapeGeometry,
  updateQuickShapeHold,
  type QuickShapeGeometry,
  type QuickShapePoint,
} from "./quick-shape";

/* ---------------- 테스트용 스트로크 생성 ---------------- */

function straightStroke(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  n = 20,
): QuickShapePoint[] {
  const pts: QuickShapePoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return pts;
}

/** 결정적 지터(시드 고정)로 삐뚤빼뚤한 원을 만든다. */
function wobblyCircle(
  cx: number,
  cy: number,
  r: number,
  n = 48,
): QuickShapePoint[] {
  let seed = 1234567;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const pts: QuickShapePoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    const wobble = 1 + rand() * 0.12;
    pts.push({
      x: cx + Math.cos(angle) * r * wobble,
      y: cy + Math.sin(angle) * r * wobble,
    });
  }
  return pts;
}

function wobblyRect(
  x: number,
  y: number,
  w: number,
  h: number,
  n = 12,
): QuickShapePoint[] {
  const corners: QuickShapePoint[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ];
  const pts: QuickShapePoint[] = [];
  for (let i = 0; i < corners.length - 1; i += 1) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  pts.push({ ...corners[0]! });
  return pts;
}

function wobblyTriangle(n = 16): QuickShapePoint[] {
  const corners: QuickShapePoint[] = [
    { x: 50, y: 10 },
    { x: 90, y: 80 },
    { x: 10, y: 80 },
    { x: 50, y: 10 },
  ];
  const pts: QuickShapePoint[] = [];
  for (let i = 0; i < corners.length - 1; i += 1) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  pts.push({ ...corners[0]! });
  return pts;
}

function zigzag(): QuickShapePoint[] {
  const pts: QuickShapePoint[] = [];
  for (let i = 0; i < 20; i += 1) {
    pts.push({ x: i * 10, y: i % 2 === 0 ? 0 : 40 });
  }
  return pts;
}

/* ---------------- 분류 ---------------- */

describe("classifyQuickShape", () => {
  it("직선을 분류한다", () => {
    const result = classifyQuickShape(straightStroke(10, 10, 200, 30));
    expect(result.kind).toBe("line");
    expect(result.keepOriginal).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(
      QUICK_SHAPE_DEFAULT_CONFIDENCE_THRESHOLD,
    );
    expect(result.geometry.kind).toBe("line");
  });

  it("삐뚤빼뚤한 원을 타원으로 분류한다", () => {
    const result = classifyQuickShape(wobblyCircle(100, 100, 60));
    expect(result.kind).toBe("ellipse");
    expect(result.keepOriginal).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.5);
    if (result.geometry.kind === "ellipse") {
      // 삐뚤빼뚤한 입력이므로 bbox 반경은 어림값 — 15% 이내면 충분
      expect(Math.abs(result.geometry.rx - 60) / 60).toBeLessThan(0.15);
      expect(Math.abs(result.geometry.ry - 60) / 60).toBeLessThan(0.15);
    } else {
      throw new Error("타원 geometry 기대");
    }
  });

  it("사각형을 분류한다", () => {
    const result = classifyQuickShape(wobblyRect(20, 20, 120, 80));
    expect(result.kind).toBe("rectangle");
    expect(result.keepOriginal).toBe(false);
    if (result.geometry.kind === "rectangle") {
      expect(result.geometry.width).toBeCloseTo(120, 0);
      expect(result.geometry.height).toBeCloseTo(80, 0);
    } else {
      throw new Error("직사각형 geometry 기대");
    }
  });

  it("삼각형을 분류한다", () => {
    const result = classifyQuickShape(wobblyTriangle());
    expect(result.kind).toBe("triangle");
    expect(result.keepOriginal).toBe(false);
  });

  it("애매한 지그재그는 폴리라인 폴백 + 원본 유지", () => {
    const result = classifyQuickShape(zigzag());
    expect(result.kind).toBe("polyline");
    expect(result.keepOriginal).toBe(true);
    expect(result.geometry.kind).toBe("polyline");
  });

  it("점이 너무 적으면 원본 유지", () => {
    const result = classifyQuickShape([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(result.keepOriginal).toBe(true);
    expect(result.kind).toBe("polyline");
  });

  it("너무 작은 스트로크는 분류하지 않는다", () => {
    const result = classifyQuickShape(straightStroke(0, 0, 3, 2));
    expect(result.keepOriginal).toBe(true);
  });

  it("신뢰도 임계값을 올리면 애매한 도형은 원본 유지", () => {
    const ellipse = classifyQuickShape(wobblyCircle(100, 100, 60));
    const strict = classifyQuickShape(wobblyCircle(100, 100, 60), {
      confidenceThreshold: 0.999,
    });
    expect(ellipse.keepOriginal).toBe(false);
    expect(strict.kind).toBe(ellipse.kind);
    expect(strict.keepOriginal).toBe(true);
  });

  it("신뢰도는 0..1 범위", () => {
    for (const pts of [
      straightStroke(0, 0, 100, 5),
      wobblyCircle(50, 50, 30),
      wobblyRect(10, 10, 60, 60),
      zigzag(),
    ]) {
      const result = classifyQuickShape(pts);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

/* ---------------- 홀드 감지 ---------------- */

describe("홀드 감지", () => {
  it("임계값(기본 500ms) 전에는 holdReached=false", () => {
    const session = startQuickShapeHold({ x: 10, y: 20 }, 1000);
    const update = updateQuickShapeHold(session, 1000 + QUICK_SHAPE_DEFAULT_HOLD_MS - 1, {
      x: 10,
      y: 20,
      down: true,
    });
    expect(update.holdReached).toBe(false);
    expect(update.pointerLifted).toBe(false);
  });

  it("임계값에 도달하면 holdReached=true", () => {
    const session = startQuickShapeHold({ x: 10, y: 20 }, 1000);
    const update = updateQuickShapeHold(session, 1000 + QUICK_SHAPE_DEFAULT_HOLD_MS, {
      x: 12,
      y: 22,
      down: true,
    });
    expect(update.holdReached).toBe(true);
    expect(update.heldMs).toBe(QUICK_SHAPE_DEFAULT_HOLD_MS);
  });

  it("펜을 먼저 떼면 세션이 끝난다", () => {
    const session = startQuickShapeHold({ x: 10, y: 20 }, 1000);
    const update = updateQuickShapeHold(session, 2000, {
      x: 10,
      y: 20,
      down: false,
    });
    expect(update.pointerLifted).toBe(true);
    expect(update.holdReached).toBe(false);
  });

  it("홀드 중 움직임은 취소가 아니라 드래그 입력으로 누적된다", () => {
    const session = startQuickShapeHold({ x: 0, y: 0 }, 1000);
    const update = updateQuickShapeHold(session, 1600, {
      x: 30,
      y: 40,
      down: true,
    });
    expect(update.holdReached).toBe(true);
    expect(update.session.movedPx).toBeCloseTo(50, 6);
  });

  it("holdThresholdMs 옵션으로 임계값을 바꿀 수 있다", () => {
    const session = startQuickShapeHold({ x: 0, y: 0 }, 0);
    const quick = updateQuickShapeHold(
      session,
      200,
      { x: 0, y: 0, down: true },
      { holdThresholdMs: 150 },
    );
    expect(quick.holdReached).toBe(true);
  });
});

/* ---------------- 완벽 도형 ---------------- */

describe("perfectifyQuickShape", () => {
  it("타원 → 원 (장·단축 통일)", () => {
    const classified = classifyQuickShape(wobblyRect(20, 20, 140, 70));
    expect(classified.kind).toBe("rectangle");
    const ellipseLike: QuickShapeGeometry = {
      kind: "ellipse",
      cx: 50,
      cy: 50,
      rx: 60,
      ry: 40,
      rotationDeg: 0,
    };
    const perfect = perfectifyQuickShape({
      kind: "ellipse",
      confidence: 0.9,
      isPerfect: false,
      keepOriginal: false,
      geometry: ellipseLike,
    });
    expect(perfect.isPerfect).toBe(true);
    if (perfect.geometry.kind === "ellipse") {
      expect(perfect.geometry.rx).toBe(perfect.geometry.ry);
      expect(perfect.geometry.rx).toBe(60);
    } else {
      throw new Error("원 geometry 기대");
    }
  });

  it("직사각형 → 정사각형 (중심 유지)", () => {
    const classified = classifyQuickShape(wobblyRect(20, 20, 140, 70));
    const perfect = perfectifyQuickShape(classified);
    expect(perfect.isPerfect).toBe(true);
    if (perfect.geometry.kind === "rectangle") {
      expect(perfect.geometry.width).toBe(perfect.geometry.height);
      expect(perfect.geometry.width).toBeCloseTo(140, 6);
      expect(perfect.geometry.x + perfect.geometry.width / 2).toBeCloseTo(90, 6);
    } else {
      throw new Error("정사각형 geometry 기대");
    }
  });

  it("직선 → 15° 스냅", () => {
    // 약 10° 기울어진 직선
    const classified = classifyQuickShape(straightStroke(0, 0, 100, 17.6));
    expect(classified.kind).toBe("line");
    const perfect = perfectifyQuickShape(classified);
    if (perfect.geometry.kind === "line") {
      const angleDeg =
        (Math.atan2(
          perfect.geometry.y2 - perfect.geometry.y1,
          perfect.geometry.x2 - perfect.geometry.x1,
        ) *
          180) /
        Math.PI;
      expect(Math.abs(angleDeg - 15)).toBeLessThan(0.5);
    } else {
      throw new Error("직선 geometry 기대");
    }
  });

  it("삼각형 → 정삼각형 (세 변 동일)", () => {
    const classified = classifyQuickShape(wobblyTriangle());
    const perfect = perfectifyQuickShape(classified);
    expect(perfect.isPerfect).toBe(true);
    if (perfect.geometry.kind === "triangle") {
      const { p1, p2, p3 } = perfect.geometry;
      const a = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const b = Math.hypot(p2.x - p3.x, p2.y - p3.y);
      const c = Math.hypot(p3.x - p1.x, p3.y - p1.y);
      expect(a).toBeCloseTo(b, 4);
      expect(b).toBeCloseTo(c, 4);
    } else {
      throw new Error("정삼각형 geometry 기대");
    }
  });

  it("폴리라인은 그대로 둔다", () => {
    const classified = classifyQuickShape(zigzag());
    const perfect = perfectifyQuickShape(classified);
    expect(perfect.isPerfect).toBe(false);
    expect(perfect.geometry).toEqual(classified.geometry);
  });
});

describe("snapAngleToStep", () => {
  it("15° 단위로 스냅", () => {
    expect(snapAngleToStep(10)).toBe(15);
    expect(snapAngleToStep(7)).toBe(0);
    expect(snapAngleToStep(44)).toBe(45);
  });
});

/* ---------------- 스케일/회전 ---------------- */

describe("transformQuickShapeGeometry", () => {
  it("스케일 2배", () => {
    const geometry: QuickShapeGeometry = {
      kind: "rectangle",
      x: 0,
      y: 0,
      width: 40,
      height: 20,
    };
    const transformed = transformQuickShapeGeometry(geometry, { scale: 2 });
    expect(transformed.kind).toBe("rectangle");
    if (transformed.kind === "rectangle") {
      expect(transformed.width).toBe(80);
      expect(transformed.height).toBe(40);
      // 중심 유지
      expect(transformed.x + transformed.width / 2).toBe(20);
    }
  });

  it("회전 스냅: 47° → 45°", () => {
    const geometry: QuickShapeGeometry = {
      kind: "line",
      x1: -50,
      y1: 0,
      x2: 50,
      y2: 0,
    };
    const transformed = transformQuickShapeGeometry(geometry, {
      rotateDeg: 47,
      snapRotateDeg: 15,
    });
    if (transformed.kind === "line") {
      const angleDeg =
        (Math.atan2(
          transformed.y2 - transformed.y1,
          transformed.x2 - transformed.x1,
        ) *
          180) /
        Math.PI;
      expect(Math.abs(angleDeg - 45)).toBeLessThan(0.5);
    } else {
      throw new Error("직선 geometry 기대");
    }
  });

  it("변화 없으면 동일 참조 반환", () => {
    const geometry: QuickShapeGeometry = {
      kind: "line",
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 0,
    };
    expect(transformQuickShapeGeometry(geometry, {})).toBe(geometry);
  });
});

describe("quickShapeCenter", () => {
  it("각 도형의 중심을 구한다", () => {
    expect(
      quickShapeCenter({ kind: "line", x1: 0, y1: 0, x2: 10, y2: 20 }),
    ).toEqual({ x: 5, y: 10 });
    expect(
      quickShapeCenter({ kind: "rectangle", x: 10, y: 10, width: 20, height: 30 }),
    ).toEqual({ x: 20, y: 25 });
  });
});

/* ---------------- SVG 렌더링 ---------------- */

describe("quickShapeGeometryToSvgPathData", () => {
  it("직선", () => {
    expect(
      quickShapeGeometryToSvgPathData({ kind: "line", x1: 0, y1: 0, x2: 10, y2: 20 }),
    ).toBe("M0 0L10 20");
  });

  it("타원", () => {
    const d = quickShapeGeometryToSvgPathData({
      kind: "ellipse",
      cx: 50,
      cy: 50,
      rx: 30,
      ry: 20,
      rotationDeg: 0,
    });
    expect(d).toContain("A30 20");
    expect(d.endsWith("Z")).toBe(true);
  });

  it("직사각형", () => {
    expect(
      quickShapeGeometryToSvgPathData({ kind: "rectangle", x: 5, y: 5, width: 10, height: 8 }),
    ).toBe("M5 5L15 5L15 13L5 13Z");
  });

  it("삼각형", () => {
    expect(
      quickShapeGeometryToSvgPathData({
        kind: "triangle",
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        p3: { x: 5, y: 8 },
      }),
    ).toBe("M0 0L10 0L5 8Z");
  });

  it("폴리라인", () => {
    expect(
      quickShapeGeometryToSvgPathData({
        kind: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 10, y: 0 },
        ],
      }),
    ).toBe("M0 0L5 5L10 0");
  });
});

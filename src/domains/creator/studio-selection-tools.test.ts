import { describe, expect, it } from "vitest";

import {
  ELLIPSE_POLYGON_SEGMENTS,
  LASSO_MIN_POINT_DIST,
  MARCHING_ANTS_DASH,
  MIN_SELECTION_SUBPATH_AREA,
  SELECTION_BRIGHTNESS_RANGE,
  SELECTION_COMBINE_MODES,
  SELECTION_FEATHER_RANGE,
  SELECTION_HUE_RANGE,
  SELECTION_TOOLS,
  addSelectionSubpath,
  appendLassoPoint,
  applySelectionAdjustToCanvas,
  beginSelectionDrag,
  buildSelectionMaskPlan,
  canvasPointToNormalized,
  commitSelectionDrag,
  ellipseSelectionPolygon,
  emptyPixelSelection,
  isSelectionAdjustNoop,
  isSelectionUsable,
  marchingAntsDashOffset,
  marchingAntsPasses,
  normalizedPointToCanvas,
  paintSelectionMaskSteps,
  planSelectionAdjust,
  pointInPolygon,
  pointInSelection,
  polygonAreaNorm,
  rasterizeSelectionMask,
  rectSelectionPolygon,
  removeLastSubpath,
  selectionBoundsNorm,
  setSelectionFeather,
  simplifyLassoPolygon,
  subpathOutlinePoints,
  toggleSelectionInvert,
  updateSelectionDrag,
  type MaskCanvasLike,
  type MaskCtx2DLike,
  type MaskImageSource,
  type PixelSelection,
  type SelectionCanvasFactory,
  type SelectionMaskPlan,
  type SelPoint,
} from "./studio-selection-tools";

// ---------------------------------------------------------------------------
// 테스트 픽스처 — 가짜 ctx(호출 기록) + 가짜 캔버스 팩토리
// ---------------------------------------------------------------------------

type FakeCanvas = MaskCanvasLike & { id: number };

/** 호출을 문자열로 기록하는 가짜 2D 컨텍스트 — 실행 순서·합성 모드를 검증한다. */
function fakeCtx(log: string[], label: string): MaskCtx2DLike {
  let gco = "source-over";
  let filter = "none";
  return {
    set fillStyle(v: unknown) {
      log.push(`${label}:fillStyle=${String(v)}`);
    },
    get fillStyle(): unknown {
      return "#ffffff";
    },
    set globalCompositeOperation(v: string) {
      gco = v;
      log.push(`${label}:gco=${v}`);
    },
    get globalCompositeOperation(): string {
      return gco;
    },
    set filter(v: string) {
      filter = v;
      log.push(`${label}:filter=${v}`);
    },
    get filter(): string {
      return filter;
    },
    beginPath: () => log.push(`${label}:beginPath`),
    moveTo: (x, y) => log.push(`${label}:moveTo(${x},${y})`),
    lineTo: (x, y) => log.push(`${label}:lineTo(${x},${y})`),
    closePath: () => log.push(`${label}:closePath`),
    fill: (rule) => log.push(`${label}:fill(${rule ?? ""})`),
    fillRect: (x, y, w, h) => log.push(`${label}:fillRect(${x},${y},${w},${h})`),
    clearRect: (x, y, w, h) => log.push(`${label}:clearRect(${x},${y},${w},${h})`),
    drawImage: (image, dx, dy) => log.push(`${label}:drawImage(#${(image as FakeCanvas).id},${dx},${dy})`),
  };
}

/** 생성 순서대로 id 를 붙이는 가짜 팩토리 — n 번째 생성부터 실패시킬 수도 있다. */
function fakeFactory(log: string[], failAt = Infinity): SelectionCanvasFactory {
  let count = 0;
  return (width, height) => {
    count += 1;
    if (count >= failAt) return null;
    const canvas: FakeCanvas = { id: count, width, height };
    log.push(`create#${count}(${width}x${height})`);
    return { canvas, ctx: fakeCtx(log, `c${count}`) };
  };
}

/** 단위 사각형 절반(왼쪽) 선택 — 여러 테스트의 기본 픽스처. */
function leftHalfSelection(over: Partial<PixelSelection> = {}): PixelSelection {
  return {
    subpaths: [
      {
        mode: "add",
        points: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0 },
          { x: 0.5, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ],
    featherPx: 0,
    invert: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 상수·칩 목록
// ---------------------------------------------------------------------------

describe("상수·칩 목록", () => {
  it("도구 3종(rect/ellipse/lasso)·결합 2종(add/subtract) — id 고유·한글 라벨", () => {
    expect(SELECTION_TOOLS.map((t) => t.id)).toEqual(["rect", "ellipse", "lasso"]);
    expect(SELECTION_COMBINE_MODES.map((m) => m.id)).toEqual(["add", "subtract"]);
    for (const item of [...SELECTION_TOOLS, ...SELECTION_COMBINE_MODES]) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.tip.length).toBeGreaterThan(0);
    }
  });

  it("슬라이더 범위 — 페더 0..60, 밝기 ±100, 색조 ±180", () => {
    expect(SELECTION_FEATHER_RANGE).toEqual({ min: 0, max: 60, step: 1 });
    expect(SELECTION_BRIGHTNESS_RANGE.min).toBe(-100);
    expect(SELECTION_HUE_RANGE.max).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// 도구 → 폴리곤
// ---------------------------------------------------------------------------

describe("rectSelectionPolygon", () => {
  it("드래그 순서와 무관하게 시계방향 4점 사각형", () => {
    const expected = [
      { x: 0.1, y: 0.2 },
      { x: 0.6, y: 0.2 },
      { x: 0.6, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    expect(rectSelectionPolygon({ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.9 })).toEqual(expected);
    expect(rectSelectionPolygon({ x: 0.6, y: 0.9 }, { x: 0.1, y: 0.2 })).toEqual(expected);
  });

  it("박스 밖 드래그는 0..1 로 클램프, NaN 은 0", () => {
    const poly = rectSelectionPolygon({ x: -0.4, y: Number.NaN }, { x: 1.7, y: 0.5 });
    for (const p of poly) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    expect(polygonAreaNorm(poly)).toBeCloseTo(0.5, 10);
  });
});

describe("ellipseSelectionPolygon", () => {
  it("기본 48각형으로 근사하고 면적이 π/4·w·h 에 수렴", () => {
    const poly = ellipseSelectionPolygon({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(poly).toHaveLength(ELLIPSE_POLYGON_SEGMENTS);
    // 단위원 절반 지름 0.5 → 면적 π·0.25 ≈ 0.785 (다각형 근사라 살짝 작음)
    expect(polygonAreaNorm(poly)).toBeGreaterThan(0.77);
    expect(polygonAreaNorm(poly)).toBeLessThanOrEqual(Math.PI / 4);
  });

  it("분할 수는 8..96 정수로 클램프", () => {
    expect(ellipseSelectionPolygon({ x: 0, y: 0 }, { x: 1, y: 1 }, 4)).toHaveLength(8);
    expect(ellipseSelectionPolygon({ x: 0, y: 0 }, { x: 1, y: 1 }, 500)).toHaveLength(96);
    expect(ellipseSelectionPolygon({ x: 0, y: 0 }, { x: 1, y: 1 }, Number.NaN)).toHaveLength(ELLIPSE_POLYGON_SEGMENTS);
  });

  it("모든 점이 드래그 bbox(0..1 클램프) 안", () => {
    const poly = ellipseSelectionPolygon({ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 });
    for (const p of poly) {
      expect(p.x).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(0.8 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(0.7 + 1e-9);
    }
  });
});

describe("올가미 — appendLassoPoint / simplifyLassoPolygon", () => {
  it("최소 간격보다 가까우면 같은 배열을 그대로 반환(추가 없음)", () => {
    const pts = [{ x: 0.5, y: 0.5 }];
    const same = appendLassoPoint(pts, { x: 0.5 + LASSO_MIN_POINT_DIST / 2, y: 0.5 });
    expect(same).toBe(pts);
    const grown = appendLassoPoint(pts, { x: 0.6, y: 0.5 });
    expect(grown).toHaveLength(2);
    expect(grown).not.toBe(pts);
  });

  it("단순화 — 이웃 중복·일직선 중간점·끝점 중복 닫음 제거", () => {
    const noisy: SelPoint[] = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0 }, // (0,0)→(0.5,0) 직선 위 중간점 — 제거 대상
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.0001 }, // 사실상 중복 — 제거 대상
      { x: 0.5, y: 0.5 },
      { x: 0, y: 0.5 },
      { x: 0.0005, y: 0.0005 }, // 시작점과 겹치는 닫음점 — 제거 대상
    ];
    const simplified = simplifyLassoPolygon(noisy);
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 0, y: 0.5 },
    ]);
  });

  it("3점 미만이면 그대로(짧은 배열) 반환", () => {
    expect(simplifyLassoPolygon([{ x: 0, y: 0 }])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 기하 — 면적·포함
// ---------------------------------------------------------------------------

describe("polygonAreaNorm / pointInPolygon", () => {
  const square: SelPoint[] = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];

  it("신발끈 면적 — 0.6×0.6 사각형 = 0.36, 3점 미만 = 0", () => {
    expect(polygonAreaNorm(square)).toBeCloseTo(0.36, 10);
    expect(polygonAreaNorm(square.slice(0, 2))).toBe(0);
  });

  it("even-odd 포함 판정 — 안/밖/오목 폴리곤", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.1, y: 0.5 }, square)).toBe(false);
    // L자(오목) — 파인 부분은 밖
    const lShape: SelPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(pointInPolygon({ x: 0.75, y: 0.75 }, lShape)).toBe(false);
    expect(pointInPolygon({ x: 0.25, y: 0.75 }, lShape)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 선택 상태 — 결합·반전·페더 (불변성)
// ---------------------------------------------------------------------------

describe("addSelectionSubpath / removeLastSubpath", () => {
  it("null 에서 시작해 합치기 서브패스를 추가한다", () => {
    const sel = addSelectionSubpath(null, "add", rectSelectionPolygon({ x: 0, y: 0 }, { x: 0.5, y: 1 }));
    expect(sel).not.toBeNull();
    expect(sel!.subpaths).toHaveLength(1);
    expect(sel!.subpaths[0]!.mode).toBe("add");
    expect(sel!.featherPx).toBe(0);
  });

  it("면적이 무의미한 폴리곤은 기존 선택을 그대로 반환", () => {
    const base = leftHalfSelection();
    const side = Math.sqrt(MIN_SELECTION_SUBPATH_AREA) / 2; // 면적이 문턱의 1/4
    const tiny = rectSelectionPolygon({ x: 0.5, y: 0.5 }, { x: 0.5 + side, y: 0.5 + side });
    expect(addSelectionSubpath(base, "add", tiny)).toBe(base);
    expect(addSelectionSubpath(null, "add", tiny)).toBeNull();
  });

  it("NaN 점은 위생 처리되고 원본 선택은 변형되지 않는다(불변)", () => {
    const base = leftHalfSelection();
    const next = addSelectionSubpath(base, "subtract", [
      { x: Number.NaN, y: 0 },
      { x: 0.4, y: 0 },
      { x: 0.4, y: 0.4 },
      { x: 0, y: 0.4 },
    ]);
    expect(base.subpaths).toHaveLength(1);
    expect(next!.subpaths).toHaveLength(2);
    expect(next!.subpaths[1]!.points[0]).toEqual({ x: 0, y: 0 });
  });

  it("한 단계 되돌리기 — 마지막 서브패스 제거, 전부 없어지면 null(해제)", () => {
    const two = addSelectionSubpath(leftHalfSelection(), "subtract", rectSelectionPolygon({ x: 0, y: 0 }, { x: 0.2, y: 0.2 }))!;
    const one = removeLastSubpath(two)!;
    expect(one.subpaths).toHaveLength(1);
    expect(removeLastSubpath(one)).toBeNull();
    // 반전이 켜져 있으면 서브패스가 없어져도 선택(전체 반전)은 유지된다.
    const invertedOnly = removeLastSubpath({ ...one, invert: true });
    expect(invertedOnly).not.toBeNull();
    expect(invertedOnly!.subpaths).toHaveLength(0);
  });
});

describe("setSelectionFeather / toggleSelectionInvert / isSelectionUsable", () => {
  it("페더는 0..60 클램프 + 정수 반올림, 불변 갱신", () => {
    const sel = leftHalfSelection();
    expect(setSelectionFeather(sel, 12.6).featherPx).toBe(13);
    expect(setSelectionFeather(sel, -5).featherPx).toBe(0);
    expect(setSelectionFeather(sel, 999).featherPx).toBe(SELECTION_FEATHER_RANGE.max);
    expect(setSelectionFeather(sel, Number.NaN).featherPx).toBe(0);
    expect(sel.featherPx).toBe(0);
  });

  it("반전 토글은 왕복하고, 사용 가능 판정은 add 서브패스 또는 반전", () => {
    const sel = leftHalfSelection();
    expect(toggleSelectionInvert(toggleSelectionInvert(sel))).toEqual(sel);
    expect(isSelectionUsable(sel)).toBe(true);
    expect(isSelectionUsable(null)).toBe(false);
    expect(isSelectionUsable(emptyPixelSelection())).toBe(false);
    // 빼기만 있는 선택은 못 쓰지만, 반전이 켜지면(바깥 전체) 쓸 수 있다.
    const subtractOnly: PixelSelection = {
      subpaths: [{ mode: "subtract", points: rectSelectionPolygon({ x: 0, y: 0 }, { x: 0.5, y: 0.5 }) }],
      featherPx: 0,
      invert: false,
    };
    expect(isSelectionUsable(subtractOnly)).toBe(false);
    expect(isSelectionUsable({ ...subtractOnly, invert: true })).toBe(true);
  });
});

describe("pointInSelection — 래스터와 같은 순차 덮어쓰기 의미론", () => {
  it("합치기 → 빼기 → 다시 합치기 순서가 그대로 반영된다", () => {
    let sel = addSelectionSubpath(null, "add", rectSelectionPolygon({ x: 0, y: 0 }, { x: 1, y: 1 }));
    sel = addSelectionSubpath(sel, "subtract", rectSelectionPolygon({ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }));
    expect(pointInSelection(sel, { x: 0.5, y: 0.5 })).toBe(false); // 뺀 구멍
    expect(pointInSelection(sel, { x: 0.1, y: 0.1 })).toBe(true);
    sel = addSelectionSubpath(sel, "add", rectSelectionPolygon({ x: 0.45, y: 0.45 }, { x: 0.55, y: 0.55 }));
    expect(pointInSelection(sel, { x: 0.5, y: 0.5 })).toBe(true); // 구멍 위에 다시 합침
  });

  it("반전은 최종 결과를 뒤집고, null 선택은 항상 false", () => {
    const sel = leftHalfSelection();
    expect(pointInSelection(sel, { x: 0.25, y: 0.5 })).toBe(true);
    expect(pointInSelection(toggleSelectionInvert(sel), { x: 0.25, y: 0.5 })).toBe(false);
    expect(pointInSelection(toggleSelectionInvert(sel), { x: 0.75, y: 0.5 })).toBe(true);
    expect(pointInSelection(null, { x: 0.5, y: 0.5 })).toBe(false);
  });
});

describe("selectionBoundsNorm", () => {
  it("합치기 서브패스들의 합집합 bbox(빼기는 무시), 0..1 클램프", () => {
    let sel = addSelectionSubpath(null, "add", rectSelectionPolygon({ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }));
    sel = addSelectionSubpath(sel, "add", rectSelectionPolygon({ x: 0.6, y: 0.6 }, { x: 0.9, y: 0.9 }));
    sel = addSelectionSubpath(sel, "subtract", rectSelectionPolygon({ x: 0, y: 0 }, { x: 1, y: 1 }));
    const b = selectionBoundsNorm(sel);
    expect(b!.x).toBeCloseTo(0.1, 10);
    expect(b!.y).toBeCloseTo(0.2, 10);
    expect(b!.x + b!.w).toBeCloseTo(0.9, 10);
    expect(b!.y + b!.h).toBeCloseTo(0.9, 10);
  });

  it("반전이면 전체 박스, 못 쓰는 선택이면 null", () => {
    expect(selectionBoundsNorm({ ...emptyPixelSelection(), invert: true })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(selectionBoundsNorm(null)).toBeNull();
    expect(selectionBoundsNorm(emptyPixelSelection())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 드래그 세션
// ---------------------------------------------------------------------------

describe("드래그 세션 — begin/update/commit", () => {
  it("rect: 이동마다 시작→현재 박스 미리보기 폴리곤을 재계산", () => {
    let drag = beginSelectionDrag("rect", "add", { x: 0.2, y: 0.2 });
    expect(polygonAreaNorm(drag.points)).toBe(0); // 시작 직후는 퇴화(면적 0)
    drag = updateSelectionDrag(drag, { x: 0.7, y: 0.6 });
    expect(drag.points).toEqual(rectSelectionPolygon({ x: 0.2, y: 0.2 }, { x: 0.7, y: 0.6 }));
  });

  it("ellipse: 미리보기가 타원 폴리곤", () => {
    let drag = beginSelectionDrag("ellipse", "subtract", { x: 0.1, y: 0.1 });
    drag = updateSelectionDrag(drag, { x: 0.9, y: 0.9 });
    expect(drag.points).toHaveLength(ELLIPSE_POLYGON_SEGMENTS);
    expect(drag.mode).toBe("subtract");
  });

  it("lasso: 궤적을 누적하고 너무 가까운 점은 무시(같은 상태 반환)", () => {
    let drag = beginSelectionDrag("lasso", "add", { x: 0.1, y: 0.1 });
    const before = drag;
    drag = updateSelectionDrag(drag, { x: 0.1 + LASSO_MIN_POINT_DIST / 3, y: 0.1 });
    expect(drag).toBe(before); // 점이 안 늘면 상태 객체도 그대로 → 불필요한 리렌더 없음
    drag = updateSelectionDrag(drag, { x: 0.6, y: 0.1 });
    drag = updateSelectionDrag(drag, { x: 0.6, y: 0.7 });
    expect(drag.points).toHaveLength(3);
  });

  it("commit: 의미 있는 드래그만 서브패스로 결합, 찰나 클릭은 null(변화 없음)", () => {
    let drag = beginSelectionDrag("rect", "add", { x: 0.2, y: 0.2 });
    drag = updateSelectionDrag(drag, { x: 0.8, y: 0.8 });
    const sel = commitSelectionDrag(null, drag);
    expect(sel!.subpaths).toHaveLength(1);
    // 제자리 클릭(면적 0)
    const tap = beginSelectionDrag("rect", "add", { x: 0.5, y: 0.5 });
    expect(commitSelectionDrag(sel, tap)).toBeNull();
    // 올가미 2점(선분)도 폴리곤이 안 되므로 null
    let line = beginSelectionDrag("lasso", "add", { x: 0.1, y: 0.1 });
    line = updateSelectionDrag(line, { x: 0.9, y: 0.9 });
    expect(commitSelectionDrag(sel, line)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 좌표 변환
// ---------------------------------------------------------------------------

describe("canvasPointToNormalized / normalizedPointToCanvas", () => {
  const frame = { x: 100, y: 50, width: 200, height: 100, rotation: 0 };

  it("비회전 — 요소 좌상단=(0,0), 우하단=(1,1)", () => {
    expect(canvasPointToNormalized(100, 50, frame)).toEqual({ x: 0, y: 0 });
    expect(canvasPointToNormalized(300, 150, frame)).toEqual({ x: 1, y: 1 });
    expect(canvasPointToNormalized(200, 100, frame)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("90° 회전 — 요소 로컬 (1,0) 이 캔버스에서 아래쪽에 놓인다", () => {
    const rot = { ...frame, rotation: 90 };
    // forward: 로컬 (w,0) → 캔버스 (x, y+w)
    const fwd = normalizedPointToCanvas({ x: 1, y: 0 }, rot);
    expect(fwd.x).toBeCloseTo(100, 8);
    expect(fwd.y).toBeCloseTo(50 + 200, 8);
    // inverse 왕복
    const back = canvasPointToNormalized(fwd.x, fwd.y, rot);
    expect(back.x).toBeCloseTo(1, 8);
    expect(back.y).toBeCloseTo(0, 8);
  });

  it("임의 회전 왕복 오차 없음 + 0 크기 프레임 방어", () => {
    const rot = { x: 30, y: 40, width: 120, height: 90, rotation: 33.3 };
    const p = { x: 0.31, y: 0.77 };
    const cv = normalizedPointToCanvas(p, rot);
    const back = canvasPointToNormalized(cv.x, cv.y, rot);
    expect(back.x).toBeCloseTo(p.x, 8);
    expect(back.y).toBeCloseTo(p.y, 8);
    const degenerate = canvasPointToNormalized(10, 10, { x: 0, y: 0, width: 0, height: 0 });
    expect(Number.isFinite(degenerate.x)).toBe(true);
    expect(Number.isFinite(degenerate.y)).toBe(true);
  });
});

describe("subpathOutlinePoints", () => {
  it("정규화 점을 요소 로컬 px 평탄 배열로", () => {
    const sp = leftHalfSelection().subpaths[0]!;
    expect(subpathOutlinePoints(sp, { width: 200, height: 100 })).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
  });
});

// ---------------------------------------------------------------------------
// 마칭앤츠
// ---------------------------------------------------------------------------

describe("marchingAntsDashOffset / marchingAntsPasses", () => {
  const cycle = MARCHING_ANTS_DASH[0] + MARCHING_ANTS_DASH[1];

  it("t=0 → 0, 시간이 흐르면 음수로 전진, 주기로 접힘(결정적)", () => {
    expect(marchingAntsDashOffset(0)).toBe(0);
    const half = marchingAntsDashOffset(250, 18); // 0.25s × 18px/s = 4.5px
    expect(half).toBeCloseTo(-4.5, 10);
    // 정확히 한 주기(9px ÷ 18px/s = 0.5s)를 지나면 다시 0
    expect(marchingAntsDashOffset(500, 18)).toBeCloseTo(0, 10);
    expect(marchingAntsDashOffset(123456, 18)).toBeGreaterThan(-cycle);
    expect(marchingAntsDashOffset(123456, 18)).toBeLessThanOrEqual(0);
    expect(marchingAntsDashOffset(Number.NaN)).toBe(0);
    expect(marchingAntsDashOffset(1000, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("2패스 — 흰 실선 밑줄 + 어두운 대시, 줌 배율로 화면 두께 유지", () => {
    const passes = marchingAntsPasses(250, 2);
    expect(passes).toHaveLength(2);
    expect(passes[0]!.dash).toBeNull();
    expect(passes[0]!.stroke).toBe("#ffffff");
    expect(passes[1]!.dash).toEqual([MARCHING_ANTS_DASH[0] / 2, MARCHING_ANTS_DASH[1] / 2]);
    expect(passes[1]!.dashOffset).toBeCloseTo(marchingAntsDashOffset(250) / 2, 10);
    expect(passes[0]!.strokeWidth).toBeCloseTo(0.8, 10);
    // 비정상 배율은 1로 방어
    expect(marchingAntsPasses(0, 0)[0]!.strokeWidth).toBeCloseTo(1.6, 10);
  });
});

// ---------------------------------------------------------------------------
// 마스크 래스터화 계획
// ---------------------------------------------------------------------------

describe("buildSelectionMaskPlan", () => {
  it("정규화 → 원본 px 폴리곤, add=fill / subtract=erase, 크기 반올림", () => {
    const sel = addSelectionSubpath(leftHalfSelection(), "subtract", rectSelectionPolygon({ x: 0.25, y: 0.25 }, { x: 0.5, y: 0.5 }))!;
    const plan = buildSelectionMaskPlan(sel, 800.4, 600.2)!;
    expect(plan.width).toBe(800);
    expect(plan.height).toBe(600);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]!.op).toBe("fill");
    expect(plan.steps[0]!.points[1]).toEqual([400, 0]); // (0.5, 0) × (800, 600)
    expect(plan.steps[1]!.op).toBe("erase");
    expect(plan.steps[1]!.points[0]).toEqual([200, 150]);
    expect(plan.invert).toBe(false);
  });

  it("featherScale 로 표시 px→원본 px 환산(상한 250), invert 전달", () => {
    const sel = toggleSelectionInvert(setSelectionFeather(leftHalfSelection(), 10));
    const plan = buildSelectionMaskPlan(sel, 1600, 1200, { featherScale: 2 })!;
    expect(plan.featherPx).toBe(20);
    expect(plan.invert).toBe(true);
    const extreme = buildSelectionMaskPlan(setSelectionFeather(leftHalfSelection(), 60), 1600, 1200, { featherScale: 100 })!;
    expect(extreme.featherPx).toBe(250);
    // 비정상 배율은 1로 방어
    expect(buildSelectionMaskPlan(sel, 1600, 1200, { featherScale: Number.NaN })!.featherPx).toBe(10);
  });

  it("flipX/flipY — 화면 반전 표시 중 선택을 원본 픽셀 좌표로 되반전", () => {
    const plan = buildSelectionMaskPlan(leftHalfSelection(), 100, 50, { flipX: true, flipY: true })!;
    // (0,0) → flip → (100,50), (0.5,0) → (50,50)
    expect(plan.steps[0]!.points[0]).toEqual([100, 50]);
    expect(plan.steps[0]!.points[1]).toEqual([50, 50]);
  });

  it("못 쓰는 선택·비정상 크기는 null", () => {
    expect(buildSelectionMaskPlan(null, 100, 100)).toBeNull();
    expect(buildSelectionMaskPlan(emptyPixelSelection(), 100, 100)).toBeNull();
    expect(buildSelectionMaskPlan(leftHalfSelection(), 0, 100)).toBeNull();
    expect(buildSelectionMaskPlan(leftHalfSelection(), 100, Number.NaN)).toBeNull();
  });
});

describe("paintSelectionMaskSteps / rasterizeSelectionMask", () => {
  function planOf(sel: PixelSelection, w = 100, h = 100): SelectionMaskPlan {
    return buildSelectionMaskPlan(sel, w, h)!;
  }

  it("fill=source-over·erase=destination-out 순서로 칠하고 evenodd 로 채운 뒤 원복", () => {
    const log: string[] = [];
    const sel = addSelectionSubpath(leftHalfSelection(), "subtract", rectSelectionPolygon({ x: 0, y: 0 }, { x: 0.2, y: 0.2 }))!;
    paintSelectionMaskSteps(fakeCtx(log, "m"), planOf(sel));
    expect(log[0]).toBe("m:clearRect(0,0,100,100)");
    const gcoWrites = log.filter((l) => l.startsWith("m:gco="));
    expect(gcoWrites).toEqual(["m:gco=source-over", "m:gco=destination-out", "m:gco=source-over"]);
    expect(log.filter((l) => l === "m:fill(evenodd)")).toHaveLength(2);
    expect(log[log.length - 1]).toBe("m:gco=source-over");
  });

  it("페더·반전 없음 → 캔버스 1장으로 끝", () => {
    const log: string[] = [];
    const mask = rasterizeSelectionMask(planOf(leftHalfSelection()), fakeFactory(log));
    expect((mask as FakeCanvas).id).toBe(1);
    expect(log.filter((l) => l.startsWith("create#"))).toEqual(["create#1(100x100)"]);
  });

  it("페더 → 두 번째 캔버스에 blur 필터로 옮겨 그림", () => {
    const log: string[] = [];
    const mask = rasterizeSelectionMask(planOf(setSelectionFeather(leftHalfSelection(), 8)), fakeFactory(log));
    expect((mask as FakeCanvas).id).toBe(2);
    expect(log).toContain("c2:filter=blur(8px)");
    expect(log).toContain("c2:drawImage(#1,0,0)");
    expect(log).toContain("c2:filter=none");
  });

  it("반전 → 흰 바탕에서 destination-out 으로 알파 반전", () => {
    const log: string[] = [];
    const mask = rasterizeSelectionMask(planOf(toggleSelectionInvert(leftHalfSelection())), fakeFactory(log));
    expect((mask as FakeCanvas).id).toBe(2);
    expect(log).toContain("c2:fillRect(0,0,100,100)");
    expect(log).toContain("c2:gco=destination-out");
    expect(log[log.length - 1]).toBe("c2:gco=source-over");
  });

  it("팩토리 실패(null) 시 어느 단계에서든 null", () => {
    const plan = planOf(toggleSelectionInvert(setSelectionFeather(leftHalfSelection(), 5)));
    expect(rasterizeSelectionMask(plan, fakeFactory([], 1))).toBeNull();
    expect(rasterizeSelectionMask(plan, fakeFactory([], 2))).toBeNull();
    expect(rasterizeSelectionMask(plan, fakeFactory([], 3))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 조정 planner + 적용 합성
// ---------------------------------------------------------------------------

describe("planSelectionAdjust / isSelectionAdjustNoop", () => {
  it("밝기 — %p 를 brightness() 배율로(클램프·소수 노이즈 없음)", () => {
    expect(planSelectionAdjust("brightness", 35)).toEqual({ kind: "brightness", amount: 35, cssFilter: "brightness(1.35)" });
    expect(planSelectionAdjust("brightness", -100).cssFilter).toBe("brightness(0)");
    expect(planSelectionAdjust("brightness", 250).cssFilter).toBe("brightness(2)");
    expect(planSelectionAdjust("brightness", Number.NaN).cssFilter).toBe("brightness(1)");
  });

  it("색조 — hue-rotate(deg), 삭제 — cssFilter 없음", () => {
    expect(planSelectionAdjust("hue", 90)).toEqual({ kind: "hue", amount: 90, cssFilter: "hue-rotate(90deg)" });
    expect(planSelectionAdjust("hue", -400).cssFilter).toBe("hue-rotate(-180deg)");
    expect(planSelectionAdjust("delete")).toEqual({ kind: "delete", cssFilter: null });
  });

  it("noop 판정 — 양 0 인 밝기/색조만 true", () => {
    expect(isSelectionAdjustNoop(planSelectionAdjust("brightness", 0))).toBe(true);
    expect(isSelectionAdjustNoop(planSelectionAdjust("hue", 0))).toBe(true);
    expect(isSelectionAdjustNoop(planSelectionAdjust("hue", 1))).toBe(false);
    expect(isSelectionAdjustNoop(planSelectionAdjust("delete"))).toBe(false);
  });
});

describe("applySelectionAdjustToCanvas", () => {
  const source: MaskImageSource & { id: number; width: number; height: number } = { id: 900, width: 100, height: 50 };
  const mask: MaskImageSource & { id: number; width: number; height: number } = { id: 901, width: 100, height: 50 };

  it("삭제 — 원본 위에 destination-out 으로 마스크를 찍는다", () => {
    const log: string[] = [];
    const out = applySelectionAdjustToCanvas(source, 100, 50, mask, planSelectionAdjust("delete"), fakeFactory(log));
    expect((out as FakeCanvas).id).toBe(1);
    expect(log).toEqual([
      "create#1(100x50)",
      "c1:drawImage(#900,0,0)",
      "c1:gco=destination-out",
      "c1:drawImage(#901,0,0)",
      "c1:gco=source-over",
    ]);
  });

  it("밝기 — 필터 적용본을 마스크로 오려(destination-in) 원본 위에 합성", () => {
    const log: string[] = [];
    const out = applySelectionAdjustToCanvas(source, 100, 50, mask, planSelectionAdjust("brightness", 20), fakeFactory(log));
    expect((out as FakeCanvas).id).toBe(2);
    expect(log).toEqual([
      "create#1(100x50)",
      "c1:filter=brightness(1.2)",
      "c1:drawImage(#900,0,0)",
      "c1:filter=none",
      "c1:gco=destination-in",
      "c1:drawImage(#901,0,0)",
      "c1:gco=source-over",
      "create#2(100x50)",
      "c2:drawImage(#900,0,0)",
      "c2:drawImage(#1,0,0)",
    ]);
  });

  it("비정상 크기·팩토리 실패는 null", () => {
    expect(applySelectionAdjustToCanvas(source, 0, 50, mask, planSelectionAdjust("delete"), fakeFactory([]))).toBeNull();
    expect(applySelectionAdjustToCanvas(source, 100, 50, mask, planSelectionAdjust("hue", 30), fakeFactory([], 1))).toBeNull();
    expect(applySelectionAdjustToCanvas(source, 100, 50, mask, planSelectionAdjust("hue", 30), fakeFactory([], 2))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DOM 구조 호환 — 실제 Canvas 타입이 구조 타입에 대입되는지 컴파일 검증
// ---------------------------------------------------------------------------

describe("DOM 구조 타입 호환(컴파일 검증)", () => {
  it("CanvasRenderingContext2D/HTMLCanvasElement/HTMLImageElement 가 구조상 호환", () => {
    // 값은 쓰지 않는다 — 대입이 컴파일되는 것 자체가 검증(통합부가 캐스트 없이 쓰기 위함).
    const ctxCompat: MaskCtx2DLike = null as unknown as CanvasRenderingContext2D;
    const canvasCompat: MaskCanvasLike & MaskImageSource = null as unknown as HTMLCanvasElement;
    const imageCompat: MaskImageSource = null as unknown as HTMLImageElement;
    expect(ctxCompat).toBeNull();
    expect(canvasCompat).toBeNull();
    expect(imageCompat).toBeNull();
  });
});

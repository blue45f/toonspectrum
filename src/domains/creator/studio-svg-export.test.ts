import { describe, expect, it } from "vitest";

import { screentoneDotsForStroke } from "./studio-brush";
import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsPresetSettings,
  type StudioBrushDynamicsPresetId,
} from "./studio-brush-dynamics";
import { studioBrushTipAlphaMapToBase64 } from "./studio-brush-tip-stamp";
import { bubblePathData, doubleBubblePathData } from "./studio-bubble-path";
import {
  SVG_EXPORT_MIME,
  escapeXml,
  exportPageToSvg,
  svgExportFileName,
  svgExportResultMessage,
  type SvgExportEl,
  type SvgExportPageInput,
  type SvgExportResult,
} from "./studio-svg-export";

import type { El } from "./StudioPage";

// ---------------------------------------------------------------------------
// 헬퍼 — 페이지 입력/요소 빌더
// ---------------------------------------------------------------------------

function page(elements: SvgExportEl[], over: Partial<SvgExportPageInput> = {}): SvgExportPageInput {
  return { width: 720, height: 1000, bg: "#ffffff", elements, ...over };
}

function rectEl(over: Partial<Extract<SvgExportEl, { type: "draw" }>> = {}): Extract<SvgExportEl, { type: "draw" }> {
  return {
    id: "d1",
    type: "draw",
    kind: "rect",
    points: [10, 20, 110, 80],
    stroke: "#111111",
    strokeWidth: 2,
    fill: "#ff0000",
    ...over,
  };
}

/** Legacy solid-ellipse dab path — isolates affine/opacity geometry from textured tip stamps. */
function ellipseDynamics(preset: StudioBrushDynamicsPresetId) {
  return normalizeStudioBrushDynamicsSettings({
    ...studioBrushDynamicsPresetSettings(preset),
    tip: { shape: "round", softness: 0.35 },
  });
}

interface DynamicEllipseAttributes {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
}

/** 동적 브러시 variation마다 생성되는 `<g>`에서 타원 지오메트리만 수치로 읽는다. */
function dynamicEllipseGroups(svg: string): DynamicEllipseAttributes[][] {
  return Array.from(svg.matchAll(/<g>(.*?)<\/g>/g), (groupMatch) =>
    Array.from(
      groupMatch[1]!.matchAll(
        /<ellipse cx="([^"]+)" cy="([^"]+)" rx="([^"]+)" ry="([^"]+)"[^>]*transform="rotate\(([^ ]+) [^)]+\)"\/>/g
      ),
      (ellipseMatch) => ({
        cx: Number(ellipseMatch[1]),
        cy: Number(ellipseMatch[2]),
        rx: Number(ellipseMatch[3]),
        ry: Number(ellipseMatch[4]),
        angle: Number(ellipseMatch[5]),
      })
    )
  ).filter((group) => group.length > 0);
}

function expectNear(actual: number, expected: number, tolerance = 0.02) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function axisVector(angle: number): { x: number; y: number } {
  const radians = angle * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function textEl(over: Partial<Extract<SvgExportEl, { type: "text" }>> = {}): Extract<SvgExportEl, { type: "text" }> {
  return {
    id: "t1",
    type: "text",
    text: "안녕\n웹툰",
    x: 10,
    y: 20,
    width: 200,
    fontSize: 20,
    fill: "#222222",
    rotation: 0,
    align: "center",
    letterSpacing: 1,
    lineHeight: 1.2,
    ...over,
  };
}

function bubbleEl(over: Partial<Extract<SvgExportEl, { type: "bubble" }>> = {}): Extract<SvgExportEl, { type: "bubble" }> {
  return {
    id: "b1",
    type: "bubble",
    variant: "speech",
    text: "야!",
    x: 5,
    y: 6,
    width: 200,
    height: 120,
    fill: "#ffffff",
    textFill: "#111111",
    rotation: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// El 유니온 호환 — StudioPage 요소 배열을 구조 그대로 받는다(컴파일 타임 검증).
// ---------------------------------------------------------------------------

describe("El 유니온 구조 호환", () => {
  it("StudioPage El이 SvgExportEl로 그대로 대입된다(tsc 게이트)", () => {
    const acceptEl = (el: El): SvgExportEl => el;
    expect(typeof acceptEl).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 문서 골격 — 루트/배경/숨김/결정성
// ---------------------------------------------------------------------------

describe("exportPageToSvg 문서 골격", () => {
  it("루트 svg에 xmlns·크기·viewBox가 결정적으로 들어간다", () => {
    const { svg } = exportPageToSvg(page([]));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1000" viewBox="0 0 720 1000">')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("배경 단색 rect를 캔버스 bg와 동일하게 깐다", () => {
    const { svg } = exportPageToSvg(page([], { bg: "#fef3c7" }));
    expect(svg).toContain('<rect width="720" height="1000" fill="#fef3c7"/>');
  });

  it("bgGrad가 있으면 세로 2색 그라데이션 defs로 배경을 칠한다", () => {
    const { svg } = exportPageToSvg(page([], { bgGrad: ["#000000", "#ffffff"] }));
    expect(svg).toContain('x1="0" y1="0" x2="0" y2="1000"');
    expect(svg).toContain('<stop offset="0%" stop-color="#000000"/>');
    expect(svg).toContain('<stop offset="100%" stop-color="#ffffff"/>');
    expect(svg).toMatch(/<rect width="720" height="1000" fill="url\(#sg\d+\)"\/>/);
  });

  it("transparentBg면 배경을 그리지 않는다", () => {
    const { svg } = exportPageToSvg(page([], { transparentBg: true, bg: "#ffffff" }));
    expect(svg).not.toContain('fill="#ffffff"');
  });

  it("숨긴 요소·숨긴 그룹 소속 요소는 제외되고 elementCount에도 빠진다", () => {
    const result = exportPageToSvg(
      page(
        [
          rectEl({ id: "d1", hidden: true }),
          rectEl({ id: "d2", groupId: "g1" }),
          rectEl({ id: "d3", points: [200, 20, 300, 80] }),
        ],
        { groups: [{ id: "g1", name: "숨김 그룹", hidden: true }] }
      )
    );
    expect(result.elementCount).toBe(1);
    expect((result.svg.match(/<rect /g) ?? []).length).toBe(2); // 배경 + d3 하나
  });

  it("같은 입력이면 출력 바이트가 동일하다(결정성)", () => {
    const input = page([
      rectEl(),
      textEl(),
      bubbleEl(),
      { id: "fl1", type: "focusLines", x: 0, y: 0, width: 720, height: 400, lineCount: 12, innerRadius: 60, outerRadius: 300, stroke: "#000000", strokeWidth: 2, noise: 10, rotation: 0 },
    ]);
    expect(exportPageToSvg(input).svg).toBe(exportPageToSvg(input).svg);
  });
});

// ---------------------------------------------------------------------------
// 도형(draw) — 사각/타원/별/다각형/선/화살표/자유곡선
// ---------------------------------------------------------------------------

describe("도형 직렬화", () => {
  it("사각형 — 위치·크기·모서리 반경·선 스타일을 그대로 담는다", () => {
    const { svg } = exportPageToSvg(page([rectEl()]));
    expect(svg).toContain(
      '<rect x="10" y="20" width="100" height="60" rx="3" fill="#ff0000" stroke="#111111" stroke-width="2" stroke-linejoin="round"/>'
    );
  });

  it("점선 프리셋은 선 굵기에 비례한 stroke-dasharray로 나온다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ strokeStyle: { dash: "dash", lineCap: "round", arrowStart: "none", arrowEnd: "none" } })]));
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it("타원 — 중심·반지름을 캔버스와 동일하게 계산한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ kind: "ellipse" })]));
    expect(svg).toContain('<ellipse cx="60" cy="50" rx="50" ry="30"');
  });

  it("별/다각형 — studio-stroke-shapes 포인트 지오메트리를 재사용한다", () => {
    const star = rectEl({ id: "s1", kind: "star", points: [0, 0, 100, 100] });
    const poly = rectEl({ id: "p1", kind: "polygon", points: [0, 0, 100, 100], shapeParams: { starPoints: 5, starInnerRatio: 0.5, polygonSides: 6, cornerRadius: 3 } });
    const { svg } = exportPageToSvg(page([star, poly]));
    // 별 첫 꼭짓점 = 12시 방향(중심 50,50 · 외접 반경 50 → "50,0")
    expect(svg).toContain('<polygon points="50,0');
    // 육각형 = 12개 좌표(x,y 6쌍)
    const polygons = svg.match(/<polygon points="([^"]+)"/g) ?? [];
    expect(polygons.length).toBe(2);
    expect((polygons[1]?.match(/,/g) ?? []).length).toBe(6);
  });

  it("선 — 화살촉(삼각형)을 stroke 색으로 채워 함께 그린다", () => {
    const line = rectEl({
      id: "l1",
      kind: "line",
      points: [0, 0, 100, 0],
      stroke: "#333333",
      strokeWidth: 4,
      strokeStyle: { dash: "solid", lineCap: "round", arrowStart: "none", arrowEnd: "arrow" },
    });
    const { svg } = exportPageToSvg(page([line]));
    expect(svg).toContain('<path d="M 0 0 L 100 0" fill="none" stroke="#333333" stroke-width="4" stroke-linecap="round"');
    expect(svg).toContain('d="M 100 0 L 90.99 4.34 L 90.99 -4.34 Z" fill="#333333"');
  });

  it("화살표(arrow) — 몸통 + 끝점 삼각 화살촉(굵기 비례)을 그린다", () => {
    const arrow = rectEl({ id: "a1", kind: "arrow", points: [0, 0, 100, 0], stroke: "#123456", strokeWidth: 4 });
    const { svg } = exportPageToSvg(page([arrow]));
    expect(svg).toContain('<path d="M 0 0 L 100 0" fill="none" stroke="#123456"');
    expect(svg).toContain('<path d="M 100 0 L 92 4 L 92 -4 Z" fill="#123456"');
  });

  it("자유곡선(펜) — Konva tension 곡선(Q/C 커맨드)으로 매끈하게 나온다", () => {
    const pen = rectEl({ id: "f1", kind: "freehand", points: [0, 0, 10, 0, 20, 10, 30, 30], strokeWidth: 3 });
    const { svg } = exportPageToSvg(page([pen]));
    const d = /<path d="(M 0 0 Q [^"]+)"/.exec(svg)?.[1];
    expect(d).toBeTruthy();
    expect(d).toContain(" C ");
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("한 점 탭 — 필압 굵기의 원으로 보존한다", () => {
    const dot = rectEl({
      id: "dot-1",
      kind: "freehand",
      points: [12, 34],
      pressures: [0.75],
      stroke: "#123456",
      strokeWidth: 10,
    });
    const { svg, skipped } = exportPageToSvg(page([dot]));
    expect(svg).toContain('<circle cx="12" cy="34"');
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('r="6.75"');
    expect(skipped).toEqual([]);
  });

  it("새 기본 펜 — 라이브/WebGPU와 같은 causal round-dab 시퀀스로 보존한다", () => {
    const pen = rectEl({
      id: "causal-pen-svg",
      kind: "freehand",
      points: [0, 0, 8, 0, 16, 8],
      pressures: [0.25, 0.5, 1],
      sampleSpacing: 1.5,
      stroke: "#123456",
      strokeWidth: 10,
      fill: undefined,
    });
    const { svg, skipped } = exportPageToSvg(page([pen]));
    const circles = svg.match(/<circle /g) ?? [];

    expect(circles.length).toBeGreaterThan(3);
    expect(svg).toContain('<circle cx="0" cy="0" r="3.25" fill="#123456"');
    expect(svg).toContain('<circle cx="16" cy="8" r="8.5" fill="#123456"');
    expect(svg).not.toContain('<path d="M 0 0 Q');
    expect(skipped).toEqual([]);
  });

  it("layered-flow-v1 마커는 알파 색상 dab을 단일 compound path로 한 번만 합성한다", () => {
    const marker = rectEl({
      id: "layered-marker-svg",
      kind: "freehand",
      points: [0, 0, 8, 0, 16, 0],
      pressures: [1, 1, 1],
      pressureModel: "linear-residual-path-v3",
      paintModel: "layered-flow-v1",
      sampleSpacing: 0,
      stroke: "rgba(171, 51, 68, 0.4)",
      strokeWidth: 16,
      opacity: 0.6,
      brush: "marker",
      fill: undefined,
    });
    const { svg, skipped } = exportPageToSvg(page([marker]));
    const layeredPath = /<path d="([^"]+)" fill="rgba\(171, 51, 68, 0\.4\)" opacity="0\.6"\/>/.exec(svg);

    expect(layeredPath?.[1]).toContain("M -8 0 A 8 8 0 1 0 8 0 A 8 8 0 1 0 -8 0 Z");
    expect(layeredPath?.[1].match(/M /g)?.length).toBeGreaterThan(1);
    expect(svg).not.toContain("<circle");
    expect(svg.match(/fill="rgba\(171, 51, 68, 0\.4\)"/g)).toHaveLength(1);
    expect(svg.match(/opacity="0\.6"/g)).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  it("호환되지 않는 대칭 paintModel 조합은 레거시 per-dab SVG 경로로 fail-closed 한다", () => {
    const invalidLayeredSymmetry = rectEl({
      id: "invalid-layered-symmetry-svg",
      kind: "freehand",
      points: [0, 0, 8, 0],
      pressures: [1, 1],
      pressureModel: "linear-residual-path-v3",
      paintModel: "layered-flow-v1",
      sampleSpacing: 0,
      stroke: "#ab3344",
      strokeWidth: 16,
      opacity: 0.6,
      brush: "marker",
      fill: undefined,
      symmetry: { type: "vertical", centerX: 50, centerY: 0 },
    });
    const { svg } = exportPageToSvg(page([invalidLayeredSymmetry]));

    expect(svg).toContain('<circle cx="0" cy="0" r="8" fill="#ab3344" opacity="0.6"/>');
    expect(svg).not.toContain('<path d="M -8 0 A 8 8');
  });

  it("linear-full-v1 기본 펜 — 압력 0/.5/1을 지름 0/.5x/1x로 내보낸다", () => {
    const pen = rectEl({
      id: "linear-pressure-pen-svg",
      kind: "freehand",
      points: [0, 0, 10, 0, 20, 0],
      pressures: [0, 0.5, 1],
      pressureModel: "linear-full-v1",
      sampleSpacing: 1,
      stroke: "#654321",
      strokeWidth: 10,
      fill: undefined,
    });
    const { svg, skipped } = exportPageToSvg(page([pen]));

    expect(svg).toContain('<circle cx="0" cy="0" r="0" fill="#654321"');
    expect(svg).toContain('<circle cx="10" cy="0" r="2.5" fill="#654321"');
    expect(svg).toContain('<circle cx="20" cy="0" r="5" fill="#654321"');
    expect(skipped).toEqual([]);
  });

  it("linear-residual-v2 기본 펜 — segment subdivision과 무관한 Magma 간격을 보존한다", () => {
    const pen = rectEl({
      id: "residual-pressure-pen-svg",
      kind: "freehand",
      points: Array.from({ length: 13 }, (_, index) => [index, 0]).flat(),
      pressures: Array.from({ length: 13 }, () => 1),
      pressureModel: "linear-residual-v2",
      sampleSpacing: 0,
      stroke: "#654321",
      strokeWidth: 16,
      fill: undefined,
    });
    const { svg, skipped } = exportPageToSvg(page([pen]));
    const circles = svg.match(/<circle /g) ?? [];

    expect(circles).toHaveLength(4);
    expect(svg).toContain('<circle cx="0" cy="0" r="8" fill="#654321"');
    expect(svg).toContain('<circle cx="3.2" cy="0" r="8" fill="#654321"');
    expect(svg).toContain('<circle cx="6.4" cy="0" r="8" fill="#654321"');
    expect(svg).toContain('<circle cx="9.6" cy="0" r="8" fill="#654321"');
    expect(svg).not.toContain('cx="12"');
    expect(skipped).toEqual([]);
  });

  it("linear-residual-path-v3 펜은 급회전에서 이전 chord를 다시 칠하지 않는다", () => {
    const pen = rectEl({
      id: "residual-path-v3-pen-svg",
      kind: "freehand",
      points: [0, 0, 4, 0, 4, 4, 8, 4],
      pressures: [1, 1, 1, 1],
      pressureModel: "linear-residual-path-v3",
      sampleSpacing: 0,
      stroke: "#654321",
      strokeWidth: 16,
      fill: undefined,
    });
    const { svg, skipped } = exportPageToSvg(page([pen]));
    const circles = svg.match(/<circle /g) ?? [];

    expect(circles).toHaveLength(4);
    expect(svg).toContain('<circle cx="0" cy="0" r="8" fill="#654321"');
    expect(svg).toContain('<circle cx="3.2" cy="0" r="8" fill="#654321"');
    expect(svg).toContain('<circle cx="4" cy="2.4" r="8" fill="#654321"');
    expect(svg).toContain('<circle cx="5.6" cy="4" r="8" fill="#654321"');
    expect(svg).not.toContain('cx="4" cy="0"');
    expect(skipped).toEqual([]);
  });

  it("명시적 선형 압력 모델은 sampleSpacing이 없는 탭과 레거시 지오메트리도 재해석한다", () => {
    const tap = rectEl({
      id: "linear-zero-tap-svg",
      kind: "freehand",
      points: [12, 34],
      pressures: [0],
      pressureModel: "linear-full-v1",
      stroke: "#123456",
      strokeWidth: 10,
      fill: undefined,
    });
    const line = rectEl({
      id: "linear-no-spacing-svg",
      kind: "freehand",
      points: [0, 0, 10, 0],
      pressures: [0],
      pressureModel: "linear-full-v1",
      stroke: "#654321",
      strokeWidth: 10,
      fill: undefined,
    });
    const { svg, skipped } = exportPageToSvg(page([tap, line]));

    expect(svg).toContain('<circle cx="12" cy="34" r="0" fill="#123456"');
    expect(svg).toContain('<circle cx="0" cy="0" r="0" fill="#654321"');
    expect(svg).toContain('<circle cx="10" cy="0" r="5" fill="#654321"');
    expect(skipped).toEqual([]);
  });

  it("스탬프 4종 탭 — 각 엔진 고유의 dab·그레인·그라데이션·웻엣지를 보존한다", () => {
    const cases = [
      { brush: "ink-brush", kind: "ink", circles: 1 },
      { brush: "airbrush-fine", kind: "airbrush", circles: 1 },
      { brush: "pencil-grain", kind: "pencil", circles: 3 },
      { brush: "wash-brush", kind: "watercolor", circles: 2 },
    ] as const;
    const outputs = cases.map(({ brush, kind, circles }) => {
      const input = page([rectEl({
        id: `stamp-tap-${kind}`,
        kind: "freehand",
        brush,
        points: [12, 34],
        pressures: [0.6],
        stroke: "#315f73",
        strokeWidth: 20,
        opacity: 0.75,
        fill: undefined,
        stampPipeline: "causal-walker-v2",
      })]);
      const first = exportPageToSvg(input);
      const repeated = exportPageToSvg(input);

      expect(first.svg).toBe(repeated.svg);
      expect(first.svg).toContain(`data-stamp-brush="${kind}"`);
      expect((first.svg.match(/<circle\b/g) ?? [])).toHaveLength(circles);
      expect(first.svg).not.toContain('<path d="M 12 34');
      expect(first.skipped).toEqual([]);
      return first.svg;
    });

    expect(new Set(outputs).size).toBe(4);
    expect(outputs[1]).toContain("<radialGradient");
    expect(outputs[2]).toContain('data-stamp-brush="pencil" fill="#315f73"');
    expect(outputs[3]).toContain('fill="none" stroke="#315f73"');
  });

  it("스탬프 튜닝 — flow·hardness·minSize를 SVG 농도·팁 경도·탭 반경에 반영한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({
      id: "stamp-tuning-svg",
      kind: "freehand",
      brush: "airbrush-fine",
      points: [10, 20],
      pressures: [0],
      stroke: "#204060",
      strokeWidth: 20,
      opacity: 0.5,
      fill: undefined,
      stampPipeline: "causal-walker-v2",
      stamp: { flow: 0.4, hardness: 0.8, minSize: 0.2 },
    })]));

    expect(svg).toContain('<stop offset="68%" stop-color="#204060"/>');
    expect(svg).toContain('<circle cx="10" cy="20" r="2"');
    expect(svg).toContain('opacity="0.2"');
  });

  it("스탬프 4종 스트로크 — 짧은 획보다 긴 획의 마크가 많고 출력은 결정적이다", () => {
    const brushes = ["ink-brush", "airbrush-fine", "pencil-grain", "wash-brush"] as const;
    for (const brush of brushes) {
      const base = rectEl({
        id: `stamp-length-${brush}`,
        kind: "freehand",
        brush,
        pressures: [0.35, 0.8],
        stroke: "#4a3020",
        strokeWidth: 14,
        fill: undefined,
        stampPipeline: "causal-walker-v2",
      });
      const short = exportPageToSvg(page([{ ...base, points: [4, 8, 20, 8] }])).svg;
      const longInput = page([{ ...base, points: [4, 8, 180, 8] }]);
      const long = exportPageToSvg(longInput).svg;
      const repeated = exportPageToSvg(longInput).svg;

      expect((long.match(/<circle\b/g) ?? []).length).toBeGreaterThan(
        (short.match(/<circle\b/g) ?? []).length
      );
      expect(long).toBe(repeated);
    }
  });

  it("causal 스탬프는 raw 급회전을 보존하고 legacy 스탬프만 과거 평활화를 유지한다", () => {
    const base = rectEl({
      id: "stamp-stream-contract",
      kind: "freehand",
      brush: "airbrush-fine",
      points: [0, 0, 0, 10, 10, 10],
      pressures: [0.3, 0.6, 0.9],
      sampleSpacing: 128,
      stroke: "#3f6280",
      strokeWidth: 10,
      fill: undefined,
    });
    const legacy = exportPageToSvg(page([base])).svg;
    const causalInput = page([{ ...base, stampPipeline: "causal-walker-v2" }]);
    const causal = exportPageToSvg(causalInput).svg;

    expect(causal).toBe(exportPageToSvg(causalInput).svg);
    expect(causal).not.toBe(legacy);
    expect(causal).toMatch(/<circle cx="0" cy="[1-9][^"]*"/);
    expect(legacy).not.toMatch(/<circle cx="0" cy="[1-9][^"]*"/);
  });

  it("글로우 탭 — 경로가 아닌 동심 원 레이어로 한 번의 클릭도 보이게 내보낸다", () => {
    for (const brush of ["glow", "soft-glow"] as const) {
      const input = page([rectEl({
        id: `glow-tap-${brush}`,
        kind: "freehand",
        brush,
        points: [25, 35],
        stroke: "#55ccff",
        strokeWidth: 16,
        opacity: 0.8,
        fill: undefined,
      })]);
      const first = exportPageToSvg(input).svg;

      expect(first).toBe(exportPageToSvg(input).svg);
      expect((first.match(/<circle cx="25" cy="35"/g) ?? []).length).toBeGreaterThan(1);
      expect(first).toContain("mix-blend-mode:screen");
      expect(first).not.toContain('<path d="M 25 35');
    }
  });

  it("수채 번짐 — 결정적 core/diffuse dab과 방사 그라데이션을 보존한다", () => {
    const watercolor = rectEl({
      id: "watercolor-svg-1",
      kind: "freehand",
      brush: "watercolor",
      points: [0, 0, 20, 5, 40, 0],
      pressures: [0.2, 0.6, 0.9],
      stroke: "#336699",
      strokeWidth: 24,
    });
    const first = exportPageToSvg(page([watercolor]));
    const second = exportPageToSvg(page([watercolor]));
    expect(first.svg).toBe(second.svg);
    expect(first.svg).toContain("<radialGradient");
    expect(first.svg).toContain('stop-color="#336699"');
    expect((first.svg.match(/<circle /g) ?? []).length).toBeGreaterThan(2);
    expect(first.skipped).toEqual([]);
  });

  it("causal 수채 v2는 전체 평활화 없이 raw accepted points를 결정적으로 내보낸다", () => {
    const base = rectEl({
      id: "watercolor-causal-svg-1",
      kind: "freehand",
      brush: "watercolor",
      points: [0, 0, 0, 10, 10, 10],
      pressures: [0.25, 0.6, 0.9],
      sampleSpacing: 128,
      stroke: "#315f73",
      strokeWidth: 10,
      fill: undefined,
    });
    const legacy = exportPageToSvg(page([base]));
    const causal = exportPageToSvg(page([{
      ...base,
      watercolorPipeline: "causal-walker-v2",
    }]));
    const repeated = exportPageToSvg(page([{
      ...base,
      watercolorPipeline: "causal-walker-v2",
    }]));

    // width 10의 causal 기본 spacing은 3.4px이다. 첫 raw 수직 구간을 보존할 때만 이 core가
    // 생긴다. legacy는 sampleSpacing=128로 중간점을 제거해 대각선 전체 계획을 유지한다.
    expect(causal.svg).toMatch(/<circle cx="0" cy="3\.4"[^>]+fill="#315f73"/);
    expect(legacy.svg).not.toMatch(/<circle cx="0" cy="3\.4"[^>]+fill="#315f73"/);
    expect(causal.svg).toContain('<circle cx="10" cy="10"');
    expect(causal.svg).not.toBe(legacy.svg);
    expect(repeated.svg).toBe(causal.svg);
    expect(causal.skipped).toEqual([]);

    const longStroke = exportPageToSvg(page([{
      ...base,
      id: "watercolor-causal-svg-long",
      points: [0, 0, 5_000, 0],
      pressures: [0.5, 0.5],
      watercolorPipeline: "causal-walker-v2",
    }]));
    const longStrokeDabCount = (longStroke.svg.match(/<circle\b/g) ?? []).length;
    expect(longStrokeDabCount).toBeGreaterThan(512);
    expect(longStrokeDabCount).toBeLessThanOrEqual(8_192);
    expect(longStroke.svg).toContain('<circle cx="5000" cy="0"');
  });

  it("입자 브러시 — Canvas와 같은 결정적 타원형 dab·회전·유량을 SVG로 보존한다", () => {
    const dynamic = rectEl({
      id: "dynamic-svg-1",
      kind: "freehand",
      brush: "dry-media",
      points: [8, 12, 28, 8, 52, 30, 80, 18],
      pressures: [0.15, 0.45, 0.9, 0.35],
      speeds: [0.1, 0.5, 1.1, 0.3],
      tiltXs: [0, 12, 38, 8],
      tiltYs: [0, 6, 24, 4],
      twists: [0, 45, 180, 355],
      tangentialPressures: [0, 0.2, -0.25, 0],
      brushDynamics: ellipseDynamics("dry-media"),
      stroke: "#3a2218",
      strokeWidth: 9,
    });
    const first = exportPageToSvg(page([dynamic]));
    const second = exportPageToSvg(page([dynamic]));
    expect(first.svg).toBe(second.svg);
    expect((first.svg.match(/<ellipse /g) ?? []).length).toBeGreaterThan(3);
    expect(first.svg).toContain('fill="#3a2218"');
    expect(first.svg).toContain("transform=\"rotate(");
    expect(first.svg).toMatch(/opacity="0\.[0-9]+"/);
    expect(first.skipped).toEqual([]);
  });

  it("입자 브러시 — 획 투명도를 완성 그룹이 아니라 Canvas와 같은 각 dab에 적용한다", () => {
    const dynamic = rectEl({
      id: "dynamic-opacity",
      kind: "freehand",
      brush: "dry-media",
      points: [8, 12, 32, 18, 58, 10],
      pressures: [0.3, 0.8, 0.5],
      brushDynamics: ellipseDynamics("dry-media"),
      stroke: "#4455aa",
      strokeWidth: 22,
    });
    const full = exportPageToSvg(page([{ ...dynamic, opacity: 1 }])).svg;
    const half = exportPageToSvg(page([{ ...dynamic, opacity: 0.5 }])).svg;
    const dabOpacities = (svg: string) => Array.from(
      svg.matchAll(/<ellipse [^>]*opacity="([0-9.]+)"/g),
      (match) => Number(match[1])
    );
    const fullOpacities = dabOpacities(full);
    const halfOpacities = dabOpacities(half);
    expect(half).not.toContain('<g opacity="0.5">');
    expect(halfOpacities).toHaveLength(fullOpacities.length);
    expect(halfOpacities.length).toBeGreaterThan(2);
    halfOpacities.forEach((value, index) => {
      // 전용 opacity formatter는 6자리이므로 독립 반올림 오차만 허용한다.
      expect(Math.abs(value - fullOpacities[index]! * 0.5)).toBeLessThanOrEqual(0.000001);
    });
  });

  it("기본 에어브러시 — 필압 0·툴바 투명도 70%의 저농도 dab을 0으로 반올림하지 않는다", () => {
    const { svg } = exportPageToSvg(page([rectEl({
      id: "airbrush-low-alpha",
      kind: "freehand",
      brush: "airbrush",
      points: [10, 10],
      pressures: [0],
      stroke: "#336699",
      strokeWidth: 32,
      opacity: 0.7,
      // 타원 dab 경로로 고정해 저농도 opacity 포맷을 검증한다(텍스처 팁은 multi-circle).
      brushDynamics: ellipseDynamics("airbrush"),
    })]));

    // visible-tap default: opacity .65×.4, flow .48×.45, toolbar .7 = .039312.
    // 부동소수점의 마지막 반올림 방향과 무관하게 두 자리 좌표 포맷의 0이 아니라 실제
    // 저농도를 유지해야 한다.
    const serializedOpacity = Number(/<ellipse [^>]*opacity="([0-9.]+)"/.exec(svg)?.[1]);
    expect(serializedOpacity).toBeGreaterThan(0);
    expect(serializedOpacity).toBeCloseTo(0.65 * 0.4 * 0.48 * 0.45 * 0.7, 5);
    expect(svg).not.toContain('opacity="0"');
  });

  it("얇고 기울어진 드라이 미디어 — Canvas처럼 반지름 최소값 적용 뒤 roundness로 ry를 축소한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({
      id: "thin-dry-media",
      kind: "freehand",
      brush: "dry-media",
      points: [5, 7],
      pressures: [0],
      tiltXs: [90],
      tiltYs: [0],
      stroke: "#21160f",
      strokeWidth: 0.1,
      brushDynamics: ellipseDynamics("dry-media"),
    })]));

    // serializeDraw의 안전 최소 strokeWidth=1에서 dab radius는 .25, tilt roundness는 .112다.
    // Canvas geometry: ry=.25×.112=.028(SVG 좌표 포맷 .03), 독립 clamp라면 잘못된 .25가 된다.
    expect(svg).toMatch(/<ellipse [^>]*rx="0\.25" ry="0\.03"[^>]*transform="rotate\((?!0 )/);
    expect(svg).not.toMatch(/<ellipse [^>]*rx="0\.25" ry="0\.25"/);
  });

  it("PNG 알파 팁 스탬프 — grain tip과 커스텀 알파 맵을 결정적 circle stamp로 내보낸다", () => {
    const custom = studioBrushTipAlphaMapToBase64("hard", 0.2, 16);
    const stamped = rectEl({
      id: "tip-stamp-svg",
      kind: "freehand",
      brush: "dry-media",
      points: [0, 0, 40, 0],
      pressures: [0.6, 0.6],
      stroke: "#221100",
      strokeWidth: 10,
      brushDynamics: normalizeStudioBrushDynamicsSettings({
        ...studioBrushDynamicsPresetSettings("dry-media"),
        taper: { enabled: false },
        tip: {
          shape: "grain",
          softness: 0.35,
          alphaMapBase64: custom.alphaMapBase64,
          alphaMapSize: custom.alphaMapSize,
        },
        spacing: { base: 12, mappings: [] },
        scatter: { base: 0 },
      }),
    });
    const first = exportPageToSvg(page([stamped])).svg;
    const second = exportPageToSvg(page([stamped])).svg;
    expect(first).toBe(second);
    expect(first).not.toContain("<ellipse ");
    expect((first.match(/<circle /g) ?? []).length).toBeGreaterThan(4);
    expect(first).toContain('fill="#221100"');
  });

  it("입자 브러시 세로 대칭 — 원본 dab의 산포와 타원 축을 다시 추첨하지 않고 정확히 반사한다", () => {
    const dynamic = rectEl({
      id: "dynamic-vertical-affine",
      kind: "freehand",
      brush: "dry-media",
      points: [20, 30],
      pressures: [0.4],
      speeds: [0.9],
      tiltXs: [35],
      tiltYs: [20],
      stroke: "#352116",
      strokeWidth: 8,
      brushDynamics: ellipseDynamics("dry-media"),
      symmetry: { type: "vertical", centerX: 50, centerY: 50 },
    });
    const first = exportPageToSvg(page([dynamic])).svg;
    const second = exportPageToSvg(page([dynamic])).svg;
    const groups = dynamicEllipseGroups(first);
    expect(first).toBe(second);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);

    const original = groups[0]![0]!;
    const mirrored = groups[1]![0]!;
    const source = { x: 20, y: 30 };
    const mirroredSource = { x: 80, y: 30 };
    const scatter = { x: original.cx - source.x, y: original.cy - source.y };
    const mirroredScatter = {
      x: mirrored.cx - mirroredSource.x,
      y: mirrored.cy - mirroredSource.y,
    };
    expect(Math.hypot(scatter.x, scatter.y)).toBeGreaterThan(0.01);
    expectNear(mirrored.cx, 100 - original.cx);
    expectNear(mirrored.cy, original.cy);
    expectNear(mirroredScatter.x, -scatter.x);
    expectNear(mirroredScatter.y, scatter.y);
    expect(mirrored.rx).toBe(original.rx);
    expect(mirrored.ry).toBe(original.ry);
    const originalAxis = axisVector(original.angle);
    const mirroredAxis = axisVector(mirrored.angle);
    expectNear(mirroredAxis.x, -originalAxis.x, 0.001);
    expectNear(mirroredAxis.y, originalAxis.y, 0.001);
  });

  it("입자 브러시 방사 대칭 — 산포 중심과 타원 축을 원본에서 90도 회전한 affine 복제본으로 만든다", () => {
    const dynamic = rectEl({
      id: "dynamic-radial-affine",
      kind: "freehand",
      brush: "dry-media",
      points: [20, 30],
      pressures: [0.4],
      speeds: [0.9],
      tiltXs: [35],
      tiltYs: [20],
      stroke: "#352116",
      strokeWidth: 8,
      brushDynamics: ellipseDynamics("dry-media"),
      symmetry: { type: "radial", centerX: 50, centerY: 50, radialCount: 4 },
    });
    const first = exportPageToSvg(page([dynamic])).svg;
    const groups = dynamicEllipseGroups(first);
    expect(first).toBe(exportPageToSvg(page([dynamic])).svg);
    expect(groups).toHaveLength(4);
    const original = groups[0]![0]!;
    const quarterTurn = groups[1]![0]!;
    const scatter = { x: original.cx - 20, y: original.cy - 30 };
    const rotatedScatter = { x: quarterTurn.cx - 70, y: quarterTurn.cy - 20 };
    expectNear(quarterTurn.cx, 100 - original.cy);
    expectNear(quarterTurn.cy, original.cx);
    expectNear(rotatedScatter.x, -scatter.y);
    expectNear(rotatedScatter.y, scatter.x);
    expect(quarterTurn.rx).toBe(original.rx);
    expect(quarterTurn.ry).toBe(original.ry);
    const originalAxis = axisVector(original.angle);
    const rotatedAxis = axisVector(quarterTurn.angle);
    expectNear(rotatedAxis.x, -originalAxis.y, 0.001);
    expectNear(rotatedAxis.y, originalAxis.x, 0.001);
  });

  it("입자 브러시 만화경 대칭 — 회전군 뒤 반사군도 같은 산포·축의 결정적 affine 복제본이다", () => {
    const dynamic = rectEl({
      id: "dynamic-kaleidoscope-affine",
      kind: "freehand",
      brush: "dry-media",
      points: [20, 30],
      pressures: [0.4],
      speeds: [0.9],
      tiltXs: [35],
      tiltYs: [20],
      stroke: "#352116",
      strokeWidth: 8,
      brushDynamics: ellipseDynamics("dry-media"),
      symmetry: { type: "kaleidoscope", centerX: 50, centerY: 50, radialCount: 3 },
    });
    const first = exportPageToSvg(page([dynamic])).svg;
    const groups = dynamicEllipseGroups(first);
    expect(first).toBe(exportPageToSvg(page([dynamic])).svg);
    expect(groups).toHaveLength(6);
    const original = groups[0]![0]!;
    // N개 회전 뒤 첫 반사는 중심을 지나는 수평축(axisAngle=0) 기준이다.
    const reflected = groups[3]![0]!;
    const scatter = { x: original.cx - 20, y: original.cy - 30 };
    const reflectedScatter = { x: reflected.cx - 20, y: reflected.cy - 70 };
    expectNear(reflected.cx, original.cx);
    expectNear(reflected.cy, 100 - original.cy);
    expectNear(reflectedScatter.x, scatter.x);
    expectNear(reflectedScatter.y, -scatter.y);
    expect(reflected.rx).toBe(original.rx);
    expect(reflected.ry).toBe(original.ry);
    const originalAxis = axisVector(original.angle);
    const reflectedAxis = axisVector(reflected.angle);
    expectNear(reflectedAxis.x, originalAxis.x, 0.001);
    expectNear(reflectedAxis.y, -originalAxis.y, 0.001);
  });

  it("형광펜 — multiply 혼합과 사각 끝을 유지한다", () => {
    const hl = rectEl({ id: "h1", kind: "freehand", brush: "highlighter", points: [0, 0, 10, 0, 20, 10, 30, 30] });
    const { svg } = exportPageToSvg(page([hl]));
    expect(svg).toContain('stroke-linecap="square"');
    expect(svg).toContain("mix-blend-mode:multiply");
  });

  it("캘리그래피 — 포인트별 필압·틸트·회전을 가변 굵기 벡터 선분으로 보존한다", () => {
    const calligraphy = rectEl({
      id: "calligraphy-1",
      kind: "freehand",
      brush: "calligraphy",
      points: [0, 0, 20, 0, 40, 20, 40, 50],
      pressures: [0.2, 0.45, 0.7, 0.95],
      tiltXs: [40, 35, 20, 10],
      tiltYs: [0, 10, 25, 40],
      twists: [0, 15, 30, 45],
      brushTip: { tiltEnabled: true, angleDeg: -30, roundness: 0.24 },
      strokeWidth: 12,
    });
    const first = exportPageToSvg(page([calligraphy]));
    const second = exportPageToSvg(page([calligraphy]));
    expect(first.svg).toBe(second.svg);
    expect((first.svg.match(/stroke-linecap="round"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const widths = Array.from(first.svg.matchAll(/stroke-width="([0-9.]+)"/g), (match) => match[1]);
    expect(new Set(widths).size).toBeGreaterThan(1);
    expect(first.skipped).toEqual([]);
  });

  it("스크린톤 브러시 — 결정적 망점을 원(circle)으로 그대로 재현한다", () => {
    const tone = rectEl({ id: "st1", kind: "freehand", brush: "screentone", points: [0, 0, 40, 0], strokeWidth: 22 });
    const { svg } = exportPageToSvg(page([tone]));
    const expected = screentoneDotsForStroke([0, 0, 40, 0], 11, Math.max(3, 22 * 0.42)).length / 2;
    expect((svg.match(/<circle /g) ?? []).length).toBe(expected);
  });

  it("지우개 자국은 그리지 않고 skipped로 정직하게 집계한다", () => {
    const eraser = rectEl({ id: "e1", kind: "freehand", mode: "eraser", points: [0, 0, 10, 0, 20, 10] });
    const result = exportPageToSvg(page([eraser]));
    expect(result.svg).not.toContain("<path");
    expect(result.skipped).toEqual([{ id: "e1", type: "draw", mode: "skipped", label: "지우개 자국은 벡터로 재현할 수 없어 제외했어요." }]);
  });

  it("대칭 드로잉 — 세로 대칭이면 미러 사본까지 두 개를 그린다", () => {
    const sym = rectEl({ symmetry: { type: "vertical", centerX: 360, centerY: 0 } });
    const { svg } = exportPageToSvg(page([sym]));
    expect((svg.match(/<rect x="/g) ?? []).length).toBe(2);
    expect(svg).toContain('<rect x="610"'); // 360*2-110 = 610 (미러된 박스 왼쪽)
  });
});

// ---------------------------------------------------------------------------
// 그라데이션·패턴 defs — 우선순위: 패턴 > 그라데이션 > 단색
// ---------------------------------------------------------------------------

describe("그라데이션·패턴 채우기", () => {
  const gradient = { type: "linear" as const, angleDeg: 90, stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] };

  it("선형 그라데이션 — CSS 각도 규약 지오메트리를 userSpaceOnUse 좌표로 담는다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ gradient })]));
    expect(svg).toContain('gradientUnits="userSpaceOnUse" x1="10" y1="50" x2="110" y2="50"');
    expect(svg).toContain('<stop offset="0%" stop-color="#ff0000"/>');
    expect(svg).toMatch(/<rect [^>]*fill="url\(#sg\d+\)"/);
  });

  it("방사 그라데이션 — farthest-corner 반지름으로 radialGradient를 만든다", () => {
    const radial = { ...gradient, type: "radial" as const };
    const { svg } = exportPageToSvg(page([rectEl({ kind: "ellipse", gradient: radial })]));
    expect(svg).toMatch(/<radialGradient [^>]*cx="60" cy="50" r="58.31"/); // hypot(50,30)
  });

  it("패턴 — 타일 마크업을 defs <pattern>으로 임베드하고 노드 원점에 정렬한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ pattern: { patternId: "dots", fg: "#112233", scale: 2 } })]));
    expect(svg).toContain('patternUnits="userSpaceOnUse" width="32" height="32" patternTransform="translate(10 20)"');
    expect(svg).toContain('<circle cx="4" cy="4" r="2.2" fill="#112233"/>');
    expect(svg).toMatch(/<rect [^>]*fill="url\(#sp\d+\)"/);
  });

  it("패턴이 그라데이션보다 이긴다(캔버스 fillPriority 규약)", () => {
    const { svg } = exportPageToSvg(page([rectEl({ gradient, pattern: { patternId: "checker", fg: "#000000", scale: 1 } })]));
    expect(svg).toMatch(/<rect [^>]*fill="url\(#sp\d+\)"/);
    expect(svg).not.toContain("<linearGradient");
  });
});

// ---------------------------------------------------------------------------
// 텍스트 — 여러 줄/정렬/자간/이스케이프/그라데이션/곡선 텍스트/세로쓰기
// ---------------------------------------------------------------------------

describe("텍스트 직렬화", () => {
  it("여러 줄 텍스트 — 줄 중앙 배치(Konva 산식)와 가운데 정렬 anchor를 담는다", () => {
    const { svg } = exportPageToSvg(page([textEl()]));
    expect(svg).toContain('<g transform="translate(10 20)">');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('<tspan x="100" y="19.2">안녕</tspan>');
    expect(svg).toContain('<tspan x="100" y="43.2">웹툰</tspan>');
    expect(svg).toContain('letter-spacing="1"');
    expect(svg).toContain('font-family="Pretendard, sans-serif"');
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain('xml:space="preserve"');
  });

  it("XML 특수문자를 철저히 이스케이프한다", () => {
    const { svg } = exportPageToSvg(page([textEl({ text: `<b>&"quote"&'q'</b>`, align: "left" })]));
    expect(svg).toContain("&lt;b&gt;&amp;&quot;quote&quot;&amp;&apos;q&apos;&lt;/b&gt;");
    expect(svg).not.toContain("<b>");
  });

  it("SFX 외곽선 — stroke를 fill보다 먼저 칠한다(paint-order)", () => {
    const { svg } = exportPageToSvg(page([textEl({ stroke: "#000000", strokeWidth: 3 })]));
    expect(svg).toContain('stroke="#000000" stroke-width="3" paint-order="stroke"');
  });

  it("그라데이션 텍스트 — 레거시 2색 필드도 엔진 스펙으로 변환해 defs를 만든다", () => {
    const { svg } = exportPageToSvg(page([textEl({ text: "A", width: 100, fillType: "gradient", align: "left" })]));
    expect(svg).toContain('x1="50" y1="0" x2="50" y2="26"'); // vertical 180° · bbox 100×26
    expect(svg).toContain('stop-color="#ff3b30"');
    expect(svg).toContain('stop-color="#ffcc00"');
    expect(svg).toMatch(/<text [^>]*fill="url\(#sg\d+\)"/);
  });

  it("곡선 텍스트 — buildTextPathData 경로를 defs에 두고 textPath로 흘린다", () => {
    const { svg } = exportPageToSvg(page([textEl({ textPath: { shape: "arcUp", curve: 70 }, align: "center" })]));
    expect(svg).toMatch(/<path id="stp\d+" d="M 0 [^"]+" fill="none"\/>/);
    expect(svg).toMatch(/<textPath href="#stp\d+" startOffset="50%" text-anchor="middle">/);
  });

  it("세로쓰기 — formatVerticalText 열 재배열(우→좌)을 그대로 담는다", () => {
    const { svg } = exportPageToSvg(page([textEl({ text: "ab\ncd", vertical: true, align: "left" })]));
    expect(svg).toContain(">c  a</tspan>");
    expect(svg).toContain(">d  b</tspan>");
  });

  it("자동 줄바꿈이 필요한 긴 문장은 근사로 정직하게 고지한다", () => {
    const result = exportPageToSvg(page([textEl({ text: "가나다라마바사아자차카타파하", width: 100, align: "left" })]));
    expect(result.skipped.some((s) => s.id === "t1" && s.mode === "approximated" && s.label.includes("자동 줄바꿈"))).toBe(true);
  });

  it("그림자 — feDropShadow 필터(σ=blur/2)로 근사한다", () => {
    const { svg } = exportPageToSvg(
      page([textEl({ shadowColor: "#ff00ff", shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 3, shadowOpacity: 0.5 })])
    );
    expect(svg).toContain('<feDropShadow dx="2" dy="3" stdDeviation="5" flood-color="#ff00ff" flood-opacity="0.5"/>');
    expect(svg).toMatch(/<text [^>]*filter="url\(#sf\d+\)"/);
  });

  it("스티커 — Konva 기본값(Arial·검정)으로 텍스트 노드를 만든다", () => {
    const { svg } = exportPageToSvg(
      page([{ id: "s1", type: "sticker", text: "🔥", x: 30, y: 40, fontSize: 48, rotation: 15 }])
    );
    expect(svg).toContain('<g transform="translate(30 40) rotate(15)">');
    expect(svg).toContain('font-family="Arial"');
    expect(svg).toContain('fill="black"');
    expect(svg).toContain(">🔥</tspan>");
  });
});

// ---------------------------------------------------------------------------
// 말풍선 — bubblePathData 재사용/변형/테마
// ---------------------------------------------------------------------------

describe("말풍선 직렬화", () => {
  it("speech — 본체+꼬리 단일 path(bubblePathData)와 안쪽 텍스트를 담는다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl()]));
    const expected = bubblePathData(200, 120, 18, { direction: "bottom", ratio: 0.35, length: 30, base: 28.8, side: "center" });
    expect(svg).toContain(`<path d="${expected}" fill="#ffffff" stroke="#1f1a16" stroke-width="2.5"`);
    expect(svg).toContain('<tspan x="100" y="67.14">야!</tspan>');
    expect(svg).toContain('letter-spacing="0.3"');
  });

  it("speech — 편집한 꼬리 밑동과 곡률이 SVG path에 보존된다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ tailBase: 42, tailBend: 0.65 })]));
    const expected = bubblePathData(200, 120, 18, {
      direction: "bottom",
      ratio: 0.35,
      length: 30,
      base: 42,
      side: "center",
      bend: 0.65,
    });
    expect(svg).toContain(`<path d="${expected}"`);
  });

  it("double — 긴 대사를 위한 이중 로브와 주 꼬리를 단일 path로 내보낸다", () => {
    const el = bubbleEl({ variant: "double", width: 260, height: 170, tailBase: 38, tailBend: -0.4 });
    const { svg } = exportPageToSvg(page([el]));
    const expected = doubleBubblePathData(260, 170, {
      direction: "bottom",
      ratio: 0.35,
      length: 30,
      base: 38,
      side: "center",
      bend: -0.4,
    });
    expect(svg).toContain(`<path d="${expected}"`);
  });

  it("whisper — 점선(8 5) 외곽선으로 그린다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ variant: "whisper" })]));
    expect(svg).toContain('stroke-dasharray="8 5"');
  });

  it("shout — 20각 별을 path로 그린다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ variant: "shout" })]));
    // 본체는 transform scale 대신 좌표가 스케일된 단일 path.
    expect(svg).toMatch(/<path d="M [\d.]+ 0 L /);
    const d = /<path d="([^"]+)"/.exec(svg)?.[1] ?? "";
    // 20각 별 = 40개 꼭짓점 → L 명령이 충분히 많다.
    expect((d.match(/ L /g) ?? []).length).toBeGreaterThanOrEqual(38);
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("box — 테마별 모서리 반경(classic 4/vivid 3)을 반영한다", () => {
    const classic = exportPageToSvg(page([bubbleEl({ variant: "box" })]));
    const vivid = exportPageToSvg(page([bubbleEl({ variant: "box" })], { theme: "vivid" }));
    expect(classic.svg).toContain('rx="4"');
    expect(vivid.svg).toContain('rx="3"');
    expect(vivid.svg).toContain('stroke="#444444"');
  });

  it("thought — 타원 본체 + 꼬리 구름방울 3단을 그린다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ variant: "thought" })]));
    // thoughtBubbleBodyPath: 반경 (w/2, h/2) = (100, 60)
    expect(svg).toContain("A 100 60 0 1 1 100 120");
    expect((svg.match(/<ellipse /g) ?? []).length).toBe(3);
  });

  it("빈 대사면 텍스트 노드를 만들지 않는다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ text: "  " })]));
    expect(svg).not.toContain("<text");
  });
});

// ---------------------------------------------------------------------------
// 프레임·이미지
// ---------------------------------------------------------------------------

describe("프레임·이미지 직렬화", () => {
  it("프레임 — 클립 + 배경색 + 절반 인셋 테두리(점선 지원)를 담는다", () => {
    const { svg } = exportPageToSvg(
      page([{ id: "f1", type: "frame", x: 10, y: 10, width: 300, height: 200, bgColor: "#eeeeee", dashStyle: "dashed" }])
    );
    expect(svg).toMatch(/<clipPath id="sc\d+"><rect width="300" height="200"\/><\/clipPath>/);
    expect(svg).toContain('<rect width="300" height="200" fill="#eeeeee"/>');
    expect(svg).toContain('<rect x="1.5" y="1.5" width="297" height="197" rx="2.5" fill="none" stroke="#16100c" stroke-width="3" stroke-dasharray="10 5"/>');
    expect(svg).toMatch(/<g transform="translate\(10 10\)" clip-path="url\(#sc\d+\)">/);
  });

  it("사선(폴리곤) 프레임 — 폴리곤 클립·채움·테두리로 그린다", () => {
    const { svg } = exportPageToSvg(
      page([{ id: "f2", type: "frame", x: 0, y: 0, width: 300, height: 200, points: [0, 0, 300, 0, 280, 200, 20, 200] }])
    );
    expect(svg).toContain('<clipPath id="sc1"><polygon points="0,0 300,0 280,200 20,200"/></clipPath>');
    expect((svg.match(/<polygon points="0,0 300,0 280,200 20,200"/g) ?? []).length).toBe(3); // 클립+채움+테두리
  });

  it("프레임 배경 이미지 — cover-fit을 preserveAspectRatio slice로 재현하고 외부 URL은 고지한다", () => {
    const result = exportPageToSvg(
      page([{ id: "f3", type: "frame", x: 0, y: 0, width: 300, height: 200, bg: "https://cdn.example.com/bg.png" }])
    );
    expect(result.svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(result.skipped.some((s) => s.id === "f3" && s.mode === "approximated" && s.label.includes("외부 주소"))).toBe(true);
  });

  it("이미지 — 회전·기울이기·반전·둥근 모서리·그림자를 벡터 속성으로 담는다", () => {
    const result = exportPageToSvg(
      page([
        {
          id: "i1",
          type: "image",
          src: "data:image/png;base64,AAA",
          x: 1,
          y: 2,
          width: 100,
          height: 50,
          rotation: 45,
          opacity: 0.5,
          flipped: true,
          cornerRadius: 8,
          shadowColor: "#000000",
          shadowBlur: 10,
          shadowOffsetX: 2,
          shadowOffsetY: 3,
          shadowOpacity: 0.6,
          skewX: 30,
        },
      ])
    );
    expect(result.svg).toContain('transform="translate(1 2) rotate(45) matrix(1 0 0.58 1 0 0)"');
    expect(result.svg).toContain('opacity="0.5"');
    expect(result.svg).toMatch(/<clipPath id="sc\d+"><rect width="100" height="50" rx="8"\/><\/clipPath>/);
    expect(result.svg).toContain('<feDropShadow dx="2" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.6"/>');
    expect(result.svg).toContain('href="data:image/png;base64,AAA"');
    expect(result.svg).toContain('preserveAspectRatio="none" transform="translate(100 0) scale(-1 1)"');
    expect(result.skipped).toEqual([]); // data URL + 필터 없음 → 완전 벡터(고지 없음)
  });

  it("픽셀 필터가 있는 이미지는 원본으로 근사하고 정직하게 고지한다", () => {
    const result = exportPageToSvg(
      page([{ id: "i2", type: "image", src: "data:image/png;base64,AAA", x: 0, y: 0, width: 10, height: 10, rotation: 0, brightness: 0.4 }])
    );
    expect(result.skipped.some((s) => s.id === "i2" && s.label.includes("픽셀 필터"))).toBe(true);
  });

  it("외부 URL 이미지는 임베드가 아님을 고지한다", () => {
    const result = exportPageToSvg(
      page([{ id: "i3", type: "image", src: "https://cdn.example.com/a.png", x: 0, y: 0, width: 10, height: 10, rotation: 0 }])
    );
    expect(result.skipped.some((s) => s.id === "i3" && s.label.includes("외부 주소"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 집중선·속도선 — 시드 난수 재현
// ---------------------------------------------------------------------------

describe("집중선·속도선", () => {
  it("집중선 — lineCount만큼의 선을 시드 난수로 결정적으로 그린다", () => {
    const el: SvgExportEl = { id: "fl1", type: "focusLines", x: 5, y: 6, width: 400, height: 300, lineCount: 8, innerRadius: 50, outerRadius: 150, stroke: "#101010", strokeWidth: 2, noise: 10, rotation: 30 };
    const a = exportPageToSvg(page([el]));
    const b = exportPageToSvg(page([el]));
    expect(a.svg).toBe(b.svg);
    const d = /<path d="([^"]+)" fill="none" stroke="#101010"/.exec(a.svg)?.[1] ?? "";
    expect((d.match(/M /g) ?? []).length).toBe(8);
    expect(a.svg).toContain('transform="translate(5 6) rotate(30)"');
  });

  it("속도선 — 방향·개수를 유지하고 id가 다르면 배치도 달라진다", () => {
    const mk = (id: string): SvgExportEl => ({ id, type: "speedLines", x: 0, y: 0, width: 200, height: 100, lineCount: 5, direction: "horizontal", stroke: "#000000", strokeWidth: 2, rotation: 0 });
    const a = exportPageToSvg(page([mk("sl1")]));
    const b = exportPageToSvg(page([mk("sl2")]));
    const dA = /<path d="([^"]+)"/.exec(a.svg)?.[1] ?? "";
    expect((dA.match(/M /g) ?? []).length).toBe(5);
    expect(a.svg).not.toBe(b.svg);
  });
});

// ---------------------------------------------------------------------------
// 패널 클리핑·혼합 모드·아래로 클리핑
// ---------------------------------------------------------------------------

describe("레이어 규약(클립·혼합)", () => {
  const frame: SvgExportEl = { id: "f1", type: "frame", x: 0, y: 0, width: 300, height: 300 };

  it("패널 안 요소는 패널 rect로 클립된다(wrapClip 규약)", () => {
    const { svg } = exportPageToSvg(page([frame, textEl({ x: 50, y: 50, width: 100, align: "left" })]));
    expect((svg.match(/clip-path="url\(#/g) ?? []).length).toBe(2); // 프레임 자체 + 패널 클립
    expect(svg).toMatch(/<clipPath id="sc\d+"><rect x="0" y="0" width="300" height="300"\/><\/clipPath>/);
  });

  it("noClip 요소는 패널 클립을 받지 않는다", () => {
    const { svg } = exportPageToSvg(page([frame, textEl({ x: 50, y: 50, width: 100, align: "left", noClip: true })]));
    expect((svg.match(/clip-path="url\(#/g) ?? []).length).toBe(1); // 프레임 자체만
  });

  it("혼합 모드는 CSS mix-blend-mode로 매핑한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ blendMode: "multiply" })]));
    expect(svg).toContain('<g style="mix-blend-mode:multiply">');
  });

  it("표현 불가한 혼합 모드는 보통 합성으로 그리고 근사 고지한다", () => {
    const result = exportPageToSvg(page([rectEl({ blendMode: "destination-out" })]));
    expect(result.svg).not.toContain("mix-blend-mode");
    expect(result.skipped.some((s) => s.id === "d1" && s.label.includes("혼합 모드"))).toBe(true);
  });

  it("아래 레이어 클리핑(clipBelow)은 근사로 고지한다", () => {
    const result = exportPageToSvg(page([rectEl({ id: "base" }), rectEl({ id: "top", clipBelow: true })]));
    expect(result.skipped.some((s) => s.id === "top" && s.mode === "approximated" && s.label.includes("클리핑"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 결과 메타 — 글꼴/주의사항/메시지/파일명/MIME
// ---------------------------------------------------------------------------

describe("결과 메타·헬퍼", () => {
  it("사용 글꼴을 수집하고 임베드 불가 주의사항을 담는다", () => {
    const result = exportPageToSvg(page([textEl({ font: "Jua" }), bubbleEl()]));
    expect(result.fontFamilies).toContain("Jua");
    expect(result.fontFamilies).toContain("Pretendard, sans-serif");
    expect(result.caveats.some((c) => c.includes("글꼴"))).toBe(true);
  });

  it("도형만 있으면 글꼴 주의사항이 없다", () => {
    const result = exportPageToSvg(page([rectEl()]));
    expect(result.fontFamilies).toEqual([]);
    expect(result.caveats).toEqual([]);
  });

  it("svgExportResultMessage — 전부 벡터 보존/제외/근사를 정직하게 요약한다", () => {
    const clean = exportPageToSvg(page([rectEl()]));
    expect(svgExportResultMessage(clean)).toBe("SVG 저장 완료 — 요소 1개 벡터 변환 · 전부 벡터 보존");
    const mixed = exportPageToSvg(
      page([
        rectEl({ id: "e1", kind: "freehand", mode: "eraser", points: [0, 0, 10, 0, 20, 10] }),
        { id: "i2", type: "image", src: "data:image/png;base64,AAA", x: 0, y: 0, width: 10, height: 10, rotation: 0, brightness: 0.4 },
      ])
    );
    expect(svgExportResultMessage(mixed)).toBe("SVG 저장 완료 — 요소 2개 벡터 변환 · 제외 1개 · 근사 1개");
  });

  it("svgExportFileName — 래스터 내보내기와 같은 제목 규칙(.svg)", () => {
    expect(svgExportFileName("  ")).toBe("toonspectrum-comic.svg");
    expect(svgExportFileName(" 나의 웹툰 ")).toBe("나의 웹툰.svg");
  });

  it("escapeXml — 다섯 가지 특수문자를 전부 치환한다", () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
  });

  it("SVG MIME 타입을 노출한다(콜러 Blob 생성용)", () => {
    expect(SVG_EXPORT_MIME).toBe("image/svg+xml;charset=utf-8");
  });

  it("결과 타입 — 스킵 항목은 id/type/mode/label을 갖춘다", () => {
    const result: SvgExportResult = exportPageToSvg(page([rectEl({ id: "e1", kind: "freehand", mode: "eraser", points: [0, 0, 10, 0, 20, 10] })]));
    expect(result.skipped[0]).toMatchObject({ id: "e1", type: "draw", mode: "skipped" });
    expect(result.elementCount).toBe(1);
  });
});

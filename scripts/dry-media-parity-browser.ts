/**
 * Dry-media live/commit compositing parity probe — page entry.
 *
 * docs/reports/studio-dry-media-live-commit-parity-2026-08-22.md 가설 D의 결정 실험:
 * 동일 커버리지 마크 배열을 (A) 오버레이식 마크별 직접 적립과 (B) 커밋식
 * renderStudioDynamicBrushCoverage 타일 합성으로 각각 렌더해 픽셀 회수·세기를 비교한다.
 * 플래너 패리티는 studio-brush-carrier-quality.test.ts가 이미 보장하므로 마크는 한 번만
 * 계획해 양쪽에 같은 배열을 넣는다.
 *
 * 성공 기준은 "차이 없음"이 아니라 측정 자체다. 관측된 결함 서명(커밋 0.78×, 소실 입자
 * p50 23 vs 생존 33, >8 임계 가시 픽셀 -31%)과 대조하는 것이 목적이다.
 */

const WIDTH = 600;
const HEIGHT = 80;

interface ProbeMark {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angleRadians: number;
  readonly alpha: number;
  readonly color: string;
}

interface ProbeResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly markCount?: number;
  readonly a?: {
    readonly visiblePixels: number;
    readonly meanIntensity: number;
    readonly p50: number;
    readonly bounds: readonly [number, number, number, number];
  };
  readonly b?: ProbeResult["a"];
  readonly commonRatio?: number;
  readonly intensityRatioAtCommon?: number;
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

function measure(canvas: HTMLCanvasElement): ProbeResult["a"] {
  const context = canvas.getContext("2d", { alpha: true })!;
  const data = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  let visiblePixels = 0;
  let sum = 0;
  const intensities: number[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      // 흰 배경 위 가시 잉크 — 검증기와 같은 >8 감마 차분 임계.
      const r = data[(y * WIDTH + x) * 4]!;
      const g = data[(y * WIDTH + x) * 4 + 1]!;
      const b = data[(y * WIDTH + x) * 4 + 2]!;
      const intensity = Math.max(255 - r, 255 - g, 255 - b);
      if (intensity > 8) {
        visiblePixels += 1;
        sum += intensity;
        intensities.push(intensity);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  intensities.sort((a, b) => a - b);
  return {
    visiblePixels,
    meanIntensity: visiblePixels ? sum / visiblePixels : 0,
    p50: intensities.length ? intensities[Math.floor(intensities.length / 2)]! : 0,
    bounds: [minX, minY, maxX, maxY],
  };
}

export async function runDryMediaParityProbe(): Promise<ProbeResult> {
  try {
    const [
      { materializeStudioBrushCatalogSelection },
      { planStudioCausalDynamicBrushDepositSegmentsV3 },
      { resolveStudioDynamicBrushMaterialIdentity },
      { planStudioDynamicBrushCoverageMarks, renderStudioDynamicBrushCoverageMark, renderStudioDynamicBrushCoverage },
      { STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET },
    ] = await Promise.all([
      import("/src/domains/creator/brush/studio-brush-selection.ts"),
      import("/src/domains/creator/studio-causal-dynamic-brush-deposit-v2.ts"),
      import("/src/domains/creator/brush/studio-dry-media-dynamic-bridge.ts"),
      import("/src/domains/creator/studio-dynamic-brush-coverage-renderer.ts"),
      import("/src/domains/creator/brush/studio-brush-render-budget.ts"),
    ]);

    const selection = await materializeStudioBrushCatalogSelection("dry-media");
    if (!selection) return { ok: false, error: "dry-media selection unavailable" };

    // 검증기 루트와 동일한 거의 수평 왕복 스트로크(500px, 완만한 압력 변주).
    const points: number[] = [];
    const pressures: number[] = [];
    const speeds: number[] = [];
    for (let index = 0; index <= 60; index++) {
      const t = index / 60;
      points.push(40 + t * 500, 40 + Math.sin(t * Math.PI * 2) * 3);
      pressures.push(0.45 + 0.15 * Math.sin(t * Math.PI * 3));
      speeds.push(0.5);
    }
    const zeroes = new Array<number>(pressures.length).fill(0);
    const deposits = planStudioCausalDynamicBrushDepositSegmentsV3({
      points,
      pressures,
      speeds,
      tangentialPressures: zeroes,
      tiltXs: zeroes,
      tiltYs: zeroes,
      twists: zeroes,
      settings: selection.brushDynamics,
    });
    if (!deposits.ok) return { ok: false, error: `causal plan failed` };
    const segments = deposits.segments.map((segment) => segment.dabs);

    const materialIdentity = resolveStudioDynamicBrushMaterialIdentity(
      selection.runtimeBrushId,
      "dry-media",
    );
    if (!materialIdentity) return { ok: false, error: "material identity missing" };

    const planned = planStudioDynamicBrushCoverageMarks({
      dabVariations: [{
        kind: "studio-dynamic-brush-segmented-dab-variation",
        segments,
      }],
      dynamics: selection.brushDynamics,
      materialIdentity,
      dynamicSeed: selection.brushDynamics.seed,
      stroke: "#4b3628",
      stampGrid: 3,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    });
    if (!planned.ok) return { ok: false, error: "coverage plan failed" };
    const marks = planned.marks as readonly ProbeMark[];

    // 경로 A — 오버레이식: 마크별 직접 적립(active 캔버스), opacity 1.
    const canvasA = makeCanvas();
    const ctxA = canvasA.getContext("2d", { alpha: true })!;
    ctxA.fillStyle = "#ffffff";
    ctxA.fillRect(0, 0, WIDTH, HEIGHT);
    ctxA.save();
    for (const mark of marks) {
      renderStudioDynamicBrushCoverageMark(ctxA, mark);
    }
    ctxA.restore();

    // 경로 B — 커밋식: renderStudioDynamicBrushCoverage 단일 합성(opacity 1).
    const canvasB = makeCanvas();
    const ctxB = canvasB.getContext("2d", { alpha: true })!;
    ctxB.fillStyle = "#ffffff";
    ctxB.fillRect(0, 0, WIDTH, HEIGHT);
    ctxB.save();
    renderStudioDynamicBrushCoverage(ctxB, marks, {
      activeDraft: false,
      opacity: 1,
      committedCacheKey: "dry-media-parity-probe",
    });
    ctxB.restore();

    const a = measure(canvasA);
    const b = measure(canvasB);
    // 공통 픽셀 세기 비율 — 관측 결함의 0.78× 서명과 대조.
    const dataA = ctxA.getImageData(0, 0, WIDTH, HEIGHT).data;
    const dataB = ctxB.getImageData(0, 0, WIDTH, HEIGHT).data;
    let common = 0;
    let commonSumA = 0;
    let commonSumB = 0;
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
      const offset = pixel * 4;
      const ia = Math.max(
        255 - dataA[offset]!,
        255 - dataA[offset + 1]!,
        255 - dataA[offset + 2]!,
      );
      const ib = Math.max(
        255 - dataB[offset]!,
        255 - dataB[offset + 1]!,
        255 - dataB[offset + 2]!,
      );
      if (ia > 8 && ib > 8) {
        common += 1;
        commonSumA += ia;
        commonSumB += ib;
      }
    }
    return {
      ok: true,
      markCount: marks.length,
      a,
      b,
      commonRatio: b.visiblePixels / a.visiblePixels,
      intensityRatioAtCommon: common ? commonSumB / commonSumA : 0,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

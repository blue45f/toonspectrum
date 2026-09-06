from __future__ import annotations

import re
from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one marker, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def replace_regex(path: Path, pattern: str, replacement: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, found {count}")
    path.write_text(updated, encoding="utf-8")


verifier = Path("scripts/verify-studio-long-stroke.mts")
runner = Path("scripts/run-studio-all-brush-long-stroke-shard.mts")
aggregator = Path("scripts/aggregate-studio-all-brush-long-stroke.mts")

# ---------------------------------------------------------------------------
# Production-preview correctness, physical-GPU support, full live capture,
# and meaningful eraser evidence.
# ---------------------------------------------------------------------------
replace_once(
    verifier,
    '''const WEBGPU = process.env.TOONSPECTRUM_LONG_STROKE_WEBGPU === "1";
const HEADED = process.env.TOONSPECTRUM_LONG_STROKE_HEADED === "1";
const SCREEN_FILL_PATH = process.env.TOONSPECTRUM_LONG_STROKE_PATH === "screen-fill";
const SPAWN_PREVIEW = process.env.TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW === "1";''',
    '''const WEBGPU = process.env.TOONSPECTRUM_LONG_STROKE_WEBGPU === "1";
const FORCE_SWIFTSHADER =
  process.env.TOONSPECTRUM_LONG_STROKE_FORCE_SWIFTSHADER === "1";
const USE_DEV_MODULES =
  process.env.TOONSPECTRUM_LONG_STROKE_USE_DEV_MODULES === "1";
const HEADED = process.env.TOONSPECTRUM_LONG_STROKE_HEADED === "1";
const SCREEN_FILL_PATH = process.env.TOONSPECTRUM_LONG_STROKE_PATH === "screen-fill";
const SPAWN_PREVIEW = process.env.TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW === "1";''',
    "verifier runtime flags",
)

replace_once(
    verifier,
    ''' *   TOONSPECTRUM_LONG_STROKE_LONG_TASK_MAX   50ms 초과 longtask 허용 개수(기본 6 — 상수 주석 참고)
 *   TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW=1 vite preview 를 직접 띄운다(pnpm build 선행)
 *   TOONSPECTRUM_VERIFY_DIR                  산출물 루트(기본 os tmpdir) → <dir>/studio-long-stroke/report.json''',
    ''' *   TOONSPECTRUM_LONG_STROKE_LONG_TASK_MAX   50ms 초과 longtask 허용 개수(기본 6 — 상수 주석 참고)
 *   TOONSPECTRUM_LONG_STROKE_FORCE_SWIFTSHADER=1 진단용 software GPU를 강제한다. 실제 GPU 비교에서는 금지.
 *   TOONSPECTRUM_LONG_STROKE_USE_DEV_MODULES=1  /src 동적 import를 허용한다. production preview에서는 금지.
 *   TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW=1 vite preview 를 직접 띄운다(pnpm build 선행)
 *   TOONSPECTRUM_VERIFY_DIR                  산출물 루트(기본 os tmpdir) → <dir>/studio-long-stroke/report.json''',
    "verifier env documentation",
)

resolve_brush = r'''async function resolveBrush(page: Page): Promise<BrushChoice> {
  // Production artifacts intentionally expose no /src tree. Every matrix case passes exact
  // catalogue metadata through the environment, so use that source of truth before considering a
  // development-only dynamic import and never manufacture 404 console errors in a preview build.
  if (BRUSH_NAME_ENV) return {
    id: BRUSH_ID_ENV,
    name: BRUSH_NAME_ENV,
    width: Number.isFinite(BRUSH_WIDTH_ENV) && BRUSH_WIDTH_ENV > 0 ? BRUSH_WIDTH_ENV : 12,
    operation: BRUSH_OPERATION_ENV,
    source: "env",
  };
  const catalog = USE_DEV_MODULES
    ? await page.evaluate(async ({ wantedId, wantedName, modulePath }) => {
        try {
          const module = await import(/* @vite-ignore */ modulePath) as unknown as {
            STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS: ReadonlyArray<{
              id: string; name: string; defaultWidth: number; operation: "paint" | "erase";
            }>;
          };
          const items = module.STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS;
          const item = wantedId
            ? items.find((entry) => entry.id === wantedId) ?? null
            : wantedName
              ? items.find((entry) => entry.name === wantedName) ?? null
              : items.find((entry) => entry.operation === "paint") ?? null;
          return item ? {
            id: item.id,
            name: item.name,
            width: item.defaultWidth,
            operation: item.operation,
          } : null;
        } catch {
          return null;
        }
      }, {
        wantedId: BRUSH_ID_ENV,
        wantedName: BRUSH_NAME_ENV,
        modulePath: DEV_MODULES.catalog,
      })
    : null;
  if (catalog) return { ...catalog, source: "catalog" };
  const label = await page.locator('[data-studio-brush-active-pill="true"]').first()
    .getAttribute("aria-label").catch(() => null);
  return {
    id: null,
    name: null,
    width: 12,
    operation: "paint",
    source: `active-pill:${label ?? "unknown"}`,
  };
}
'''
replace_regex(
    verifier,
    r'''async function resolveBrush\(page: Page\): Promise<BrushChoice> \{.*?\n\}\n\n/\*\* pointermove''',
    resolve_brush + "\n/** pointermove",
    "verifier resolveBrush",
)

replace_once(
    verifier,
    '''async function readCommittedStroke(page: Page): Promise<CommittedStroke | null> {
  const deadline = Date.now() + COMMIT_READ_TIMEOUT_MS;''',
    '''async function readCommittedStroke(page: Page): Promise<CommittedStroke | null> {
  // Built previews have no /src module graph. Their explicit fallback is browser input delivery,
  // visual evidence, and commit stability; probing /src would only turn expected 404s into false
  // browser-quality failures.
  if (!USE_DEV_MODULES) return null;
  const deadline = Date.now() + COMMIT_READ_TIMEOUT_MS;''',
    "verifier committed preview fallback",
)

replace_once(
    verifier,
    '''        ...(WEBGPU ? [
          "--enable-unsafe-webgpu",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ] : ["--disable-features=WebGPU"]),''',
    '''        ...(WEBGPU ? [
          "--enable-unsafe-webgpu",
          ...(FORCE_SWIFTSHADER ? [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ] : []),
        ] : ["--disable-features=WebGPU"]),''',
    "verifier GPU launch flags",
)

primer_helper = r'''
const ERASER_PRIMER_BRUSH_NAME = "볼드 마커";
const ERASER_PRIMER_SAMPLE_FLOOR = 960;

/**
 * Erasers cannot be assessed on blank paper. Paint one deterministic, broad reference stroke on
 * the same route, wait for its commit, then re-select the target eraser. The baseline screenshot is
 * captured after priming, so every measured pixel is the target eraser's removal effect rather
 * than the primer's own appearance.
 */
async function primeEraserReference(
  page: Page,
  box: Box,
  targetBrushName: string,
): Promise<void> {
  await selectBrush(page, ERASER_PRIMER_BRUSH_NAME, "paint");
  await drawGesture(
    page,
    box,
    Math.max(ERASER_PRIMER_SAMPLE_FLOOR, Math.min(PARITY_SAMPLES, 1_200)),
  );
  await page.mouse.up({ button: "left" });
  await page.mouse.move(4, 4);
  await page.waitForTimeout(COMMIT_SETTLE_MS);
  await selectBrush(page, targetBrushName, "erase");
  await page.waitForTimeout(80);
}
'''
replace_once(
    verifier,
    '''async function shot(page: Page, clip: Box, name: string): Promise<string> {''',
    primer_helper + '''
async function shot(page: Page, clip: Box, name: string): Promise<string> {''',
    "verifier eraser primer helper",
)

replace_once(
    verifier,
    '''    await page.mouse.move(4, 4);
    await page.waitForTimeout(120);

    // 패스 A — 라이브 vs 커밋 (600 샘플). 커서 링이 diff 에 섞이지 않도록 up 뒤 마우스를 clip 밖으로 옮긴다.
    const blankShot = await shot(page, clip, "00-blank");''',
    '''    await page.mouse.move(4, 4);
    await page.waitForTimeout(120);

    let eraserPrimerCount = 0;
    if (brush.operation === "erase") {
      invariant(brush.name, "eraser matrix case has no target brush name");
      await primeEraserReference(page, box, brush.name);
      eraserPrimerCount += 1;
    }

    // 패스 A — 라이브 vs 커밋. 01-live is the complete pointer-down stroke used by the
    // texture/hand-feel analyzer; 01-live-half preserves the historical prefix/tail assertion.
    const blankShot = await shot(page, clip, "00-blank");''',
    "verifier eraser parity primer",
)

replace_once(
    verifier,
    '''    let liveShot = "";
    const dispatched = await drawGesture(page, box, PARITY_SAMPLES, async () => {
      surfaceEvidence = await sampleSurfaceEvidence(page, surfaceEvidence);
      liveShot = await shot(page, clip, "01-live");
    });
    await page.mouse.up({ button: "left" });''',
    '''    let halfLiveShot = "";
    const dispatched = await drawGesture(page, box, PARITY_SAMPLES, async () => {
      surfaceEvidence = await sampleSurfaceEvidence(page, surfaceEvidence);
      halfLiveShot = await shot(page, clip, "01-live-half");
    });
    const liveShot = await shot(page, clip, "01-live");
    await page.mouse.up({ button: "left" });''',
    "verifier complete live capture",
)

replace_once(
    verifier,
    '''    const liveDiff = await diffShots(page, liveShot, committedShot, regions);''',
    '''    const liveDiff = await diffShots(page, halfLiveShot, committedShot, regions);''',
    "verifier historical half-live diff",
)

replace_once(
    verifier,
    '''    const undoneA = await undoAll(page);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(300);
    const heapBefore = await heapUsed(page, cdp, true);''',
    '''    const undoneA = await undoAll(page);
    if (brush.operation === "erase") {
      invariant(brush.name, "eraser matrix case has no target brush name");
      await primeEraserReference(page, box, brush.name);
      eraserPrimerCount += 1;
    }
    await page.mouse.move(4, 4);
    await page.waitForTimeout(300);
    const heapBefore = await heapUsed(page, cdp, true);''',
    "verifier eraser performance primer",
)

replace_once(
    verifier,
    '''    report.surfaceEvidence = surfaceEvidence;
    report.perf = {''',
    '''    report.surfaceEvidence = surfaceEvidence;
    report.eraserPrimer = {
      applied: brush.operation === "erase",
      count: eraserPrimerCount,
      brushName: brush.operation === "erase" ? ERASER_PRIMER_BRUSH_NAME : null,
    };
    report.perf = {''',
    "verifier primer report",
)

# ---------------------------------------------------------------------------
# Shard runner: production preview never imports /src. Hosted GPU diagnostics
# can explicitly use SwiftShader while physical runs leave the real adapter.
# ---------------------------------------------------------------------------
replace_once(
    runner,
    '''          TOONSPECTRUM_LONG_STROKE_WEBGPU: MODE === "gpu" ? "1" : "0",
          TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW: "0",''',
    '''          TOONSPECTRUM_LONG_STROKE_WEBGPU: MODE === "gpu" ? "1" : "0",
          TOONSPECTRUM_LONG_STROKE_FORCE_SWIFTSHADER:
            process.env.TOONSPECTRUM_LONG_STROKE_FORCE_SWIFTSHADER ?? "0",
          TOONSPECTRUM_LONG_STROKE_USE_DEV_MODULES: "0",
          TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW: "0",''',
    "shard preview/GPU environment",
)

# ---------------------------------------------------------------------------
# Aggregator: use the repository's mature media-aware quality analyzer for
# texture, edge, centerline, width, periodicity and live→commit continuity.
# ---------------------------------------------------------------------------
replace_once(
    aggregator,
    '''import {
  classifyStudioLongBrushQualityPolicy,
} from "./studio-brush-long-matrix-quality";''',
    '''import {
  analyzeStudioLongBrushQuality,
  classifyStudioLongBrushQualityPolicy,
  type StudioLongBrushQualityPolicy,
  type StudioLongBrushQualityResult,
} from "./studio-brush-long-matrix-quality";''',
    "aggregator media quality imports",
)

replace_once(
    aggregator,
    '''    const delta = Math.max(
      Math.abs((baselineCommitted.data[a] ?? 0) - (gpuCommitted.data[b] ?? 0)),
      Math.abs((baselineCommitted.data[a + 1] ?? 0) - (gpuCommitted.data[b + 1] ?? 0)),
      Math.abs((baselineCommitted.data[a + 2] ?? 0) - (gpuCommitted.data[b + 2] ?? 0)),
    );''',
    '''    // Compare the operation's effect against each mode's own blank, not the absolute
    // committed screenshots. This is required for erasers, whose deterministic primer belongs to
    // the baseline, and also prevents compositor/background noise from masquerading as brush ink.
    const delta = Math.abs((baseline.field[pixel] ?? 0) - (gpu.field[pixel] ?? 0));''',
    "aggregator delta-relative cross-engine comparison",
)

quality_evidence = r'''function qualityEvidence(
  report: LongStrokeReport | null,
  analysis: DeltaAnalysis | null,
  mediaQuality: StudioLongBrushQualityResult | null,
): StudioBrushLongStrokeQualityEvidence {
  const browserErrors = report?.browserErrors;
  const errorCount = (browserErrors?.console?.length ?? 0)
    + (browserErrors?.page?.length ?? 0)
    + finite(browserErrors?.unhandledRejections);
  const surface = report?.surfaceEvidence;
  const liveToReleased = mediaQuality?.transitions.liveToReleased;
  const releasedToSettled = mediaQuality?.transitions.releasedToSettled;
  const settled = mediaQuality?.frames.settled;
  return {
    measured: Boolean(report && analysis && mediaQuality && !report.fatal),
    ownQualityPassed: mediaQuality?.ok === true,
    browserErrorCount: errorCount,
    refusedStrokeCount: finite(surface?.refusedStrokeNotices),
    gpuSurfaceObserved: surface?.gpuEverActive === true
      && surface?.gpuEverAuthorized === true
      && (surface.gpuSurfaceKinds?.length ?? 0) > 0,
    liveToCommittedChangedRatio: liveToReleased?.perPixelDifferenceRatio ?? 1,
    committedToSettledChangedRatio: releasedToSettled?.perPixelDifferenceRatio ?? 1,
    centerlineCoverage: settled?.centerlineCoverage ?? 0,
    visiblePixels: settled?.visiblePixels ?? analysis?.visiblePixels ?? 0,
    inkEnergy: settled?.inkEnergy ?? analysis?.inkEnergy ?? 0,
    edgeDensity: settled?.edgeDensity ?? analysis?.edgeDensity ?? 0,
  };
}
'''
replace_regex(
    aggregator,
    r'''function qualityEvidence\(.*?\n\}\n\nfunction gpuExecutionEvidence''',
    quality_evidence + "\nfunction gpuExecutionEvidence",
    "aggregator media-aware quality evidence",
)

resolved_policy = r'''interface ResolvedQualityPolicy {
  readonly election: StudioBrushGpuQualityPolicyKind;
  readonly analysis: StudioLongBrushQualityPolicy;
}

async function qualityPolicy(item: StudioBrushCatalogItem): Promise<ResolvedQualityPolicy> {
  if (item.operation === "erase") {
    return {
      election: "eraser",
      analysis: {
        kind: "strict-continuous",
        reason: "eraser removal geometry is measured against a deterministic primed stroke",
      },
    };
  }
  const selection = await materializeStudioBrushCatalogSelection(item.id);
  if (!selection) {
    return {
      election: "record-only-transparent",
      analysis: {
        kind: "record-only-transparent",
        reason: "catalogue selection could not be materialized",
      },
    };
  }
  const descriptor = studioBrushPackDescriptorById(item.id);
  const dryMedia = classifyStudioDryMediaCatalogIdV1(item.id);
  const intentionalDiscrete = dryMedia
    ? dryMedia.kind === "intentional-discrete"
    : descriptor
      ? studioBrushPresetUsesIntentionalDiscreteCarrier(descriptor)
      : studioCc0MypaintPresetUsesIntentionalDiscreteCarrier(item.id);
  const analysis = classifyStudioLongBrushQualityPolicy({
    id: item.id,
    source: item.source,
    runtimeBrushId: selection.runtimeBrushId,
    mediaGroup: item.mediaGroup,
    previewStyle: item.previewStyle,
    intentionalDiscrete,
    depositsPigment: studioWetInkBrushDepositsPigment(selection.runtimeBrushId),
  });
  return { election: analysis.kind, analysis };
}

function analyzeMediaQuality(
  located: LocatedCase,
  item: StudioBrushCatalogItem,
  policy: StudioLongBrushQualityPolicy,
  frames: Readonly<{
    blank: DecodedImage;
    live: DecodedImage;
    committed: DecodedImage;
    settled: DecodedImage;
  }>,
): StudioLongBrushQualityResult {
  const points = located.report?.paper?.localPathPoints ?? [];
  invariant(points.length >= 2, `${item.id}: quality route has fewer than two points`);
  const nominalWidth = Math.max(1, finite(located.report?.brush?.width, item.defaultWidth));
  return analyzeStudioLongBrushQuality({
    policy,
    baseline: frames.blank,
    live: frames.live,
    released: frames.committed,
    settled: frames.settled,
    route: {
      points,
      crossSectionRadius: Math.max(8, nominalWidth * 2.5),
      // The browser cursor remains at the endpoint while the complete live frame is captured.
      // Ignore only that local UI affordance; every other pixel and route sample remains measured.
      cursorIgnoreRadius: Math.max(24, nominalWidth * 2),
      nominalWidth,
    },
    pixelTolerance: PIXEL_THRESHOLD,
  });
}
'''
replace_regex(
    aggregator,
    r'''async function qualityPolicy\(item: StudioBrushCatalogItem\): Promise<StudioBrushGpuQualityPolicyKind> \{.*?\n\}\n\nfunction generatedEvidenceSource''',
    resolved_policy + "\nfunction generatedEvidenceSource",
    "aggregator resolved policy and analyzer",
)

replace_once(
    aggregator,
    '''    let baselineAnalysis: DeltaAnalysis | null = null;
    let gpuAnalysis: DeltaAnalysis | null = null;
    let cross: StudioBrushCrossEngineQualityEvidence = {''',
    '''    const policy = await qualityPolicy(item);
    let baselineAnalysis: DeltaAnalysis | null = null;
    let gpuAnalysis: DeltaAnalysis | null = null;
    let baselineMediaQuality: StudioLongBrushQualityResult | null = null;
    let gpuMediaQuality: StudioLongBrushQualityResult | null = null;
    let cross: StudioBrushCrossEngineQualityEvidence = {''',
    "aggregator policy before image analysis",
)

replace_once(
    aggregator,
    '''      const baselineBlank = decode(baseline.imagePaths.blank);
      const baselineCommitted = decode(baseline.imagePaths.committed);
      const gpuBlank = decode(gpu.imagePaths.blank);
      const gpuCommitted = decode(gpu.imagePaths.committed);
      baselineAnalysis = deltaAnalysis(baselineBlank, baselineCommitted);
      gpuAnalysis = deltaAnalysis(gpuBlank, gpuCommitted);
      cross = crossEngineQuality(
        baselineAnalysis,
        gpuAnalysis,
        baselineCommitted,
        gpuCommitted,
      );''',
    '''      const baselineFrames = {
        blank: decode(baseline.imagePaths.blank),
        live: decode(baseline.imagePaths.live),
        committed: decode(baseline.imagePaths.committed),
        settled: decode(baseline.imagePaths.settled),
      };
      const gpuFrames = {
        blank: decode(gpu.imagePaths.blank),
        live: decode(gpu.imagePaths.live),
        committed: decode(gpu.imagePaths.committed),
        settled: decode(gpu.imagePaths.settled),
      };
      baselineAnalysis = deltaAnalysis(baselineFrames.blank, baselineFrames.committed);
      gpuAnalysis = deltaAnalysis(gpuFrames.blank, gpuFrames.committed);
      baselineMediaQuality = analyzeMediaQuality(
        baseline,
        item,
        policy.analysis,
        baselineFrames,
      );
      gpuMediaQuality = analyzeMediaQuality(
        gpu,
        item,
        policy.analysis,
        gpuFrames,
      );
      cross = crossEngineQuality(
        baselineAnalysis,
        gpuAnalysis,
        baselineFrames.committed,
        gpuFrames.committed,
      );''',
    "aggregator complete-frame media analysis",
)

replace_once(
    aggregator,
    '''    const policy = await qualityPolicy(item);
    const election = electStudioBrushGpuQuality({
      brushId: item.id,
      policy,
      baseline: {
        quality: qualityEvidence(baseline.report, baselineAnalysis),''',
    '''    const election = electStudioBrushGpuQuality({
      brushId: item.id,
      policy: policy.election,
      baseline: {
        quality: qualityEvidence(baseline.report, baselineAnalysis, baselineMediaQuality),''',
    "aggregator election policy/baseline",
)

replace_once(
    aggregator,
    '''      gpu: {
        quality: qualityEvidence(gpu.report, gpuAnalysis),''',
    '''      gpu: {
        quality: qualityEvidence(gpu.report, gpuAnalysis, gpuMediaQuality),''',
    "aggregator GPU quality evidence",
)

replace_once(
    aggregator,
    '''      policy,
      baseline: {
        verifierOk: baseline.report?.ok ?? false,
        quality: qualityEvidence(baseline.report, baselineAnalysis),''',
    '''      policy: policy.election,
      analysisPolicy: policy.analysis,
      baseline: {
        verifierOk: baseline.report?.ok ?? false,
        quality: qualityEvidence(
          baseline.report,
          baselineAnalysis,
          baselineMediaQuality,
        ),
        mediaQuality: baselineMediaQuality,''',
    "aggregator report baseline details",
)

replace_once(
    aggregator,
    '''      gpu: {
        verifierOk: gpu.report?.ok ?? false,
        quality: qualityEvidence(gpu.report, gpuAnalysis),
        performance: performanceEvidence(gpu.report),''',
    '''      gpu: {
        verifierOk: gpu.report?.ok ?? false,
        quality: qualityEvidence(gpu.report, gpuAnalysis, gpuMediaQuality),
        mediaQuality: gpuMediaQuality,
        performance: performanceEvidence(gpu.report),''',
    "aggregator report GPU details",
)

replace_once(
    aggregator,
    '''    `- 기존 경로 유지: ${rejected.length}`,
    `- 증거 다이제스트: \\`${benchmarkDigest}\\``,''',
    '''    `- 기존 경로 유지: ${rejected.length}`,
    `- baseline 미디어 품질 실패: ${cases.filter((entry) => entry.baseline.mediaQuality?.ok !== true).length}`,
    `- GPU 미디어 품질 실패: ${cases.filter((entry) => entry.gpu.mediaQuality?.ok !== true).length}`,
    `- 증거 다이제스트: \\`${benchmarkDigest}\\``,''',
    "aggregator markdown quality counts",
)

print("Applied all-brush quality-first v3 hardening")

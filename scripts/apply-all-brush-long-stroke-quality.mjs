import { readFileSync, rmSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`missing patch target: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`ambiguous patch target: ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceSection(source, start, end, replacement, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`missing section start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`missing section end: ${label}`);
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

const verifierPath = "scripts/verify-studio-long-stroke.mts";
let verifier = readFileSync(verifierPath, "utf8");

verifier = replaceOnce(
  verifier,
  `const BRUSH_NAME_ENV = process.env.TOONSPECTRUM_LONG_STROKE_BRUSH?.trim() || null;\nconst DEVICE_SCALE_FACTOR = Number(process.env.TOONSPECTRUM_LONG_STROKE_DPR ?? "1") || 1;\nconst WEBGPU = process.env.TOONSPECTRUM_LONG_STROKE_WEBGPU === "1";\nconst SPAWN_PREVIEW = process.env.TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW === "1";`,
  `const BRUSH_NAME_ENV = process.env.TOONSPECTRUM_LONG_STROKE_BRUSH?.trim() || null;\nconst BRUSH_ID_ENV = process.env.TOONSPECTRUM_LONG_STROKE_BRUSH_ID?.trim() || null;\nconst BRUSH_OPERATION_ENV = process.env.TOONSPECTRUM_LONG_STROKE_OPERATION === "erase"\n  ? "erase" as const\n  : "paint" as const;\nconst BRUSH_WIDTH_ENV = Number(process.env.TOONSPECTRUM_LONG_STROKE_BRUSH_WIDTH ?? "");\nconst DEVICE_SCALE_FACTOR = Number(process.env.TOONSPECTRUM_LONG_STROKE_DPR ?? "1") || 1;\nconst WEBGPU = process.env.TOONSPECTRUM_LONG_STROKE_WEBGPU === "1";\nconst HEADED = process.env.TOONSPECTRUM_LONG_STROKE_HEADED === "1";\nconst SCREEN_FILL_PATH = process.env.TOONSPECTRUM_LONG_STROKE_PATH === "screen-fill";\nconst SPAWN_PREVIEW = process.env.TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW === "1";`,
  "long-stroke environment",
);
verifier = replaceOnce(
  verifier,
  `const PERF_SAMPLES = 3_200; // 성능 패스 샘플 수(probe-studio-brush-sweep LONG_SAMPLES 와 동일)\nconst PARITY_SAMPLES = 600; // 라이브/커밋 패리티 패스 샘플 수`,
  `const PERF_SAMPLES = Number(process.env.TOONSPECTRUM_LONG_STROKE_PERF_SAMPLES ?? "3200") || 3_200;\nconst PARITY_SAMPLES = Number(process.env.TOONSPECTRUM_LONG_STROKE_PARITY_SAMPLES ?? "1200") || 1_200;\nconst GESTURE_BATCHES = SCREEN_FILL_PATH ? 48 : 20;`,
  "sample counts",
);
verifier = replaceOnce(
  verifier,
  `interface PerfSampling {\n  readonly frameCount: number; readonly p50: number; readonly p95: number; readonly max: number;\n  readonly longTaskCount: number; readonly longTaskTotalMs: number;\n}`,
  `interface PerfSampling {\n  readonly frameCount: number; readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number;\n  readonly longTaskCount: number; readonly longTaskTotalMs: number;\n}`,
  "perf sampling type",
);
verifier = replaceOnce(
  verifier,
  `interface BrushChoice { readonly name: string | null; readonly width: number; readonly source: string }`,
  `interface BrushChoice {\n  readonly id: string | null;\n  readonly name: string | null;\n  readonly width: number;\n  readonly operation: "paint" | "erase";\n  readonly source: string;\n}\ninterface SurfaceEvidence {\n  readonly gpuEverActive: boolean;\n  readonly gpuEverAuthorized: boolean;\n  readonly gpuSurfaceKinds: readonly string[];\n  readonly refusedStrokeNotices: number;\n}`,
  "brush and surface evidence types",
);

verifier = replaceSection(
  verifier,
  `/** 'b' 로 그리기 도구를 켠다`,
  `/** pointermove(캡처)·unhandledrejection 카운터`,
  `/** 브러시 작업 모드를 켠다. */\nasync function activateBrushOperation(\n  page: Page,\n  operation: "paint" | "erase",\n): Promise<void> {\n  const expectedMode = operation === "erase" ? "eraser" : "pen";\n  const active = (): Promise<boolean> => page.evaluate((mode) => document\n    .querySelector('[data-studio-draw-options="true"]')\n    ?.getAttribute("data-studio-active-draw-mode") === mode, expectedMode);\n  for (let attempt = 0; attempt < 3; attempt += 1) {\n    if (attempt === 0) await page.keyboard.press(operation === "erase" ? "e" : "b");\n    else {\n      const toolbar = page.getByRole("toolbar", { name: /그리기 옵션/u });\n      await toolbar.getByRole("button", {\n        name: operation === "erase" ? "지우개" : "펜",\n        exact: true,\n      }).click({ timeout: 3_000 }).catch(() => undefined);\n    }\n    const deadline = Date.now() + 5_000;\n    while (Date.now() < deadline) {\n      if (await active()) return;\n      await page.waitForTimeout(100);\n    }\n  }\n  throw new Error(\`${operation} tool never activated; dom=\${await domSummary(page)}\`);\n}\n\n/** 데스크톱 전체 카탈로그에서 정확한 브러시를 선택한다. */\nasync function selectBrush(\n  page: Page,\n  name: string,\n  operation: "paint" | "erase",\n): Promise<void> {\n  await activateBrushOperation(page, operation);\n  const toolbar = page.locator('[data-studio-draw-options="true"]');\n  let pill = toolbar.locator('[data-studio-brush-active-pill="true"]');\n  if (await pill.count() === 0) {\n    await toolbar.getByRole("button", {\n      name: operation === "erase" ? "지우개" : "펜",\n      exact: true,\n    }).click();\n    pill = toolbar.locator('[data-studio-brush-active-pill="true"]');\n  }\n  await pill.waitFor({ state: "visible", timeout: 10_000 });\n  await pill.click();\n  const catalog = page.locator('[data-studio-brush-catalog-session="true"]');\n  await catalog.waitFor({ state: "visible", timeout: 15_000 });\n  await catalog.getByRole("tab", { name: "전체", exact: true }).click();\n  await catalog.getByRole("searchbox").fill(name);\n  const option = catalog.getByRole("button", { name: \`\${name} 선택\`, exact: true });\n  await option.waitFor({ state: "visible", timeout: 15_000 });\n  await option.scrollIntoViewIfNeeded();\n  await option.click({ force: true });\n  await catalog.waitFor({ state: "detached" }).catch(() => undefined);\n  await page.waitForFunction(\n    (expected) => document.querySelector('[data-studio-brush-active-pill="true"]')\n      ?.getAttribute("aria-label")?.includes(expected) === true,\n    name,\n    { timeout: 15_000 },\n  );\n}\n\n/** 브러시 결정: env → dev 서버 전체 카탈로그 → preview env fallback. */\nasync function resolveBrush(page: Page): Promise<BrushChoice> {\n  const catalog = await page.evaluate(async ({ wantedId, wantedName, modulePath }) => {\n    try {\n      const module = await import(/* @vite-ignore */ modulePath) as unknown as {\n        STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS: ReadonlyArray<{\n          id: string; name: string; defaultWidth: number; operation: "paint" | "erase";\n        }>;\n      };\n      const items = module.STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS;\n      const item = wantedId\n        ? items.find((entry) => entry.id === wantedId) ?? null\n        : wantedName\n          ? items.find((entry) => entry.name === wantedName) ?? null\n          : items.find((entry) => entry.operation === "paint") ?? null;\n      return item ? {\n        id: item.id,\n        name: item.name,\n        width: item.defaultWidth,\n        operation: item.operation,\n      } : null;\n    } catch {\n      return null;\n    }\n  }, { wantedId: BRUSH_ID_ENV, wantedName: BRUSH_NAME_ENV, modulePath: DEV_MODULES.catalog });\n  if (catalog) return { ...catalog, source: "catalog" };\n  if (BRUSH_NAME_ENV) return {\n    id: BRUSH_ID_ENV,\n    name: BRUSH_NAME_ENV,\n    width: Number.isFinite(BRUSH_WIDTH_ENV) && BRUSH_WIDTH_ENV > 0 ? BRUSH_WIDTH_ENV : 12,\n    operation: BRUSH_OPERATION_ENV,\n    source: "env",\n  };\n  const label = await page.locator('[data-studio-brush-active-pill="true"]').first()\n    .getAttribute("aria-label").catch(() => null);\n  return {\n    id: null,\n    name: null,\n    width: 12,\n    operation: "paint",\n    source: \`active-pill:\${label ?? "unknown"}\`,\n  };\n}\n\n`,
  "operation-aware brush selection",
);

verifier = replaceOnce(
  verifier,
  `      frameCount: frames.length, p50: pick(0.5), p95: pick(0.95), max: frames.at(-1) ?? 0,`,
  `      frameCount: frames.length, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: frames.at(-1) ?? 0,`,
  "p99 sampling",
);

verifier = replaceSection(
  verifier,
  `/**\n * 제스처 경로`,
  `/** 뷰포트 CSS 사각형`,
  `/** 화면 충전 모드는 노출된 종이를 5회 왕복해 긴 선·회전·곡률을 한 획에서 함께 압박한다. */\nfunction screenFillControlPoints(box: Box): readonly Point[] {\n  const left = box.x + box.width * 0.08;\n  const right = box.x + box.width * 0.92;\n  const top = box.y + box.height * 0.12;\n  const bottom = box.y + box.height * 0.82;\n  const rows = 5;\n  const points: Point[] = [];\n  for (let row = 0; row < rows; row += 1) {\n    const y = top + (bottom - top) * row / (rows - 1);\n    const startX = row % 2 === 0 ? left : right;\n    const endX = row % 2 === 0 ? right : left;\n    if (row === 0) points.push({ x: startX, y });\n    points.push({ x: endX, y });\n    if (row + 1 < rows) {\n      const nextY = top + (bottom - top) * (row + 1) / (rows - 1);\n      points.push({ x: endX, y: nextY });\n    }\n  }\n  return points;\n}\n\nfunction pointOnPolyline(points: readonly Point[], amount: number): Point {\n  const lengths: number[] = [];\n  let total = 0;\n  for (let index = 1; index < points.length; index += 1) {\n    const length = Math.hypot(\n      points[index]!.x - points[index - 1]!.x,\n      points[index]!.y - points[index - 1]!.y,\n    );\n    lengths.push(length);\n    total += length;\n  }\n  let target = Math.max(0, Math.min(1, amount)) * total;\n  for (let index = 0; index < lengths.length; index += 1) {\n    const length = lengths[index]!;\n    if (target <= length || index === lengths.length - 1) {\n      const from = points[index]!;\n      const to = points[index + 1]!;\n      const local = length > 0 ? target / length : 0;\n      return { x: from.x + (to.x - from.x) * local, y: from.y + (to.y - from.y) * local };\n    }\n    target -= length;\n  }\n  return points.at(-1)!;\n}\n\nfunction gesturePoint(box: Box, t: number): Point {\n  if (SCREEN_FILL_PATH) return pointOnPolyline(screenFillControlPoints(box), t);\n  return {\n    x: box.x + box.width * (0.12 + 0.5 * t),\n    y: box.y + box.height * (0.2 + 0.42 * t) - Math.sin(t * Math.PI) * box.height * 0.12,\n  };\n}\n\nfunction gesturePolylineLength(box: Box, batches = GESTURE_BATCHES): number {\n  let total = 0;\n  for (let batch = 1; batch <= batches; batch += 1) {\n    const from = gesturePoint(box, (batch - 1) / batches);\n    const to = gesturePoint(box, batch / batches);\n    total += Math.hypot(to.x - from.x, to.y - from.y);\n  }\n  return total;\n}\n\nfunction pathBounds(box: Box, t0: number, t1: number, pad: number): Box {\n  const samples = SCREEN_FILL_PATH ? 201 : 51;\n  const points = Array.from({ length: samples }, (_, index) =>\n    gesturePoint(box, t0 + ((t1 - t0) * index) / Math.max(1, samples - 1)));\n  const left = Math.min(...points.map((point) => point.x)) - pad;\n  const top = Math.min(...points.map((point) => point.y)) - pad;\n  return {\n    x: left, y: top,\n    width: Math.max(...points.map((point) => point.x)) + pad - left,\n    height: Math.max(...points.map((point) => point.y)) + pad - top,\n  };\n}\n\n`,
  "screen-fill gesture",
);
verifier = replaceOnce(
  verifier,
  `  const batches = 20;`,
  `  const batches = GESTURE_BATCHES;`,
  "gesture batches",
);

verifier = replaceOnce(
  verifier,
  `async function collectPerfSampling(page: Page): Promise<PerfSampling> {`,
  `async function sampleSurfaceEvidence(\n  page: Page,\n  previous: SurfaceEvidence,\n): Promise<SurfaceEvidence> {\n  const current = await page.evaluate(() => {\n    const compositor = document.querySelector('[data-studio-gpu-compositor="true"]');\n    const gpuSurfaceKinds = Array.from(document.querySelectorAll('[data-studio-gpu-surface]'))\n      .map((node) => node.getAttribute("data-studio-gpu-surface") ?? "")\n      .filter(Boolean);\n    const noticeText = Array.from(document.querySelectorAll(\n      '[role="alert"], [data-studio-rejected-stroke], [data-studio-live-ink-unavailable]',\n    )).map((node) => node.textContent ?? "").join("\\n");\n    return {\n      gpuActive: compositor?.getAttribute("data-studio-gpu-active") === "true",\n      gpuAuthorized: compositor?.getAttribute("data-studio-gpu-frame-authorized") === "true",\n      gpuSurfaceKinds,\n      refusedStrokeNotices: (noticeText.match(/선택 거부 사유|stroke refused|획 복구/giu) ?? []).length,\n    };\n  });\n  return {\n    gpuEverActive: previous.gpuEverActive || current.gpuActive,\n    gpuEverAuthorized: previous.gpuEverAuthorized || current.gpuAuthorized,\n    gpuSurfaceKinds: Object.freeze([...new Set([\n      ...previous.gpuSurfaceKinds,\n      ...current.gpuSurfaceKinds,\n    ])].sort()),\n    refusedStrokeNotices: Math.max(previous.refusedStrokeNotices, current.refusedStrokeNotices),\n  };\n}\n\nasync function collectPerfSampling(page: Page): Promise<PerfSampling> {`,
  "surface evidence sampler",
);

verifier = replaceOnce(
  verifier,
  `    studioUrl, viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR, webgpuFlag: WEBGPU,`,
  `    studioUrl, viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR, webgpuFlag: WEBGPU,\n    brushId: BRUSH_ID_ENV, brushOperation: BRUSH_OPERATION_ENV,\n    pathMode: SCREEN_FILL_PATH ? "screen-fill-serpentine" : "diagonal",`,
  "report identity",
);
verifier = replaceOnce(
  verifier,
  `    browser = await chromium.launch({\n      headless: true,\n      args: [...(WEBGPU ? ["--enable-unsafe-webgpu"] : []), "--js-flags=--expose-gc", "--no-sandbox"],\n    });`,
  `    browser = await chromium.launch({\n      headless: !HEADED,\n      args: [\n        ...(WEBGPU ? [\n          "--enable-unsafe-webgpu",\n          "--use-gl=angle",\n          "--use-angle=swiftshader",\n          "--enable-unsafe-swiftshader",\n        ] : ["--disable-features=WebGPU"]),\n        "--js-flags=--expose-gc",\n        "--no-sandbox",\n      ],\n    });`,
  "browser GPU mode",
);
verifier = replaceOnce(
  verifier,
  `    await dismissChrome(page);\n    await activatePen(page);\n    const brush = await resolveBrush(page);\n    if (brush.name) await selectBrush(page, brush.name);`,
  `    await dismissChrome(page);\n    const brush = await resolveBrush(page);\n    await activateBrushOperation(page, brush.operation);\n    if (brush.name) await selectBrush(page, brush.name, brush.operation);`,
  "brush activation",
);
verifier = replaceOnce(
  verifier,
  `    const midX = gesturePoint(box, 0.5).x;\n    const firstHalf = pathBounds(box, 0, 0.5, padCss);\n    const secondHalf = pathBounds(box, 0.5, 1, padCss);\n    const regions = {\n      // 전반부는 중점 − pad 까지, 후반부는 중점 + pad 부터 — 중점의 커서 링과 이음매를 양쪽에서 뺀다.\n      firstHalf: toRegion({ ...firstHalf, width: midX - padCss - firstHalf.x }, clip, DEVICE_SCALE_FACTOR),\n      secondHalf: toRegion({ ...secondHalf, x: midX + padCss, width: secondHalf.x + secondHalf.width - midX - padCss },\n        clip, DEVICE_SCALE_FACTOR),\n    };\n    report.paper = { full, visible: box, clip, padCss, regions };`,
  `    const midX = gesturePoint(box, 0.5).x;\n    const firstHalf = pathBounds(box, 0, SCREEN_FILL_PATH ? 0.46 : 0.5, padCss);\n    const secondHalf = pathBounds(box, SCREEN_FILL_PATH ? 0.54 : 0.5, 1, padCss);\n    const regions = SCREEN_FILL_PATH ? {\n      firstHalf: toRegion(firstHalf, clip, DEVICE_SCALE_FACTOR),\n      secondHalf: toRegion(secondHalf, clip, DEVICE_SCALE_FACTOR),\n    } : {\n      firstHalf: toRegion({ ...firstHalf, width: midX - padCss - firstHalf.x }, clip, DEVICE_SCALE_FACTOR),\n      secondHalf: toRegion({ ...secondHalf, x: midX + padCss, width: secondHalf.x + secondHalf.width - midX - padCss },\n        clip, DEVICE_SCALE_FACTOR),\n    };\n    const localPathPoints = Array.from({ length: 257 }, (_, index) => {\n      const point = gesturePoint(box, index / 256);\n      return { x: point.x - clip.x, y: point.y - clip.y };\n    });\n    report.paper = {\n      full, visible: box, clip, padCss, regions, localPathPoints,\n      pathMode: SCREEN_FILL_PATH ? "screen-fill-serpentine" : "diagonal",\n    };`,
  "path regions",
);
verifier = replaceOnce(
  verifier,
  `    const blankShot = await shot(page, clip, "00-blank");\n    let liveShot = "";\n    const dispatched = await drawGesture(page, box, PARITY_SAMPLES, async () => {\n      liveShot = await shot(page, clip, "01-live");\n    });`,
  `    const blankShot = await shot(page, clip, "00-blank");\n    let surfaceEvidence: SurfaceEvidence = {\n      gpuEverActive: false,\n      gpuEverAuthorized: false,\n      gpuSurfaceKinds: Object.freeze([]),\n      refusedStrokeNotices: 0,\n    };\n    let liveShot = "";\n    const dispatched = await drawGesture(page, box, PARITY_SAMPLES, async () => {\n      surfaceEvidence = await sampleSurfaceEvidence(page, surfaceEvidence);\n      liveShot = await shot(page, clip, "01-live");\n    });`,
  "live surface evidence",
);
verifier = replaceOnce(
  verifier,
  `    const committedShot = await shot(page, clip, "02-committed");\n    await page.waitForTimeout(PENDING_RECHECK_MS - COMMIT_SETTLE_MS);`,
  `    const committedShot = await shot(page, clip, "02-committed");\n    surfaceEvidence = await sampleSurfaceEvidence(page, surfaceEvidence);\n    await page.waitForTimeout(PENDING_RECHECK_MS - COMMIT_SETTLE_MS);`,
  "committed surface evidence",
);
verifier = replaceOnce(
  verifier,
  `    const perfDispatched = await drawGesture(page, box, PERF_SAMPLES);\n    await page.mouse.up({ button: "left" });`,
  `    const perfStarted = performance.now();\n    const perfDispatched = await drawGesture(page, box, PERF_SAMPLES, async () => {\n      surfaceEvidence = await sampleSurfaceEvidence(page, surfaceEvidence);\n    });\n    await page.mouse.up({ button: "left" });\n    const drawMilliseconds = performance.now() - perfStarted;`,
  "performance duration",
);
verifier = replaceOnce(
  verifier,
  `    report.perf = {\n      dispatchedMoves: perfDispatched, observedPointerMoves: perfCounters.moves,\n      inputDeliveryRatio: perfDelivery, frames: perf, undoClicks: { afterParity: undoneA, afterPerf: undoneB },\n    };`,
  `    surfaceEvidence = await sampleSurfaceEvidence(page, surfaceEvidence);\n    report.surfaceEvidence = surfaceEvidence;\n    report.perf = {\n      dispatchedMoves: perfDispatched, observedPointerMoves: perfCounters.moves,\n      inputDeliveryRatio: perfDelivery, drawMilliseconds, frames: perf,\n      undoClicks: { afterParity: undoneA, afterPerf: undoneB },\n    };`,
  "performance report",
);
writeFileSync(verifierPath, verifier);

const runnerPath = "scripts/run-studio-all-brush-long-stroke-shard.mts";
let runner = readFileSync(runnerPath, "utf8");
runner = replaceOnce(
  runner,
  `          TOONSPECTRUM_LONG_STROKE_OPERATION: item.operation,\n          TOONSPECTRUM_LONG_STROKE_PATH: "screen-fill",`,
  `          TOONSPECTRUM_LONG_STROKE_OPERATION: item.operation,\n          TOONSPECTRUM_LONG_STROKE_BRUSH_WIDTH: String(item.defaultWidth),\n          TOONSPECTRUM_LONG_STROKE_PATH: "screen-fill",`,
  "runner width",
);
writeFileSync(runnerPath, runner);

const admissionPath = "src/domains/creator/live/studio-live-ink-lane-admission.ts";
let admission = readFileSync(admissionPath, "utf8");
admission = replaceOnce(
  admission,
  `import type { DrawEl } from "../studio-element-model";`,
  `import { studioBrushGpuQualityEvidenceAllows } from "../brush/studio-brush-gpu-quality-evidence";\n\nimport type { DrawEl } from "../studio-element-model";`,
  "admission evidence import",
);
admission = replaceOnce(
  admission,
  `  return input.explicitBackend === "webgpu"\n    || (input.rolloutPrefersGpu && input.hardwareReady);`,
  `  if (input.explicitBackend === "webgpu") return true;\n  return input.rolloutPrefersGpu\n    && input.hardwareReady\n    && studioBrushGpuQualityEvidenceAllows(input.element.brushCatalogId);`,
  "quality-gated automatic rollout",
);
writeFileSync(admissionPath, admission);

const admissionTestPath = "src/domains/creator/live/studio-live-ink-lane-admission.test.ts";
let admissionTest = readFileSync(admissionTestPath, "utf8");
admissionTest = replaceOnce(
  admissionTest,
  `  it("selects the lane only when the rollout prefers it and the hardware is ready", () => {\n    expect(studioLiveInkLaneSelectsGpu(base)).toBe(true);\n    expect(studioLiveInkLaneSelectsGpu({ ...base, hardwareReady: false })).toBe(false);\n    expect(studioLiveInkLaneSelectsGpu({ ...base, rolloutPrefersGpu: false })).toBe(false);\n  });`,
  `  it("keeps automatic rollout on the incumbent until brush-specific evidence exists", () => {\n    expect(studioLiveInkLaneSelectsGpu(base)).toBe(false);\n    expect(studioLiveInkLaneSelectsGpu({ ...base, hardwareReady: false })).toBe(false);\n    expect(studioLiveInkLaneSelectsGpu({ ...base, rolloutPrefersGpu: false })).toBe(false);\n  });`,
  "admission rollout test",
);
writeFileSync(admissionTestPath, admissionTest);

for (const path of [
  ".github/workflows/all-brush-source-snapshot.yml",
  ".github/workflows/all-brush-source-snapshot-lite.yml",
]) rmSync(path, { force: true });

console.log("all-brush screen-fill quality benchmark patch applied");

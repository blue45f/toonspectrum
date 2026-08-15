/**
 * ADR 0005 승격 게이트의 미실측 항목: mesh→PathIR 변환 비용.
 *
 * ADR 0005 는 `google-ink-mesh` 를 컴파일러 PoC 게이트 뒤에 두고, 승격 조건 넷 중 하나로
 * "peak WASM memory·mesh→PathIR 변환 비용이 게이트 내"를 요구한다. 나머지 셋은 이미 측정돼 있다
 * (ink-mesh-attempt: 고정 commit 재현 빌드, ink-mesh-incremental: 결정성 40회 + peak heap,
 * ink-modeler-poc: 입력 모델러). 변환 비용만 비어 있었는데, 그 이유는 단순하다 — 변환 자체가
 * 존재하지 않았다.
 *
 * 이 하니스는 실제 커밋된 Emscripten WASM 을 Node 에서 돌려 스트로크 메시를 만들고, 매 증분
 * 업데이트마다 `inkStrokeMeshToPathIR` 로 편집 가능한 윤곽을 뽑아 다음을 측정한다.
 *
 * - 변환 단독 지연(p50/p95/p99/max)
 * - 입력→메시→PathIR 합산 지연 — ADR 이 말하는 "입력→첫 preview" 예산과 직접 비교 가능한 값
 * - 면적 보존 오차 — 프록시가 엔진이 그린 모양과 같은지
 * - 경로 복잡도(정점·verb·고리 수) — 편집 가능성의 실무 지표
 *
 * 목 없음. 실패하면 실패한 수치를 그대로 기록한다.
 */
import { writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INK_MESH_COMMIT,
  loadInkMeshGenerator,
  type InkMeshInputPoint,
} from "../../../packages/studio-brush-platform/src/ink-mesh";
import {
  inkStrokeMeshToPathIR,
  type InkMeshPathConversion,
} from "../../../packages/studio-brush-platform/src/ink-mesh-path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RESULT_PATH = resolve(ROOT, "tests/benchmarks/results/ink-mesh-path.json");

/** ink-mesh-incremental 하니스와 같은 워크로드 — 두 결과를 나란히 읽을 수 있어야 한다. */
const POINT_COUNT = 240;
const CHUNK_SIZE = 8;
const WARMUP_STROKES = 5;
const MEASURED_STROKES = 40;

/** ADR 0005 §4 의 입력→첫 preview 예산. */
const FIRST_PREVIEW_BUDGET_MS = { p50: 4, p95: 8 } as const;

function stroke(): InkMeshInputPoint[] {
  return Array.from({ length: POINT_COUNT }, (_, index) => {
    const t = index / (POINT_COUNT - 1);
    return {
      x: 12 + 360 * t + 11 * Math.sin(t * Math.PI * 8),
      y: 90 + 52 * Math.sin(t * Math.PI * 3),
      tMs: t * 1_600,
      pressure: 0.15 + 0.75 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.5)),
      tiltRad: 0.1 + t * 1.1,
      orientationRad: 0.2 + t * 5.5,
    };
  });
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function stats(values: readonly number[]) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length === 0 ? 0 : Math.max(...values),
  };
}

const generator = await loadInkMeshGenerator();
const points = stroke();

const convertMs: number[] = [];
const meshMs: number[] = [];
const totalMs: number[] = [];
const areaErrors: number[] = [];
const firstPreviewMs: number[] = [];
let finalConversion: InkMeshPathConversion | null = null;
let pathSignature = "";

for (let run = 0; run < WARMUP_STROKES + MEASURED_STROKES; run += 1) {
  const measured = run >= WARMUP_STROKES;
  const session = generator.createInProgressStroke();
  let firstUpdateRecorded = false;
  try {
    for (let offset = 0; offset < points.length; offset += CHUNK_SIZE) {
      const chunk = points.slice(offset, offset + CHUNK_SIZE);
      const meshStart = performance.now();
      session.append(chunk);
      const mesh = session.snapshot();
      const meshEnd = performance.now();
      const conversion = inkStrokeMeshToPathIR(mesh);
      const convertEnd = performance.now();

      if (measured) {
        meshMs.push(meshEnd - meshStart);
        convertMs.push(convertEnd - meshEnd);
        totalMs.push(convertEnd - meshStart);
        areaErrors.push(conversion.areaError);
        if (!firstUpdateRecorded) {
          firstPreviewMs.push(convertEnd - meshStart);
          firstUpdateRecorded = true;
        }
        finalConversion = conversion;
      }
    }
    if (measured && finalConversion) {
      const signature = JSON.stringify(finalConversion.path.verbs.length);
      if (pathSignature === "") pathSignature = signature;
      else if (pathSignature !== signature) pathSignature = "UNSTABLE";
    }
  } finally {
    session.dispose();
  }
}

const conversion = finalConversion;
if (!conversion) throw new Error("no measured conversion was produced");

const convertStats = stats(convertMs);
const firstPreviewStats = stats(firstPreviewMs);
const report = {
  schema: "toon-ink-mesh-path-benchmark-v1",
  generatedAtUtc: new Date().toISOString(),
  adr: "ADR 0005 §4 승격 게이트 — mesh→PathIR 변환 비용",
  runtime: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    execution: "real committed Emscripten WASM in Node; no mock",
  },
  upstream: { repository: "https://github.com/google/ink", commit: INK_MESH_COMMIT },
  workload: {
    points: POINT_COUNT,
    chunkSize: CHUNK_SIZE,
    warmupStrokes: WARMUP_STROKES,
    measuredStrokes: MEASURED_STROKES,
    updatesPerStroke: Math.ceil(POINT_COUNT / CHUNK_SIZE),
  },
  latencyMs: {
    meshUpdate: stats(meshMs),
    pathConversion: convertStats,
    meshPlusConversion: stats(totalMs),
    firstUpdateOfStroke: firstPreviewStats,
  },
  fidelity: {
    areaErrorMax: areaErrors.length === 0 ? 0 : Math.max(...areaErrors),
    areaErrorP95: percentile(areaErrors, 0.95),
    finalMeshArea: conversion.meshArea,
    finalPathArea: conversion.pathArea,
  },
  finalPath: {
    verbCount: conversion.path.verbs.length,
    loopCount: conversion.loops.length,
    boundaryEdgeCount: conversion.boundaryEdgeCount,
    outerLoops: conversion.loops.filter(({ signedArea }) => signedArea > 0).length,
    holeLoops: conversion.loops.filter(({ signedArea }) => signedArea < 0).length,
  },
  determinism: {
    verbCountStableAcrossRuns: pathSignature !== "UNSTABLE",
  },
  gate: {
    budgetMs: FIRST_PREVIEW_BUDGET_MS,
    firstUpdateP50WithinBudget: firstPreviewStats.p50 <= FIRST_PREVIEW_BUDGET_MS.p50,
    firstUpdateP95WithinBudget: firstPreviewStats.p95 <= FIRST_PREVIEW_BUDGET_MS.p95,
    conversionShareOfUpdateP50:
      convertStats.p50 / Math.max(1e-9, stats(totalMs).p50),
    note:
      "이 하니스는 Node 에서 메시 생성 + PathIR 변환만 측정한다. 실제 제품의 입력→첫 preview 는 "
      + "포인터 이벤트·스태빌라이저·표시까지 포함하므로 이 값은 그 예산의 하한이다.",
  },
};

await writeFile(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

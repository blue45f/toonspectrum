#!/usr/bin/env python3
"""Wire GPU-adapter provenance into the all-brush quality election.

The repository's exhaustive benchmark files are intentionally large. Keeping this as a short-lived,
reviewable patcher lets GitHub Actions apply exact source edits and then delete the patcher after the
focused tests, lint, and typecheck pass.
"""

from __future__ import annotations

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def replace_once(source: str, before: str, after: str, label: str) -> str:
    count = source.count(before)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(before, after, 1)


def patch_verifier() -> None:
    path = ROOT / "scripts/verify-studio-long-stroke.mts"
    source = path.read_text(encoding="utf-8")

    surface = '''interface SurfaceEvidence {
  readonly gpuEverActive: boolean;
  readonly gpuEverAuthorized: boolean;
  readonly gpuSurfaceKinds: readonly string[];
  readonly refusedStrokeNotices: number;
}
type GateGlobals = typeof globalThis & {'''
    surface_with_adapter = '''interface SurfaceEvidence {
  readonly gpuEverActive: boolean;
  readonly gpuEverAuthorized: boolean;
  readonly gpuSurfaceKinds: readonly string[];
  readonly refusedStrokeNotices: number;
}
interface GpuAdapterEvidence {
  readonly available: boolean;
  readonly adapterClass: "hardware" | "software" | "unknown" | "unavailable";
  readonly isFallbackAdapter: boolean | null;
  readonly adapterFingerprint: string | null;
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
}
type GateGlobals = typeof globalThis & {'''
    source = replace_once(source, surface, surface_with_adapter, "verifier adapter interface")

    log_function = '''function log(message: string): void {
  console.log(`[verify-studio-long-stroke] ${message}`);
}'''
    adapter_helper = '''async function inspectGpuAdapter(page: Page): Promise<GpuAdapterEvidence> {
  const unavailable: GpuAdapterEvidence = Object.freeze({
    available: false,
    adapterClass: "unavailable",
    isFallbackAdapter: null,
    adapterFingerprint: null,
    vendor: "",
    architecture: "",
    device: "",
    description: "",
  });
  if (!WEBGPU) return unavailable;
  return page.evaluate(async () => {
    type AdapterInfoLike = Readonly<{
      vendor?: unknown;
      architecture?: unknown;
      device?: unknown;
      description?: unknown;
    }>;
    type AdapterLike = Readonly<{
      info?: AdapterInfoLike;
      isFallbackAdapter?: unknown;
    }>;
    type NavigatorWithGpu = Navigator & Readonly<{
      gpu?: Readonly<{
        requestAdapter(options?: Readonly<{ powerPreference?: "high-performance" }>):
          Promise<AdapterLike | null>;
      }>;
    }>;
    const gpu = (navigator as NavigatorWithGpu).gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const info = adapter.info ?? {};
    const text = (value: unknown): string =>
      typeof value === "string" ? value.trim() : "";
    const vendor = text(info.vendor);
    const architecture = text(info.architecture);
    const device = text(info.device);
    const description = text(info.description);
    const isFallbackAdapter = typeof adapter.isFallbackAdapter === "boolean"
      ? adapter.isFallbackAdapter
      : null;
    const adapterFingerprint = [vendor, architecture, device, description]
      .filter((value) => value.length > 0)
      .join(":") || null;
    const identity = adapterFingerprint?.toLowerCase() ?? "";
    const software = /swiftshader|llvmpipe|lavapipe|software|warp|basic render/u
      .test(identity);
    const adapterClass = isFallbackAdapter is True
      ? "software"
      : software
        ? "software"
        : adapterFingerprint
          ? "hardware"
          : "unknown";
    return {
      available: true,
      adapterClass,
      isFallbackAdapter,
      adapterFingerprint,
      vendor,
      architecture,
      device,
      description,
    };
  }).then((result) => result ?? unavailable).catch(() => unavailable);
}

function log(message: string): void {
  console.log(`[verify-studio-long-stroke] ${message}`);
}'''
    # Correct the Python-looking token inside the TypeScript template before writing it.
    adapter_helper = adapter_helper.replace("isFallbackAdapter is True", "isFallbackAdapter === true")
    source = replace_once(source, log_function, adapter_helper, "verifier adapter helper")

    navigation = '''    await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 60_000 })'''
    navigation_with_adapter = '''    await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const gpuAdapter = await inspectGpuAdapter(page);
    report.gpuAdapter = gpuAdapter;
    log(`gpu adapter: ${gpuAdapter.adapterClass} · ${gpuAdapter.adapterFingerprint ?? "unidentified"}`);
    await page.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 60_000 })'''
    source = replace_once(
        source,
        navigation,
        navigation_with_adapter,
        "verifier adapter capture",
    )
    path.write_text(source, encoding="utf-8")


def generated_evidence_function() -> str:
    return '''function generatedEvidenceSource(input: Readonly<{
  generatedAt: string;
  expiresAt: string;
  sourceCommit: string | null;
  digest: string;
  measurementRunCount: number;
  measuredBrushCount: number;
  hardwareAdapterFingerprints: readonly string[];
  approved: readonly string[];
  rejected: readonly string[];
}>): string {
  const literal = (values: readonly string[]) => JSON.stringify(values, null, 2)
    .split("\\n")
    .map((line, index) => index === 0 ? line : `  ${line}`)
    .join("\\n");
  return `/** Generated by scripts/aggregate-studio-all-brush-long-stroke.mts. */\\n`
    + `export const STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_SCHEMA_VERSION = 2 as const;\\n`
    + `export const STUDIO_BRUSH_GPU_QUALITY_EVIDENCE = Object.freeze({\\n`
    + `  schemaVersion: STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_SCHEMA_VERSION,\\n`
    + `  rendererContractVersion: ${STUDIO_BRUSH_GPU_QUALITY_RENDER_CONTRACT_VERSION},\\n`
    + `  generatedAt: ${JSON.stringify(input.generatedAt)},\\n`
    + `  expiresAt: ${JSON.stringify(input.expiresAt)},\\n`
    + `  sourceCommit: ${JSON.stringify(input.sourceCommit)},\\n`
    + `  benchmarkDigest: ${JSON.stringify(input.digest)},\\n`
    + `  measurementRunCount: ${input.measurementRunCount},\\n`
    + `  measuredBrushCount: ${input.measuredBrushCount},\\n`
    + `  hardwareClass: ${input.hardwareAdapterFingerprints.length > 0 ? '"hardware"' : 'null'} as "hardware" | null,\\n`
    + `  hardwareAdapterFingerprints: Object.freeze(${literal(input.hardwareAdapterFingerprints)} as string[]),\\n`
    + `  approvedBrushIds: Object.freeze(${literal(input.approved)} as string[]),\\n`
    + `  rejectedBrushIds: Object.freeze(${literal(input.rejected)} as string[]),\\n`
    + `});\\n`;
}'''


def patch_aggregator() -> None:
    path = ROOT / "scripts/aggregate-studio-all-brush-long-stroke.mts"
    source = path.read_text(encoding="utf-8")

    election_import = '''import {
  electStudioBrushGpuQuality,
  type StudioBrushCrossEngineQualityEvidence,
  type StudioBrushGpuQualityPolicyKind,
  type StudioBrushLongStrokePerformanceEvidence,
  type StudioBrushLongStrokeQualityEvidence,
} from "../src/domains/creator/brush/studio-brush-gpu-quality-election";'''
    election_import_with_hardware = '''import {
  STUDIO_BRUSH_GPU_QUALITY_RENDER_CONTRACT_VERSION,
  electStudioBrushGpuQuality,
  type StudioBrushCrossEngineQualityEvidence,
  type StudioBrushGpuExecutionEvidence,
  type StudioBrushGpuQualityPolicyKind,
  type StudioBrushLongStrokePerformanceEvidence,
  type StudioBrushLongStrokeQualityEvidence,
} from "../src/domains/creator/brush/studio-brush-gpu-quality-election";
import {
  STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_MAX_AGE_MS,
} from "../src/domains/creator/brush/studio-brush-gpu-quality-evidence";'''
    source = replace_once(
        source,
        election_import,
        election_import_with_hardware,
        "aggregator imports",
    )

    surface_report = '''  readonly surfaceEvidence?: {
    readonly gpuEverActive?: boolean;
    readonly gpuEverAuthorized?: boolean;
    readonly gpuSurfaceKinds?: readonly string[];
    readonly refusedStrokeNotices?: number;
  };
}'''
    surface_report_with_adapter = '''  readonly surfaceEvidence?: {
    readonly gpuEverActive?: boolean;
    readonly gpuEverAuthorized?: boolean;
    readonly gpuSurfaceKinds?: readonly string[];
    readonly refusedStrokeNotices?: number;
  };
  readonly gpuAdapter?: {
    readonly available?: boolean;
    readonly adapterClass?: "hardware" | "software" | "unknown" | "unavailable";
    readonly isFallbackAdapter?: boolean | null;
    readonly adapterFingerprint?: string | null;
  };
}'''
    source = replace_once(
        source,
        surface_report,
        surface_report_with_adapter,
        "aggregator report adapter type",
    )

    quality_policy = '''async function qualityPolicy(item: StudioBrushCatalogItem): Promise<StudioBrushGpuQualityPolicyKind> {'''
    helper_and_policy = '''function gpuExecutionEvidence(
  report: LongStrokeReport | null,
): StudioBrushGpuExecutionEvidence {
  const adapter = report?.gpuAdapter;
  const adapterClass = adapter?.adapterClass;
  return {
    adapterClass: adapterClass === "hardware"
      || adapterClass === "software"
      || adapterClass === "unknown"
      || adapterClass === "unavailable"
        ? adapterClass
        : "unavailable",
    isFallbackAdapter: typeof adapter?.isFallbackAdapter === "boolean"
      ? adapter.isFallbackAdapter
      : null,
    adapterFingerprint: typeof adapter?.adapterFingerprint === "string"
      && adapter.adapterFingerprint.length > 0
        ? adapter.adapterFingerprint
        : null,
  };
}

async function qualityPolicy(item: StudioBrushCatalogItem): Promise<StudioBrushGpuQualityPolicyKind> {'''
    source = replace_once(
        source,
        quality_policy,
        helper_and_policy,
        "aggregator execution helper",
    )

    election_call = '''      gpu: {
        quality: qualityEvidence(gpu.report, gpuAnalysis),
        performance: performanceEvidence(gpu.report),
      },
      crossEngine: cross,'''
    election_call_with_adapter = '''      gpu: {
        quality: qualityEvidence(gpu.report, gpuAnalysis),
        performance: performanceEvidence(gpu.report),
      },
      gpuExecution: gpuExecutionEvidence(gpu.report),
      crossEngine: cross,'''
    source = replace_once(
        source,
        election_call,
        election_call_with_adapter,
        "aggregator election adapter",
    )

    gpu_case = '''      gpu: {
        verifierOk: gpu.report?.ok ?? false,
        quality: qualityEvidence(gpu.report, gpuAnalysis),
        performance: performanceEvidence(gpu.report),
        report: relative(INPUT_ROOT, join(gpu.caseRoot, "report.json")),
      },'''
    gpu_case_with_adapter = '''      gpu: {
        verifierOk: gpu.report?.ok ?? false,
        quality: qualityEvidence(gpu.report, gpuAnalysis),
        performance: performanceEvidence(gpu.report),
        execution: gpuExecutionEvidence(gpu.report),
        report: relative(INPUT_ROOT, join(gpu.caseRoot, "report.json")),
      },'''
    source = replace_once(
        source,
        gpu_case,
        gpu_case_with_adapter,
        "aggregator case adapter",
    )

    pattern = re.compile(
        r"function generatedEvidenceSource\([\s\S]*?\n}\n\nasync function main",
        re.MULTILINE,
    )
    replacement = generated_evidence_function() + "\n\nasync function main"
    source, count = pattern.subn(replacement, source, count=1)
    if count != 1:
        raise SystemExit(f"generated evidence function: expected one match, found {count}")

    generated_at = '''  const generatedAt = new Date().toISOString();
  const sourceCommit = process.env.GITHUB_SHA ?? null;
  const approved = cases'''
    generated_at_with_hardware = '''  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(generatedAt) + STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_MAX_AGE_MS,
  ).toISOString();
  const sourceCommit = process.env.GITHUB_SHA ?? null;
  const hardwareAdapterFingerprints = [...new Set(cases.flatMap((entry) =>
    entry.gpu.execution.adapterClass === "hardware"
      && entry.gpu.execution.isFallbackAdapter !== true
      && entry.gpu.execution.adapterFingerprint
        ? [entry.gpu.execution.adapterFingerprint]
        : []
  ))].sort();
  // Each current shard case is one independent browser execution. Automatic rollout requires
  // three repeated physical-device measurements, so this single-pass CI stays diagnostic-only.
  const measurementRunCount = 1;
  const approved = cases'''
    source = replace_once(
        source,
        generated_at,
        generated_at_with_hardware,
        "aggregator generated metadata",
    )

    report_header = '''    kind: "toonspectrum-all-brush-screen-fill-gpu-election-v1",
    generatedAt,
    sourceCommit,
    benchmarkDigest,'''
    report_header_with_hardware = '''    kind: "toonspectrum-all-brush-screen-fill-gpu-election-v2",
    generatedAt,
    expiresAt,
    sourceCommit,
    rendererContractVersion: STUDIO_BRUSH_GPU_QUALITY_RENDER_CONTRACT_VERSION,
    measurementRunCount,
    hardwareClass: hardwareAdapterFingerprints.length > 0 ? "hardware" : null,
    hardwareAdapterFingerprints,
    benchmarkDigest,'''
    source = replace_once(
        source,
        report_header,
        report_header_with_hardware,
        "aggregator report metadata",
    )

    markdown_counts = '''    `- GPU 품질 승인: ${approved.length}`,
    `- 기존 경로 유지: ${rejected.length}`,
    `- 증거 다이제스트: \\`${benchmarkDigest}\\```,'''
    markdown_counts_with_hardware = '''    `- GPU 품질 승인 후보: ${approved.length}`,
    `- 기존 경로 유지: ${rejected.length}`,
    `- 물리 GPU 증거: ${hardwareAdapterFingerprints.length > 0 ? hardwareAdapterFingerprints.join(", ") : "없음(진단 전용)"}`,
    `- 반복 측정: ${measurementRunCount}회 (자동 승격 최소 3회)`,
    `- 증거 만료: ${expiresAt}`,
    `- 증거 다이제스트: \\`${benchmarkDigest}\\```,'''
    source = replace_once(
        source,
        markdown_counts,
        markdown_counts_with_hardware,
        "aggregator markdown metadata",
    )

    policy_sentence = '''    "질감·형태·라이브/커밋 연속성이 먼저이며, 성능이 빨라도 품질 축 하나가 열화되면 기존 경로를 유지한다. 품질이 동등하고 p95가 5% 이내의 비열화 범위면 GPU를 우선한다.",'''
    strict_policy_sentence = '''    "질감·형태·라이브/커밋 연속성이 먼저이며, 성능이 빨라도 품질 축 하나가 열화되면 기존 경로를 유지한다. 비폴백 물리 GPU가 확인되고 품질이 거의 동일하며 p95가 2% 이내일 때만 승격 후보가 된다. 실제 자동 승격은 같은 렌더 계약에서 세 번의 독립 측정이 필요하다.",'''
    source = replace_once(
        source,
        policy_sentence,
        strict_policy_sentence,
        "aggregator policy wording",
    )

    generated_call = '''  writeFileSync(GENERATED_EVIDENCE_PATH, generatedEvidenceSource({
    generatedAt,
    sourceCommit,
    digest: benchmarkDigest,
    measuredBrushCount: cases.length,
    approved,
    rejected,
  }));'''
    generated_call_with_hardware = '''  writeFileSync(GENERATED_EVIDENCE_PATH, generatedEvidenceSource({
    generatedAt,
    expiresAt,
    sourceCommit,
    digest: benchmarkDigest,
    measurementRunCount,
    measuredBrushCount: cases.length,
    hardwareAdapterFingerprints,
    approved,
    rejected,
  }));'''
    source = replace_once(
        source,
        generated_call,
        generated_call_with_hardware,
        "aggregator generated evidence call",
    )
    path.write_text(source, encoding="utf-8")


def patch_benchmark_workflow() -> None:
    path = ROOT / ".github/workflows/studio-all-brush-long-stroke-quality.yml"
    source = path.read_text(encoding="utf-8")
    source = replace_once(
        source,
        '''          pnpm exec vitest run \\
            src/domains/creator/brush/studio-brush-gpu-quality-election.test.ts \\
            src/domains/creator/live/studio-live-ink-lane-admission.test.ts''',
        '''          pnpm exec vitest run \\
            src/domains/creator/brush/studio-brush-gpu-quality-election.test.ts \\
            src/domains/creator/brush/studio-brush-gpu-quality-evidence.test.ts \\
            src/domains/creator/live/studio-live-ink-lane-admission.test.ts''',
        "benchmark evidence test",
    )
    source = replace_once(
        source,
        '''            src/domains/creator/brush/studio-brush-gpu-quality-evidence.ts \\
            src/domains/creator/brush/studio-brush-gpu-quality-evidence.generated.ts \\
''',
        '''            src/domains/creator/brush/studio-brush-gpu-quality-evidence.ts \\
            src/domains/creator/brush/studio-brush-gpu-quality-evidence.test.ts \\
            src/domains/creator/brush/studio-brush-gpu-quality-evidence.generated.ts \\
''',
        "benchmark evidence lint",
    )
    path.write_text(source, encoding="utf-8")


def main() -> None:
    patch_verifier()
    patch_aggregator()
    patch_benchmark_workflow()


if __name__ == "__main__":
    main()

/**
 * Ink-wash and dip-pen live/commit fidelity gate.
 *
 * The previous probe only pressed `b`, drew with whichever brush happened to be active, copied
 * full-page screenshots into one developer's home directory, and returned success when the Konva
 * stage was missing. It therefore could not prove the regression named by its filename.
 *
 * This orchestrator deliberately reuses `verify-studio-long-stroke.mts`, the repository's hard
 * browser gate. Each visible catalogue representative must pass its complete assertion set:
 * stage presence, actual brush selection, live ink, prefix stability after pointer-up, committed
 * tail ink, settled pixels, input delivery, browser errors, long-stroke frame budget, and memory
 * release. A missing/invalid child report or a selected-brush mismatch is a failure here as well.
 *
 * Local development server:
 *   pnpm exec tsx scripts/verify-inkwash-dippen-live-commit-fidelity.mts
 *
 * Production build + self-hosted preview (CI):
 *   TOONSPECTRUM_INK_FIDELITY_SPAWN_PREVIEW=1 \
 *     pnpm exec tsx scripts/verify-inkwash-dippen-live-commit-fidelity.mts
 *
 * Environment:
 *   STUDIO_URL                                      default http://localhost:5173/studio
 *   TOONSPECTRUM_INK_FIDELITY_SPAWN_PREVIEW=1      start one bounded Vite preview per case
 *   TOONSPECTRUM_INK_FIDELITY_CASES=a,b            optional case-id filter
 *   TOONSPECTRUM_VERIFY_DIR                         artifact root; defaults to the OS temp dir
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface FidelityCaseDefinition {
  readonly id: "inkwash-pen" | "pen";
  readonly brushName: string;
  /** Catalogue default width, pinned so a preview build measures the shipped configuration. */
  readonly brushWidth: number;
  readonly contract: string;
}

interface LongStrokeAssertion {
  readonly id?: unknown;
  readonly ok?: unknown;
  readonly detail?: unknown;
}

interface LongStrokeReport {
  readonly ok?: unknown;
  readonly brush?: { readonly name?: unknown } | null;
  readonly assertions?: readonly LongStrokeAssertion[];
  readonly fatal?: unknown;
}

interface CaseResult {
  readonly id: FidelityCaseDefinition["id"];
  readonly brushName: string;
  readonly contract: string;
  readonly ok: boolean;
  readonly exitCode: number;
  readonly signal: string | null;
  readonly reportPath: string;
  readonly selectedBrushName: string | null;
  readonly assertionCount: number;
  readonly failedAssertions: readonly string[];
  readonly error: string | null;
}

/**
 * Each case must be a brush a user can actually reach in the picker. `glass-pen` was the original
 * thin-line representative, but the quarantine ledger delisted it — "선언된 \"잉크 흐름\"으로
 * 분기하는 렌더러가 없어" — so the catalogue never lists it and the probe timed out selecting a
 * brush that is not there. The ledger names its replacements; `pen` is the one that survived the
 * later feel-cull (fineliner is quarantined too).
 */
const FIDELITY_CASES = Object.freeze([
  {
    id: "inkwash-pen",
    brushName: "잉크워시 딥펜(유체 잉크)",
    brushWidth: 8,
    contract: "fluid wet-ink live overlay → committed document pixels",
  },
  {
    id: "pen",
    brushName: "펜(매끈)",
    brushWidth: 6,
    contract: "thin-line causal filtering → committed document geometry",
  },
] as const satisfies readonly FidelityCaseDefinition[]);

const SPAWN_PREVIEW = process.env.TOONSPECTRUM_INK_FIDELITY_SPAWN_PREVIEW === "1";
const VERIFY_ROOT = process.env.TOONSPECTRUM_VERIFY_DIR ?? tmpdir();
const OUT_DIR = join(VERIFY_ROOT, "studio-ink-live-commit");
const AGGREGATE_REPORT_PATH = join(OUT_DIR, "report.json");
const CHILD_SCRIPT = "scripts/verify-studio-long-stroke.mts";
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function log(message: string): void {
  console.log(`[verify-studio-ink-live-commit] ${message}`);
}

function selectedCases(): readonly FidelityCaseDefinition[] {
  const requested = process.env.TOONSPECTRUM_INK_FIDELITY_CASES
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requested || requested.length === 0) return FIDELITY_CASES;
  const unknown = requested.filter(
    (id) => !FIDELITY_CASES.some((definition) => definition.id === id),
  );
  if (unknown.length > 0) {
    throw new Error(`알 수 없는 fidelity case: ${unknown.join(", ")}`);
  }
  return FIDELITY_CASES.filter((definition) => requested.includes(definition.id));
}

function readChildReport(reportPath: string): LongStrokeReport {
  if (!existsSync(reportPath)) {
    throw new Error(`child report missing: ${reportPath}`);
  }
  const decoded: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error(`child report is not an object: ${reportPath}`);
  }
  return decoded as LongStrokeReport;
}

async function runCase(definition: FidelityCaseDefinition): Promise<CaseResult> {
  const caseRoot = join(OUT_DIR, "cases", definition.id);
  const reportPath = join(caseRoot, "studio-long-stroke", "report.json");
  mkdirSync(caseRoot, { recursive: true });
  log(`${definition.id}: ${definition.brushName}`);

  const child = spawn(PNPM_COMMAND, ["exec", "tsx", CHILD_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TOONSPECTRUM_VERIFY_DIR: caseRoot,
      TOONSPECTRUM_LONG_STROKE_BRUSH: definition.brushName,
      // A preview build cannot serve the /src catalogue module the child probe reads, so without
      // these two pins it falls back to a 12px default and measures a width the product never
      // ships. The id also lands in the child report, making the selected brush auditable.
      TOONSPECTRUM_LONG_STROKE_BRUSH_ID: definition.id,
      TOONSPECTRUM_LONG_STROKE_BRUSH_WIDTH: String(definition.brushWidth),
      TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW: SPAWN_PREVIEW ? "1" : "0",
      // The required gate measures the deterministic shipped compatibility path. Hardware/WebGPU
      // device-loss coverage is kept in its dedicated fault-injection suites, not silently mixed
      // into this pixel-authority proof.
      TOONSPECTRUM_LONG_STROKE_WEBGPU: "0",
    },
    stdio: "inherit",
  });
  const completion = await new Promise<{ readonly code: number; readonly signal: string | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({
        code: code ?? 1,
        signal: signal === null ? null : String(signal),
      }));
    },
  );

  try {
    const report = readChildReport(reportPath);
    const selectedBrushName = typeof report.brush?.name === "string"
      ? report.brush.name
      : null;
    const assertions = Array.isArray(report.assertions) ? report.assertions : [];
    const failedAssertions = assertions
      .filter((assertion) => assertion?.ok !== true)
      .map((assertion) => typeof assertion?.id === "string" ? assertion.id : "unknown-assertion");
    const brushMatched = selectedBrushName === definition.brushName;
    const reportPassed = report.ok === true && failedAssertions.length === 0;
    const ok = completion.code === 0 && reportPassed && brushMatched;
    const reasons = [
      completion.code === 0 ? null : `child exit ${completion.code}`,
      reportPassed ? null : `failed assertions: ${failedAssertions.join(", ") || "report.ok=false"}`,
      brushMatched
        ? null
        : `selected ${selectedBrushName ?? "(unknown)"}, expected ${definition.brushName}`,
      typeof report.fatal === "string" ? report.fatal.split("\n", 1)[0] ?? report.fatal : null,
    ].filter((value): value is string => Boolean(value));
    return {
      ...definition,
      ok,
      exitCode: completion.code,
      signal: completion.signal,
      reportPath,
      selectedBrushName,
      assertionCount: assertions.length,
      failedAssertions,
      error: reasons.length > 0 ? reasons.join("; ") : null,
    };
  } catch (error) {
    return {
      ...definition,
      ok: false,
      exitCode: completion.code,
      signal: completion.signal,
      reportPath,
      selectedBrushName: null,
      assertionCount: 0,
      failedAssertions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyStudioInkLiveCommitFidelity(): Promise<readonly CaseResult[]> {
  mkdirSync(OUT_DIR, { recursive: true });
  const definitions = selectedCases();
  if (definitions.length === 0) throw new Error("실행할 fidelity case가 없습니다.");
  const results: CaseResult[] = [];
  for (const definition of definitions) results.push(await runCase(definition));

  const failed = results.filter((result) => !result.ok);
  const aggregate = {
    kind: "toonspectrum-studio-ink-live-commit-fidelity-v2",
    generatedAt: new Date().toISOString(),
    sourceGate: CHILD_SCRIPT,
    spawnPreview: SPAWN_PREVIEW,
    ok: failed.length === 0,
    cases: results,
  };
  writeFileSync(AGGREGATE_REPORT_PATH, `${JSON.stringify(aggregate, null, 2)}\n`);
  for (const result of results) {
    log(
      `${result.ok ? "PASS" : "FAIL"} ${result.id} · ${result.assertionCount} assertions`
      + `${result.error ? ` · ${result.error}` : ""}`,
    );
  }
  log(`report ${AGGREGATE_REPORT_PATH}`);
  if (failed.length > 0) {
    throw new Error(`${failed.length}/${results.length} ink live/commit cases failed`);
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void verifyStudioInkLiveCommitFidelity().catch((error: unknown) => {
    log(`FATAL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}

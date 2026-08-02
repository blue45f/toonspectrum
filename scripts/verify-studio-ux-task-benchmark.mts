/**
 * Task-based Studio UX benchmark entry point.
 *
 * This command does not invent browser timings. It always emits the source-level conditional-entry
 * audit, plus a machine-readable task manifest. Pass a dated browser observation array to score
 * real click/tap, discovery, mobile geometry and recovery measurements:
 *
 *   pnpm exec tsx scripts/verify-studio-ux-task-benchmark.mts \
 *     --observations /tmp/studio-ux-observations.json
 *
 * Set TOONSPECTRUM_UX_BENCHMARK_ENFORCE=1 to fail on scored task gaps. Blocking source contracts
 * fail regardless; diagnostic candidates stay visible in the report until promoted to blocking.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  STUDIO_UX_ENTRY_CONTINUITY_CANDIDATES,
  STUDIO_UX_ENTRY_CONTINUITY_CONTRACTS,
  auditStudioUxEntryContinuity,
} from "./studio-ux-entry-continuity-contract";
import {
  STUDIO_UX_REFERENCE_PRODUCTS,
  STUDIO_UX_REFERENCE_TASK_ROUTES,
  STUDIO_UX_TASK_FIXTURES,
} from "./studio-ux-task-benchmark-fixture";
import {
  STUDIO_UX_TASK_BENCHMARK_SCHEMA_VERSION,
  evaluateStudioUxTaskObservation,
  summarizeStudioUxTaskBenchmark,
  type StudioUxTaskObservation,
} from "./studio-ux-task-benchmark-policy";

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function observationArray(value: unknown): readonly StudioUxTaskObservation[] {
  if (Array.isArray(value)) return value as StudioUxTaskObservation[];
  if (
    typeof value === "object"
    && value !== null
    && Array.isArray((value as { observations?: unknown }).observations)
  ) {
    return (value as { observations: StudioUxTaskObservation[] }).observations;
  }
  throw new Error("Observation input must be an array or an object with an observations array");
}

const observationPath = argumentValue("--observations");
const reportDirectory = resolve(
  process.env.TOONSPECTRUM_UX_BENCHMARK_DIR
    ?? join(tmpdir(), "toonspectrum-studio-ux-task-benchmark"),
);
mkdirSync(reportDirectory, { recursive: true });

const allContinuityContracts = [
  ...STUDIO_UX_ENTRY_CONTINUITY_CONTRACTS,
  ...STUDIO_UX_ENTRY_CONTINUITY_CANDIDATES,
];
const sourcePaths = new Set(
  allContinuityContracts.flatMap((contract) =>
    contract.checkpoints.flatMap((checkpoint) =>
      checkpoint.clauses.map((clause) => clause.file),
    ),
  ),
);
const sourceMap = new Map(
  [...sourcePaths].map((path) => [path, readFileSync(resolve(path), "utf8")]),
);
const blockingContinuity = STUDIO_UX_ENTRY_CONTINUITY_CONTRACTS.map((contract) =>
  auditStudioUxEntryContinuity(contract, sourceMap),
);
const diagnosticContinuity = STUDIO_UX_ENTRY_CONTINUITY_CANDIDATES.map((contract) =>
  auditStudioUxEntryContinuity(contract, sourceMap),
);

const observations = observationPath
  ? observationArray(JSON.parse(readFileSync(resolve(observationPath), "utf8")))
  : [];
const taskById = new Map(STUDIO_UX_TASK_FIXTURES.map((task) => [task.id, task]));
const taskResults = observations.map((observation) => {
  const task = taskById.get(observation.taskId);
  if (!task) throw new Error(`Unknown task id in observation: ${observation.taskId}`);
  return {
    productId: observation.productId,
    surface: observation.surface,
    taskId: observation.taskId,
    ...evaluateStudioUxTaskObservation(task, observation),
  };
});
const summary = observations.length > 0
  ? summarizeStudioUxTaskBenchmark(STUDIO_UX_TASK_FIXTURES, observations)
  : null;

const report = {
  schemaVersion: STUDIO_UX_TASK_BENCHMARK_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  methodology: {
    authority: "task-outcome-and-interaction-evidence",
    nativeFixtureFirst: true,
    imageUploadIsCompatibilityOnly: true,
    officialRoutesAreDocumentedMinimaNotTimedTrials: true,
    mobileTargetMinimumPx: 44,
    mobileHorizontalOverflowTolerancePx: 1,
  },
  tasks: STUDIO_UX_TASK_FIXTURES,
  references: {
    products: STUDIO_UX_REFERENCE_PRODUCTS,
    documentedRoutes: STUDIO_UX_REFERENCE_TASK_ROUTES,
  },
  continuity: {
    blocking: blockingContinuity,
    diagnostic: diagnosticContinuity,
  },
  observations: taskResults,
  summary,
};
const reportPath = join(reportDirectory, "studio-ux-task-benchmark-report.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

for (const result of [...blockingContinuity, ...diagnosticContinuity]) {
  const category = blockingContinuity.includes(result) ? "blocking" : "diagnostic";
  console.log(
    `[studio-ux] ${category} ${result.id}: ${result.passedCheckpoints}/${result.totalCheckpoints} (${result.score})`,
  );
}
if (summary) {
  console.log(
    `[studio-ux] tasks ${summary.passedTaskCount}/${summary.taskCount}, score ${summary.score}`,
  );
} else {
  console.log("[studio-ux] no browser observation file supplied; task timing was not fabricated");
}
console.log(`[studio-ux] report ${reportPath}`);

const blockingFailed = blockingContinuity.some((result) => !result.ok);
const enforceTaskResults = process.env.TOONSPECTRUM_UX_BENCHMARK_ENFORCE === "1";
if (blockingFailed || (enforceTaskResults && taskResults.some((result) => !result.ok))) {
  process.exitCode = 1;
}

import {
  STUDIO_VELLO_CURRENT_CANDIDATE_EVALUATION,
  STUDIO_VELLO_PROMOTION_GATES,
} from "../src/domains/creator/studio-vello-candidate-promotion";
import {
  STUDIO_VELLO_CHROME_PAGE_REPEATABILITY,
  STUDIO_VELLO_OBSERVED_FRAME_RUNS,
  STUDIO_VELLO_OBSERVED_POC_DECISION,
  STUDIO_VELLO_OBSERVED_POC_LIMITATIONS,
  STUDIO_VELLO_OBSERVED_SOURCE,
  STUDIO_VELLO_RECORDED_OBSERVATION_CONSISTENCY,
} from "../src/domains/creator/studio-vello-observed-poc";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(message: string): void {
  process.stdout.write(
    `[studio-vello-recorded-observation-consistency] ${message}\n`,
  );
}

function main(): void {
  const tenThousandWeb = STUDIO_VELLO_OBSERVED_FRAME_RUNS.find(
    ({ id }) => id === "chrome-webgpu-mmark-10k",
  );
  const fiftyThousandWeb = STUDIO_VELLO_OBSERVED_FRAME_RUNS.find(
    ({ id }) => id === "chrome-webgpu-mmark-50k",
  );

  invariant(tenThousandWeb, "Missing the observed Chrome WebGPU 10k-path run");
  invariant(fiftyThousandWeb, "Missing the observed Chrome WebGPU 50k-path run");
  invariant(
    STUDIO_VELLO_RECORDED_OBSERVATION_CONSISTENCY.valid,
    "Recorded aggregate relationships are inconsistent: "
      + STUDIO_VELLO_RECORDED_OBSERVATION_CONSISTENCY.errors.join("; "),
  );
  invariant(
    STUDIO_VELLO_RECORDED_OBSERVATION_CONSISTENCY.reranBenchmark === false
      && STUDIO_VELLO_RECORDED_OBSERVATION_CONSISTENCY
        .rawFrameSamplesVerified === false
      && STUDIO_VELLO_RECORDED_OBSERVATION_CONSISTENCY
        .percentilesRecomputedFromRawSamples === false,
    "This checker must not claim benchmark execution or raw-frame verification",
  );
  invariant(
    STUDIO_VELLO_CHROME_PAGE_REPEATABILITY.completedRuns
      === STUDIO_VELLO_CHROME_PAGE_REPEATABILITY.runCount,
    "The recorded Chrome page-repeatability suite is incomplete",
  );
  invariant(
    STUDIO_VELLO_CHROME_PAGE_REPEATABILITY.failedRuns === 0,
    "The recorded Chrome page-repeatability suite contains failures",
  );
  invariant(
    STUDIO_VELLO_CURRENT_CANDIDATE_EVALUATION.status === "research-only",
    "Vello must remain research-only until every promotion gate passes",
  );
  invariant(
    STUDIO_VELLO_CURRENT_CANDIDATE_EVALUATION.allHardGatesPassed === false,
    "The audited Vello version unexpectedly reports every hard gate as passed",
  );
  invariant(
    STUDIO_VELLO_CURRENT_CANDIDATE_EVALUATION.runtimeActivationAllowed === false
      && STUDIO_VELLO_OBSERVED_POC_DECISION.productRuntimeActivationAllowed === false,
    "Vello runtime activation is forbidden by the current evidence",
  );
  invariant(
    STUDIO_VELLO_OBSERVED_POC_DECISION.brushPixelAuthorityAllowed === false
      && STUDIO_VELLO_OBSERVED_POC_DECISION.canonicalAuthorityAllowed === false,
    "Observed PoC results must not grant brush-pixel or canonical authority",
  );
  invariant(
    STUDIO_VELLO_PROMOTION_GATES.every(({ hard }) => hard),
    "Every Vello promotion gate must remain hard",
  );

  log(
    `source v${STUDIO_VELLO_OBSERVED_SOURCE.packageVersion} `
    + `${STUDIO_VELLO_OBSERVED_SOURCE.sourceCommit.slice(0, 12)}`,
  );
  log(
    "scope: static recorded-aggregate consistency only; "
    + "the benchmark was not rerun and raw frame samples are unavailable",
  );
  log(
    `Chrome WebGPU 10k paths: p95 ${tenThousandWeb.p95Milliseconds.toFixed(1)}ms, `
    + `p99 ${tenThousandWeb.p99Milliseconds.toFixed(1)}ms`,
  );
  log(
    `Chrome WebGPU 50k paths: p95 ${fiftyThousandWeb.p95Milliseconds.toFixed(1)}ms, `
    + `p99 ${fiftyThousandWeb.p99Milliseconds.toFixed(1)}ms`,
  );
  log(
    `${STUDIO_VELLO_CHROME_PAGE_REPEATABILITY.completedRuns}/`
    + `${STUDIO_VELLO_CHROME_PAGE_REPEATABILITY.runCount} page repeats completed, `
    + `max p95 ${STUDIO_VELLO_CHROME_PAGE_REPEATABILITY.maximumP95Milliseconds.toFixed(1)}ms`,
  );
  log(
    `${STUDIO_VELLO_CURRENT_CANDIDATE_EVALUATION.score.passedGateCount}/`
    + `${STUDIO_VELLO_PROMOTION_GATES.length} promotion gates passed`,
  );
  log(`limitations ${STUDIO_VELLO_OBSERVED_POC_LIMITATIONS.length}`);
  log(
    "OK: recorded aggregates are internally consistent; "
    + "Vello remains an isolated research candidate and product activation is fail-closed",
  );
}

try {
  main();
} catch (error) {
  log(`FATAL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
}

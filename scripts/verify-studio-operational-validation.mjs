import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_OPERATIONAL_VALIDATION_MANIFEST =
  "docs/benchmarks/studio-operational-validation-certification.json";

const ARTIFACT_KINDS = new Set([
  "soak-pass",
  "soak-leak-regression",
  "runtime-fault-matrix",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an array" : "a non-empty array"}.`);
  }
  return value;
}

function boundedRepositoryPath(value, label) {
  const path = requireText(value, label);
  if (path.startsWith("/") || path.includes("..")) {
    throw new Error(`${label} must stay inside the repository: ${path}`);
  }
  return path;
}

export async function loadOperationalValidationManifest(
  root = process.cwd(),
  manifestPath = DEFAULT_OPERATIONAL_VALIDATION_MANIFEST,
) {
  const absolutePath = resolve(root, manifestPath);
  const raw = await readFile(absolutePath, "utf8");
  return { absolutePath, raw, manifest: JSON.parse(raw) };
}

export function validateOperationalValidationManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Operational validation manifest must be an object.");
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error("Operational validation manifest schemaVersion must be 1.");
  }
  requireText(manifest.suiteId, "suiteId");
  requireText(manifest.title, "title");

  const policy = manifest.claimPolicy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("claimPolicy is required.");
  }
  if (policy.automatedOperationalContractReadinessAllowed !== true) {
    throw new Error("Automated operational contract readiness must be explicitly allowed.");
  }
  if (policy.historicalEightHourSoakEvidenceAllowed !== true) {
    throw new Error("Historical eight-hour soak evidence must be explicitly bounded.");
  }
  if (policy.currentCommitEightHourSoakCertified !== false) {
    throw new Error("Current-commit eight-hour soak certification must remain false.");
  }
  if (policy.realHardwareBrowserCertificationAllowed !== false) {
    throw new Error("Real hardware/browser certification claims must remain blocked.");
  }
  if (policy.professionalReplacementClaimAllowed !== false) {
    throw new Error("Professional replacement claims must remain blocked.");
  }
  requireText(policy.reason, "claimPolicy.reason");

  const lanes = requireArray(manifest.lanes, "lanes");
  const laneIds = new Set();
  const testPaths = new Set();
  const artifactIds = new Set();
  const artifacts = [];

  for (const [index, lane] of lanes.entries()) {
    const id = requireText(lane?.id, `lanes[${index}].id`);
    if (laneIds.has(id)) throw new Error(`Duplicate operational lane: ${id}`);
    laneIds.add(id);
    requireText(lane.title, `lane ${id} title`);
    requireText(lane.outcome, `lane ${id} outcome`);

    for (const testPathValue of requireArray(lane.tests, `lane ${id} tests`)) {
      const path = boundedRepositoryPath(testPathValue, `lane ${id} test path`);
      if (!/\.(?:test|spec)\.(?:ts|tsx|mts|mjs)$/u.test(path)) {
        throw new Error(`Operational test evidence must be executable: ${path}`);
      }
      testPaths.add(path);
    }

    for (const [artifactIndex, artifact] of requireArray(
      lane.artifacts,
      `lane ${id} artifacts`,
      { allowEmpty: true },
    ).entries()) {
      const artifactId = requireText(
        artifact?.id,
        `lane ${id} artifacts[${artifactIndex}].id`,
      );
      if (artifactIds.has(artifactId)) {
        throw new Error(`Duplicate operational artifact id: ${artifactId}`);
      }
      artifactIds.add(artifactId);
      const kind = requireText(artifact.kind, `artifact ${artifactId} kind`);
      if (!ARTIFACT_KINDS.has(kind)) {
        throw new Error(`Unsupported operational artifact kind: ${kind}`);
      }
      artifacts.push(Object.freeze({
        id: artifactId,
        laneId: id,
        kind,
        path: boundedRepositoryPath(artifact.path, `artifact ${artifactId} path`),
      }));
    }
  }

  const externalReleaseGates = requireArray(
    manifest.externalReleaseGates,
    "externalReleaseGates",
  ).map((gate, index) => requireText(gate, `externalReleaseGates[${index}]`));

  return Object.freeze({
    laneIds: Object.freeze([...laneIds]),
    testPaths: Object.freeze([...testPaths].sort()),
    artifacts: Object.freeze(artifacts),
    externalReleaseGates: Object.freeze(externalReleaseGates),
  });
}

function summarizeRss(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("Soak evidence must contain RSS samples.");
  }
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample <= 0) {
      throw new Error("Soak RSS samples must be finite positive numbers.");
    }
    minimum = Math.min(minimum, sample);
    maximum = Math.max(maximum, sample);
  }
  const first = samples[0];
  const last = samples.at(-1);
  return Object.freeze({
    samples: samples.length,
    firstMiB: first,
    lastMiB: last,
    minimumMiB: minimum,
    maximumMiB: maximum,
    maximumGrowthMiB: maximum - first,
    lastGrowthMiB: last - first,
  });
}

function numeric(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function validateSoakPass(value) {
  const rss = summarizeRss(value.rssSamplesMb);
  const soakMinutes = numeric(value.config?.soakMinutes, "soak pass minutes");
  const totals = value.totals ?? {};
  if (soakMinutes < 480) throw new Error("Historical soak pass must cover at least eight hours.");
  if (numeric(totals.errors, "soak pass errors") !== 0 || value.errors?.length !== 0) {
    throw new Error("Historical soak pass must contain zero errors.");
  }
  if (numeric(totals.commands, "soak pass commands") < 20_000_000) {
    throw new Error("Historical soak pass command coverage is too small.");
  }
  if (numeric(totals.renders, "soak pass renders") < 1_000_000) {
    throw new Error("Historical soak pass render coverage is too small.");
  }
  if (rss.samples < 100_000) {
    throw new Error("Historical soak pass RSS sample coverage is too small.");
  }
  if (rss.maximumGrowthMiB > 192 || rss.lastGrowthMiB > 192) {
    throw new Error("Historical soak pass exceeds the bounded RSS growth threshold.");
  }
  if (value.rssFirstMb !== rss.firstMiB || value.rssLastMb !== rss.lastMiB) {
    throw new Error("Historical soak pass summary does not match its RSS samples.");
  }
  return Object.freeze({
    classification: "historical-eight-hour-pass",
    soakMinutes,
    totals,
    rss,
  });
}

function validateSoakLeakRegression(value) {
  const rss = summarizeRss(value.rssSamplesMb);
  const soakMinutes = numeric(value.config?.soakMinutes, "soak leak fixture minutes");
  const totals = value.totals ?? {};
  if (soakMinutes < 480) throw new Error("Leak regression fixture must cover eight hours.");
  if (numeric(totals.errors, "soak leak fixture errors") <= 0 || !value.errors?.length) {
    throw new Error("Leak regression fixture must contain detected failures.");
  }
  if (rss.maximumGrowthMiB < 1_000 || rss.lastGrowthMiB < 1_000) {
    throw new Error("Leak regression fixture no longer demonstrates unbounded growth.");
  }
  return Object.freeze({
    classification: "known-leak-negative-control",
    soakMinutes,
    totals,
    rss,
  });
}

function requireZero(value, label) {
  if (numeric(value, label) !== 0) throw new Error(`${label} must remain zero.`);
}

function validateRuntimeFaultMatrix(value) {
  if (
    value.schema !== "toonspectrum-v12-runtime-fault-matrix"
    || value.version !== 1
  ) {
    throw new Error("Runtime fault matrix identity is invalid.");
  }
  if (value.verdict?.automatedStateMachineGate !== "pass") {
    throw new Error("Runtime fault matrix automated gate must pass.");
  }
  if (
    value.verdict?.externalHardwareBrowserGate !== "required-not-run"
    || value.verdict?.releaseGate !== "not-satisfied-by-this-artifact-alone"
  ) {
    throw new Error("Runtime fault matrix must keep external gates unresolved.");
  }
  if (!Array.isArray(value.externalRequired) || value.externalRequired.length < 6) {
    throw new Error("Runtime fault matrix external gate list is incomplete.");
  }
  if (value.externalRequired.some((entry) => entry.status !== "required-not-run")) {
    throw new Error("Runtime fault matrix external gates must remain required-not-run.");
  }
  const measured = value.measured ?? {};
  requireZero(measured.deviceLoss?.lostCommands, "device loss lost commands");
  requireZero(measured.deviceLoss?.duplicateReplays, "device loss duplicate replays");
  if (measured.deviceLoss?.stagedCommands !== measured.deviceLoss?.replayedCommands) {
    throw new Error("Device loss staged and replayed commands must match.");
  }
  requireZero(
    measured.workerTermination?.staleMessagesApplied,
    "worker stale messages applied",
  );
  requireZero(
    measured.workerTermination?.duplicateAcceptedCommits,
    "worker duplicate accepted commits",
  );
  requireZero(
    measured.queueCompletionInversion?.staleResultsApplied,
    "queue stale results applied",
  );
  requireZero(measured.journalRecovery?.lostAcceptedEdits, "journal lost edits");
  requireZero(
    measured.journalRecovery?.duplicateJournalSequences,
    "journal duplicate sequences",
  );
  requireZero(measured.collaboration?.lostAcceptedEdits, "collaboration lost edits");
  requireZero(
    measured.collaboration?.duplicateServerCommits,
    "collaboration duplicate commits",
  );
  requireZero(
    measured.collaboration?.durableOutboxRowsAfterAck,
    "collaboration outbox rows after ack",
  );
  return Object.freeze({
    classification: "automated-fault-matrix-pass-external-gates-pending",
    simulatedFaults: value.simulated?.length ?? 0,
    externalRequired: value.externalRequired.length,
    measured,
  });
}

function validateArtifact(kind, value) {
  switch (kind) {
    case "soak-pass":
      return validateSoakPass(value);
    case "soak-leak-regression":
      return validateSoakLeakRegression(value);
    case "runtime-fault-matrix":
      return validateRuntimeFaultMatrix(value);
    default:
      throw new Error(`Unsupported operational artifact kind: ${kind}`);
  }
}

export async function verifyOperationalEvidence(root, validation) {
  const tests = [];
  for (const path of validation.testPaths) {
    const absolutePath = resolve(root, path);
    await access(absolutePath);
    const content = await readFile(absolutePath);
    tests.push(Object.freeze({ path, bytes: content.byteLength, sha256: sha256(content) }));
  }

  const artifacts = [];
  for (const descriptor of validation.artifacts) {
    const absolutePath = resolve(root, descriptor.path);
    await access(absolutePath);
    const content = await readFile(absolutePath);
    const value = JSON.parse(content.toString("utf8"));
    artifacts.push(Object.freeze({
      ...descriptor,
      bytes: content.byteLength,
      sha256: sha256(content),
      validation: validateArtifact(descriptor.kind, value),
    }));
  }
  return Object.freeze({ tests: Object.freeze(tests), artifacts: Object.freeze(artifacts) });
}

function runLane(root, lane) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const startedAt = Date.now();
  process.stdout.write(`\n[operational ${lane.id}] ${lane.title}\n`);
  const result = spawnSync(command, ["exec", "vitest", "run", ...lane.tests], {
    cwd: root,
    env: { ...process.env, CI: "true" },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Operational lane ${lane.id} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
  return Object.freeze({
    laneId: lane.id,
    status: "passed",
    durationMs: Date.now() - startedAt,
  });
}

export function createOperationalValidationReceipt({
  manifest,
  manifestRaw,
  evidence,
  runs = [],
  generatedAt = new Date().toISOString(),
}) {
  const testByPath = new Map(evidence.tests.map((entry) => [entry.path, entry]));
  const artifactById = new Map(evidence.artifacts.map((entry) => [entry.id, entry]));
  const runByLane = new Map(runs.map((entry) => [entry.laneId, entry]));
  const automatedReadiness = runs.length === manifest.lanes.length
    && runs.every((entry) => entry.status === "passed");
  return Object.freeze({
    schemaVersion: 1,
    suiteId: manifest.suiteId,
    generatedAt,
    manifestSha256: sha256(manifestRaw),
    automatedOperationalContractReadiness: automatedReadiness,
    historicalEightHourSoakEvidence: evidence.artifacts.some(
      (entry) => entry.kind === "soak-pass",
    ),
    currentCommitEightHourSoakCertified: false,
    realHardwareBrowserCertificationAllowed: false,
    professionalReplacementClaimAllowed: false,
    externalReleaseGates: Object.freeze([...manifest.externalReleaseGates]),
    lanes: manifest.lanes.map((lane) => {
      const run = runByLane.get(lane.id);
      return Object.freeze({
        id: lane.id,
        title: lane.title,
        status: run?.status ?? "evidence-only",
        durationMs: run?.durationMs ?? null,
        tests: lane.tests.map((path) => testByPath.get(path)),
        artifacts: lane.artifacts.map((artifact) => artifactById.get(artifact.id)),
      });
    }),
  });
}

export async function verifyStudioOperationalValidation({
  root = process.cwd(),
  manifestPath = DEFAULT_OPERATIONAL_VALIDATION_MANIFEST,
  run = false,
  receiptPath = null,
} = {}) {
  const loaded = await loadOperationalValidationManifest(root, manifestPath);
  const validation = validateOperationalValidationManifest(loaded.manifest);
  const evidence = await verifyOperationalEvidence(root, validation);
  const runs = run ? loaded.manifest.lanes.map((lane) => runLane(root, lane)) : [];
  const receipt = createOperationalValidationReceipt({
    manifest: loaded.manifest,
    manifestRaw: loaded.raw,
    evidence,
    runs,
  });
  if (receiptPath) {
    const absolutePath = resolve(root, receiptPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }
  process.stdout.write(
    `Operational validation verified: ${validation.laneIds.length} lanes · ${validation.testPaths.length} executable tests · ${validation.artifacts.length} bounded artifacts${run ? " · automated contracts passed" : ""}\n`,
  );
  process.stdout.write(
    "Current-commit eight-hour soak, real hardware/browser faults, and professional evaluation remain external release gates.\n",
  );
  return receipt;
}

function parseArguments(argv) {
  const result = {
    run: false,
    receiptPath: null,
    manifestPath: DEFAULT_OPERATIONAL_VALIDATION_MANIFEST,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") result.run = true;
    else if (argument === "--check") result.run = false;
    else if (argument === "--receipt") result.receiptPath = argv[++index];
    else if (argument === "--manifest") result.manifestPath = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await verifyStudioOperationalValidation(parseArguments(process.argv.slice(2)));
}

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_PUBLISHING_LIFECYCLE_MANIFEST =
  "docs/benchmarks/studio-publishing-lifecycle-certification.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  return value;
}

export async function loadPublishingLifecycleManifest(
  root = process.cwd(),
  manifestPath = DEFAULT_PUBLISHING_LIFECYCLE_MANIFEST,
) {
  const absolutePath = resolve(root, manifestPath);
  const raw = await readFile(absolutePath, "utf8");
  return { absolutePath, raw, manifest: JSON.parse(raw) };
}

export function validatePublishingLifecycleManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Publishing lifecycle manifest must be an object.");
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error("Publishing lifecycle manifest schemaVersion must be 1.");
  }
  requireText(manifest.suiteId, "suiteId");
  requireText(manifest.title, "title");
  const policy = manifest.claimPolicy;
  if (!policy || typeof policy !== "object") throw new Error("claimPolicy is required.");
  if (policy.automatedSelfPublishingReadinessAllowed !== true) {
    throw new Error("Automated self-publishing readiness must be explicitly allowed.");
  }
  if (policy.externalPlatformPackageReadinessAllowed !== true) {
    throw new Error("External platform package readiness must be explicit.");
  }
  if (policy.directExternalPlatformPublishingClaimAllowed !== false) {
    throw new Error("Direct external platform publishing claims must remain blocked.");
  }

  const lanes = requireArray(manifest.lanes, "lanes");
  const laneIds = new Set();
  const evidencePaths = new Set();
  for (const [index, lane] of lanes.entries()) {
    const id = requireText(lane?.id, `lanes[${index}].id`);
    if (laneIds.has(id)) throw new Error(`Duplicate publishing lane: ${id}`);
    laneIds.add(id);
    requireText(lane.title, `lane ${id} title`);
    requireText(lane.outcome, `lane ${id} outcome`);
    for (const evidence of requireArray(lane.evidence, `lane ${id} evidence`)) {
      const path = requireText(evidence, `lane ${id} evidence path`);
      if (path.startsWith("/") || path.includes("..")) {
        throw new Error(`Publishing evidence must stay inside the repository: ${path}`);
      }
      if (!/\.(?:test|spec)\.(?:ts|tsx|mts|mjs)$/u.test(path)) {
        throw new Error(`Publishing evidence must be an executable test file: ${path}`);
      }
      evidencePaths.add(path);
    }
  }
  return Object.freeze({
    lanes: Object.freeze([...laneIds]),
    evidencePaths: Object.freeze([...evidencePaths].sort()),
  });
}

export async function verifyPublishingLifecycleEvidence(root, validation) {
  const evidence = [];
  for (const path of validation.evidencePaths) {
    const absolutePath = resolve(root, path);
    await access(absolutePath);
    const content = await readFile(absolutePath);
    evidence.push(Object.freeze({
      path,
      bytes: content.byteLength,
      sha256: sha256(content),
    }));
  }
  return Object.freeze(evidence);
}

function runLane(root, lane) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const startedAt = Date.now();
  process.stdout.write(`\n[publishing ${lane.id}] ${lane.title}\n`);
  const result = spawnSync(
    command,
    ["exec", "vitest", "run", ...lane.evidence],
    {
      cwd: root,
      env: { ...process.env, CI: "true" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Publishing lane ${lane.id} failed with exit code ${result.status ?? "unknown"}.`);
  }
  return Object.freeze({
    laneId: lane.id,
    status: "passed",
    durationMs: Date.now() - startedAt,
  });
}

export function createPublishingLifecycleReceipt({
  manifest,
  manifestRaw,
  evidence,
  runs = [],
  generatedAt = new Date().toISOString(),
}) {
  const evidenceByPath = new Map(evidence.map((entry) => [entry.path, entry]));
  const runByLane = new Map(runs.map((entry) => [entry.laneId, entry]));
  const automatedReadiness = runs.length === manifest.lanes.length
    && runs.every((run) => run.status === "passed");
  return Object.freeze({
    schemaVersion: 1,
    suiteId: manifest.suiteId,
    generatedAt,
    manifestSha256: sha256(manifestRaw),
    automatedSelfPublishingReadiness: automatedReadiness,
    externalPlatformPackageReadiness: automatedReadiness,
    directExternalPlatformPublishingClaimAllowed: false,
    lanes: manifest.lanes.map((lane) => {
      const run = runByLane.get(lane.id);
      return Object.freeze({
        id: lane.id,
        title: lane.title,
        status: run?.status ?? "evidence-only",
        durationMs: run?.durationMs ?? null,
        evidence: lane.evidence.map((path) => evidenceByPath.get(path)),
      });
    }),
  });
}

export async function verifyStudioPublishingLifecycle({
  root = process.cwd(),
  manifestPath = DEFAULT_PUBLISHING_LIFECYCLE_MANIFEST,
  run = false,
  receiptPath = null,
} = {}) {
  const loaded = await loadPublishingLifecycleManifest(root, manifestPath);
  const validation = validatePublishingLifecycleManifest(loaded.manifest);
  const evidence = await verifyPublishingLifecycleEvidence(root, validation);
  const runs = run
    ? loaded.manifest.lanes.map((lane) => runLane(root, lane))
    : [];
  const receipt = createPublishingLifecycleReceipt({
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
    `Publishing lifecycle verified: ${validation.lanes.length} lanes · ${validation.evidencePaths.length} executable evidence files${run ? " · automated readiness passed" : ""}\n`,
  );
  process.stdout.write(
    "Direct third-party platform publishing remains outside the certified claim boundary.\n",
  );
  return receipt;
}

function parseArguments(argv) {
  const result = { run: false, receiptPath: null, manifestPath: DEFAULT_PUBLISHING_LIFECYCLE_MANIFEST };
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
  const options = parseArguments(process.argv.slice(2));
  await verifyStudioPublishingLifecycle(options);
}

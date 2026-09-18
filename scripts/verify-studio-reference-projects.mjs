import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_REFERENCE_PROJECT_MANIFEST =
  "docs/benchmarks/studio-reference-project-certification.json";

const REQUIRED_PROJECT_IDS = Object.freeze(["A", "B", "C", "D"]);

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values) {
  return [...new Set(values)];
}
export async function loadReferenceProjectManifest(
  root = process.cwd(),
  manifestPath = DEFAULT_REFERENCE_PROJECT_MANIFEST,
) {
  const absolutePath = resolve(root, manifestPath);
  const raw = await readFile(absolutePath, "utf8");
  const manifest = JSON.parse(raw);
  return { absolutePath, manifest, raw };
}

export function validateReferenceProjectManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Reference project manifest must be an object.");
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error("Reference project manifest schemaVersion must be 1.");
  }
  assertText(manifest.suiteId, "suiteId");
  assertText(manifest.title, "title");
  const claimPolicy = manifest.claimPolicy;
  if (!claimPolicy || typeof claimPolicy !== "object") {
    throw new Error("claimPolicy is required.");
  }
  if (claimPolicy.professionalReplacementClaimAllowed !== false) {
    throw new Error("Professional replacement claims must remain blocked.");
  }
  if (claimPolicy.externalValidationRequired !== true) {
    throw new Error("External creator validation must remain required.");
  }

  const projects = assertArray(manifest.projects, "projects");
  const projectIds = projects.map((project, index) =>
    assertText(project?.id, `projects[${index}].id`));
  if (new Set(projectIds).size !== projectIds.length) {
    throw new Error("Reference project ids must be unique.");
  }
  if (projectIds.sort().join(",") !== [...REQUIRED_PROJECT_IDS].sort().join(",")) {
    throw new Error("Reference project ids must be exactly A, B, C and D.");
  }
  const criterionIds = new Set();
  const allEvidence = [];
  for (const project of projects) {
    assertText(project.title, `project ${project.id} title`);
    assertText(project.outcome, `project ${project.id} outcome`);
    const criteria = assertArray(project.criteria, `project ${project.id} criteria`);
    for (const criterion of criteria) {
      const criterionId = assertText(
        criterion?.id,
        `project ${project.id} criterion id`,
      );
      const qualifiedId = `${project.id}:${criterionId}`;
      if (criterionIds.has(qualifiedId)) {
        throw new Error(`Duplicate criterion id: ${qualifiedId}`);
      }
      criterionIds.add(qualifiedId);
      assertText(criterion.label, `criterion ${qualifiedId} label`);
      const evidence = assertArray(
        criterion.evidence,
        `criterion ${qualifiedId} evidence`,
      );
      for (const evidencePath of evidence) {
        const normalized = assertText(
          evidencePath,
          `criterion ${qualifiedId} evidence path`,
        );
        if (normalized.startsWith("/") || normalized.includes("..")) {
          throw new Error(`Evidence paths must stay inside the repository: ${normalized}`);
        }
        if (!/\.(?:test|spec)\.(?:ts|tsx|mts|mjs)$/u.test(normalized)) {
          throw new Error(`Evidence must be executable test files: ${normalized}`);
        }
        allEvidence.push(normalized);
      }
    }
  }

  return Object.freeze({
    projectIds: Object.freeze(projectIds),
    criterionCount: criterionIds.size,
    evidencePaths: Object.freeze(unique(allEvidence).sort()),
  });
}
export async function verifyReferenceProjectEvidence(
  root,
  validation,
) {
  const evidence = [];
  for (const relativePath of validation.evidencePaths) {
    const absolutePath = resolve(root, relativePath);
    await access(absolutePath);
    const content = await readFile(absolutePath);
    evidence.push(Object.freeze({
      path: relativePath,
      bytes: content.byteLength,
      sha256: sha256(content),
    }));
  }
  return Object.freeze(evidence);
}

function projectTestFiles(project) {
  return unique(project.criteria.flatMap((criterion) => criterion.evidence)).sort();
}

export function createReferenceProjectReceipt({
  manifest,
  manifestRaw,
  evidence,
  runs = [],
  generatedAt = new Date().toISOString(),
}) {
  const evidenceByPath = new Map(evidence.map((entry) => [entry.path, entry]));
  const runById = new Map(runs.map((entry) => [entry.projectId, entry]));
  return Object.freeze({
    schemaVersion: 1,
    suiteId: manifest.suiteId,
    generatedAt,
    manifestSha256: sha256(manifestRaw),
    automatedReadiness: runs.length === manifest.projects.length
      && runs.every((entry) => entry.status === "passed"),
    professionalReplacementClaimAllowed: false,
    externalValidationRequired: true,
    projects: manifest.projects.map((project) => {
      const testFiles = projectTestFiles(project);
      const run = runById.get(project.id);
      return Object.freeze({
        id: project.id,
        title: project.title,
        status: run?.status ?? "evidence-only",
        durationMs: run?.durationMs ?? null,
        testFiles,
        evidence: testFiles.map((path) => evidenceByPath.get(path)),
      });
    }),
  });
}
export function runReferenceProjectTests(
  root,
  manifest,
  {
    command = process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    stdio = "inherit",
  } = {},
) {
  const runs = [];
  for (const project of manifest.projects) {
    const testFiles = projectTestFiles(project);
    const startedAt = Date.now();
    console.log(
      `\n[reference-project ${project.id}] ${project.title} · ${testFiles.length} evidence files`,
    );
    const result = spawnSync(
      command,
      ["exec", "vitest", "run", ...testFiles],
      {
        cwd: root,
        env: { ...process.env, CI: "true" },
        stdio,
        windowsHide: true,
      },
    );
    const durationMs = Date.now() - startedAt;
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Reference project ${project.id} failed with exit code ${result.status ?? "unknown"}.`,
      );
    }
    runs.push(Object.freeze({
      projectId: project.id,
      status: "passed",
      durationMs,
    }));
  }
  return Object.freeze(runs);
}

function parseArguments(argv) {
  const result = {
    run: false,
    manifestPath: DEFAULT_REFERENCE_PROJECT_MANIFEST,
    receiptPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") result.run = true;
    else if (argument === "--check") result.run = false;
    else if (argument === "--manifest") {
      result.manifestPath = argv[++index];
    } else if (argument === "--receipt") {
      result.receiptPath = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}
export async function verifyStudioReferenceProjects({
  root = process.cwd(),
  manifestPath = DEFAULT_REFERENCE_PROJECT_MANIFEST,
  run = false,
  receiptPath = null,
} = {}) {
  const loaded = await loadReferenceProjectManifest(root, manifestPath);
  const validation = validateReferenceProjectManifest(loaded.manifest);
  const evidence = await verifyReferenceProjectEvidence(root, validation);
  const runs = run
    ? runReferenceProjectTests(root, loaded.manifest)
    : Object.freeze([]);
  const receipt = createReferenceProjectReceipt({
    manifest: loaded.manifest,
    manifestRaw: loaded.raw,
    evidence,
    runs,
  });

  if (receiptPath) {
    const absoluteReceiptPath = resolve(root, receiptPath);
    await mkdir(dirname(absoluteReceiptPath), { recursive: true });
    await writeFile(
      absoluteReceiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(
    `Reference projects verified: ${validation.projectIds.join(", ")} · ${validation.criterionCount} criteria · ${validation.evidencePaths.length} executable evidence files${run ? " · test execution passed" : ""}`,
  );
  console.log(
    "Professional replacement claim remains blocked until signed external creator validation is attached.",
  );
  return receipt;
}

if (
  process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const arguments_ = parseArguments(process.argv.slice(2));
  await verifyStudioReferenceProjects({
    root: process.cwd(),
    manifestPath: arguments_.manifestPath,
    run: arguments_.run,
    receiptPath: arguments_.receiptPath,
  });
}

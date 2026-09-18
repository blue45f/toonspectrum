import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_MANIFEST = "docs/benchmarks/studio-competitor-replacement-program.json";
const VALID_STATES = new Set([
  "implemented",
  "validation-harness-implemented",
  "external-validation-required",
]);

type ProgramState =
  | "implemented"
  | "validation-harness-implemented"
  | "external-validation-required";

interface ProgramItem {
  readonly id: string;
  readonly title: string;
  readonly track: string;
  readonly state: ProgramState;
  readonly evidence: readonly string[];
}

interface ProgramManifest {
  readonly schemaVersion: number;
  readonly asOf: string;
  readonly program: readonly ProgramItem[];
  readonly summary: Readonly<Record<string, unknown>>;
  readonly claimPolicy: string;
}

export interface ReplacementVerificationResult {
  readonly manifestPath: string;
  readonly workstreams: number;
  readonly evidencePaths: number;
  readonly implemented: number;
  readonly validationHarnesses: number;
  readonly externalValidationRequired: number;
  readonly replacementClaimAllowed: boolean;
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function parseItem(value: unknown, index: number): ProgramItem {
  assertRecord(value, `program[${index}]`);
  if (
    typeof value.id !== "string"
    || typeof value.title !== "string"
    || typeof value.track !== "string"
    || typeof value.state !== "string"
    || !Array.isArray(value.evidence)
    || !value.evidence.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    throw new Error(`program[${index}] has an invalid shape`);
  }
  if (!VALID_STATES.has(value.state)) {
    throw new Error(`program[${index}] has an unsupported state: ${value.state}`);
  }
  return value as unknown as ProgramItem;
}

function parseManifest(value: unknown): ProgramManifest {
  assertRecord(value, "manifest");
  if (
    value.schemaVersion !== 1
    || typeof value.asOf !== "string"
    || !Array.isArray(value.program)
    || typeof value.claimPolicy !== "string"
  ) {
    throw new Error("replacement program manifest has an invalid top-level shape");
  }
  assertRecord(value.summary, "manifest.summary");
  return {
    schemaVersion: 1,
    asOf: value.asOf,
    program: value.program.map(parseItem),
    summary: value.summary,
    claimPolicy: value.claimPolicy,
  };
}

function countState(program: readonly ProgramItem[], state: ProgramState): number {
  return program.filter((item) => item.state === state).length;
}

export async function verifyReplacementProgram(
  root = process.cwd(),
  manifestPath = DEFAULT_MANIFEST,
): Promise<ReplacementVerificationResult> {
  const absoluteManifest = resolve(root, manifestPath);
  const manifest = parseManifest(JSON.parse(await readFile(absoluteManifest, "utf8")));
  if (manifest.program.length !== 57) {
    throw new Error(`replacement program must contain 57 workstreams, got ${manifest.program.length}`);
  }
  let evidencePaths = 0;
  for (const [index, item] of manifest.program.entries()) {
    const expectedId = `PR-${String(index + 1).padStart(3, "0")}`;
    if (item.id !== expectedId) {
      throw new Error(`expected ${expectedId} at index ${index}, got ${item.id}`);
    }
    if (item.evidence.length === 0) {
      throw new Error(`${item.id} must declare at least one evidence path`);
    }
    for (const evidence of item.evidence) {
      const normalized = evidence.replaceAll("\\", "/");
      if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
        throw new Error(`${item.id} evidence must be repository-relative: ${evidence}`);
      }
      const absolute = resolve(root, normalized);
      await access(absolute);
      const metadata = await stat(absolute);
      if (!metadata.isFile()) {
        throw new Error(`${item.id} evidence must be a file: ${evidence}`);
      }
      evidencePaths += 1;
    }
  }

  const implemented = countState(manifest.program, "implemented");
  const validationHarnesses = countState(
    manifest.program,
    "validation-harness-implemented",
  );
  const externalValidationRequired = countState(
    manifest.program,
    "external-validation-required",
  );
  const externalIds = manifest.program
    .filter((item) => item.state === "external-validation-required")
    .map((item) => item.id);
  if (externalIds.length !== 1 || externalIds[0] !== "PR-057") {
    throw new Error(
      `only PR-057 may require external validation, got ${externalIds.join(", ")}`,
    );
  }

  const expectedSummary = {
    plannedWorkstreams: 57,
    implementedWorkstreams: implemented,
    validationHarnessesImplemented: validationHarnesses,
    externalValidationRequired,
    replacementClaimAllowed: externalValidationRequired === 0,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    if (manifest.summary[key] !== expected) {
      throw new Error(
        `manifest.summary.${key} must be ${String(expected)}, got ${String(manifest.summary[key])}`,
      );
    }
  }

  return {
    manifestPath,
    workstreams: manifest.program.length,
    evidencePaths,
    implemented,
    validationHarnesses,
    externalValidationRequired,
    replacementClaimAllowed: expectedSummary.replacementClaimAllowed,
  };
}

async function main(): Promise<void> {
  const result = await verifyReplacementProgram();
  const output = process.argv.includes("--json")
    ? JSON.stringify(result)
    : [
        `Studio competitor-replacement program: ${result.workstreams} workstreams`,
        `Evidence paths checked: ${result.evidencePaths}`,
        `Implemented: ${result.implemented}`,
        `Validation harnesses: ${result.validationHarnesses}`,
        `External validation required: ${result.externalValidationRequired}`,
        `Replacement claim allowed: ${result.replacementClaimAllowed ? "yes" : "no"}`,
      ].join("\n");
  process.stdout.write(`${output}\n`);
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (entryUrl === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

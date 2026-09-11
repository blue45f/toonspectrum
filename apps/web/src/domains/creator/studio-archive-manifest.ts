export type StudioArchiveFileKind = "document" | "asset" | "version" | "rights" | "settings" | "preview";

export interface StudioArchiveFile {
  readonly path: string;
  readonly kind: StudioArchiveFileKind;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly required: boolean;
}

export interface StudioArchiveDependency {
  readonly fromPath: string;
  readonly toPath: string;
}

export interface StudioArchiveManifest {
  readonly schemaVersion: number;
  readonly applicationVersion: string;
  readonly projectId: string;
  readonly createdAt: string;
  readonly rootDocumentPaths: readonly string[];
  readonly files: readonly StudioArchiveFile[];
  readonly dependencies: readonly StudioArchiveDependency[];
}

export interface StudioArchiveValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly totalSizeBytes: number;
}

export interface StudioArchiveRestorePlan {
  readonly status: "ready" | "review" | "blocked";
  readonly importPaths: readonly string[];
  readonly renamedPaths: Readonly<Record<string, string>>;
  readonly skippedOptionalPaths: readonly string[];
  readonly issues: readonly string[];
}

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/iu;

export function validateStudioArchiveManifest(
  manifest: StudioArchiveManifest,
): StudioArchiveValidation {
  const issues: string[] = [];
  if (
    !Number.isSafeInteger(manifest.schemaVersion)
    || manifest.schemaVersion < 1
    || !manifest.applicationVersion.trim()
    || !manifest.projectId.trim()
    || !Number.isFinite(Date.parse(manifest.createdAt))
  ) {
    issues.push("manifest-required");
  }
  const paths = manifest.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) issues.push("file-path-duplicate");
  const pathSet = new Set(paths);
  for (const file of manifest.files) {
    if (
      !file.path.trim()
      || file.path.startsWith("/")
      || file.path.includes("..")
      || file.path.includes("\\")
      || !Number.isSafeInteger(file.sizeBytes)
      || file.sizeBytes < 0
      || !CHECKSUM_PATTERN.test(file.checksum)
    ) {
      issues.push("file-invalid");
    }
  }
  if (manifest.rootDocumentPaths.length === 0
    || manifest.rootDocumentPaths.some((path) => !pathSet.has(path))) {
    issues.push("root-document-missing");
  }
  const dependencyKeys = manifest.dependencies.map((dependency) => `${dependency.fromPath}\u0000${dependency.toPath}`);
  if (new Set(dependencyKeys).size !== dependencyKeys.length) issues.push("dependency-duplicate");
  for (const dependency of manifest.dependencies) {
    if (!pathSet.has(dependency.fromPath) || !pathSet.has(dependency.toPath)) {
      issues.push("dependency-file-missing");
    }
    if (dependency.fromPath === dependency.toPath) issues.push("dependency-self-reference");
  }
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze([...new Set(issues)]),
    totalSizeBytes: manifest.files.reduce((sum, file) => sum + file.sizeBytes, 0),
  });
}

function collisionPath(path: string, index: number): string {
  const dot = path.lastIndexOf(".");
  if (dot <= 0) return `${path}-restored-${index}`;
  return `${path.slice(0, dot)}-restored-${index}${path.slice(dot)}`;
}

export function planStudioArchiveRestore(input: {
  readonly manifest: StudioArchiveManifest;
  readonly supportedSchemaVersions: readonly number[];
  readonly existingPaths: readonly string[];
  readonly availablePaths: readonly string[];
}): StudioArchiveRestorePlan {
  const validation = validateStudioArchiveManifest(input.manifest);
  if (!validation.valid) {
    return Object.freeze({
      status: "blocked",
      importPaths: Object.freeze([]),
      renamedPaths: Object.freeze({}),
      skippedOptionalPaths: Object.freeze([]),
      issues: validation.issues,
    });
  }
  if (!input.supportedSchemaVersions.includes(input.manifest.schemaVersion)) {
    return Object.freeze({
      status: "blocked",
      importPaths: Object.freeze([]),
      renamedPaths: Object.freeze({}),
      skippedOptionalPaths: Object.freeze([]),
      issues: Object.freeze(["schema-version-unsupported"]),
    });
  }
  const available = new Set(input.availablePaths);
  const existing = new Set(input.existingPaths);
  const importPaths: string[] = [];
  const skippedOptionalPaths: string[] = [];
  const renamedPaths: Record<string, string> = {};
  const issues: string[] = [];
  let collisionIndex = 1;
  for (const file of input.manifest.files) {
    if (!available.has(file.path)) {
      if (file.required) issues.push(`required-file-missing:${file.path}`);
      else skippedOptionalPaths.push(file.path);
      continue;
    }
    let target = file.path;
    while (existing.has(target) || importPaths.includes(target)) {
      target = collisionPath(file.path, collisionIndex);
      collisionIndex += 1;
    }
    if (target !== file.path) renamedPaths[file.path] = target;
    importPaths.push(target);
  }
  const blocked = issues.some((value) => value.startsWith("required-file-missing:"));
  return Object.freeze({
    status: blocked ? "blocked" : Object.keys(renamedPaths).length > 0 || skippedOptionalPaths.length > 0
      ? "review"
      : "ready",
    importPaths: Object.freeze(importPaths),
    renamedPaths: Object.freeze({ ...renamedPaths }),
    skippedOptionalPaths: Object.freeze(skippedOptionalPaths),
    issues: Object.freeze(issues),
  });
}

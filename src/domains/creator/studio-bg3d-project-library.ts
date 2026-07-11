import {
  getStoredBg3dModelByHash,
  importVerifiedBg3dModelsAtomically,
  revalidateStoredBg3dModelForRendering,
  type Bg3dModelImportItem,
  type Bg3dModelVerificationOptions,
  type Bg3dVerifiedStoredRecord,
} from "./bg3d-model-library";
import {
  STUDIO_BG3D_GLB_MIME,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dAttachmentRights,
} from "./studio-bg3d-scene-document";
import {
  buildStudioProjectArchive,
  collectStudioBg3dProjectArchivePlan,
  type BuildStudioProjectArchiveInput,
  type BuildStudioProjectArchiveResult,
  type ImportStudioProjectArchiveResult,
  type StudioBg3dProjectArchivePlan,
  type StudioProjectArchiveAttachmentInput,
  type StudioProjectArchiveLimits,
  type StudioProjectArchiveOptions,
} from "./studio-project-archive";

import type { StudioProjectFile } from "./studio-project-file";

/**
 * IndexedDB is deliberately kept outside project and archive documents. This bridge resolves a
 * canonical content hash at the last possible moment, revalidates the stored bytes, and returns
 * only validator-owned GLB bytes plus portable document references.
 */

export type StudioBg3dProjectLibraryErrorCode =
  | "export-model-missing"
  | "export-model-mismatch"
  | "export-model-untrusted"
  | "import-attachment-missing"
  | "import-attachment-mismatch"
  | "import-project-mismatch";

const ERROR_MESSAGES: Readonly<Record<StudioBg3dProjectLibraryErrorCode, string>> = Object.freeze({
  "export-model-missing": "프로젝트의 3D 모델을 로컬 검증 라이브러리에서 찾을 수 없습니다.",
  "export-model-mismatch": "프로젝트의 3D 모델 정보가 로컬 검증 자산과 일치하지 않습니다.",
  "export-model-untrusted": "프로젝트의 3D 모델이 내보내기 안전 검사를 통과하지 못했습니다.",
  "import-attachment-missing": "프로젝트 archive에 필요한 3D 모델 파일이 없습니다.",
  "import-attachment-mismatch": "프로젝트 archive의 3D 모델 정보가 장면 문서와 일치하지 않습니다.",
  "import-project-mismatch": "검증한 프로젝트와 복구할 3D 장면 원본이 일치하지 않습니다.",
});

export class StudioBg3dProjectLibraryError extends Error {
  readonly code: StudioBg3dProjectLibraryErrorCode;

  constructor(code: StudioBg3dProjectLibraryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "StudioBg3dProjectLibraryError";
    this.code = code;
  }
}

export interface StudioBg3dProjectLibraryDependencies {
  readonly collectPlan: typeof collectStudioBg3dProjectArchivePlan;
  readonly getStoredByHash: typeof getStoredBg3dModelByHash;
  readonly revalidateStored: typeof revalidateStoredBg3dModelForRendering;
  readonly importAtomically: typeof importVerifiedBg3dModelsAtomically;
  readonly buildArchive: typeof buildStudioProjectArchive;
}

export interface PrepareStudioBg3dProjectArchiveOptions {
  readonly limits?: Partial<StudioProjectArchiveLimits>;
  /** Optional renderer extension allowlist; the validator's conservative default is used otherwise. */
  readonly supportedRequiredExtensions?: readonly string[];
}

export interface InstallStudioBg3dProjectArchiveOptions {
  readonly limits?: Partial<StudioProjectArchiveLimits>;
  /** Applied to the library's second validation pass before its one atomic IndexedDB write. */
  readonly verification?: Bg3dModelVerificationOptions;
}

const DEFAULT_DEPENDENCIES: StudioBg3dProjectLibraryDependencies = Object.freeze({
  collectPlan: collectStudioBg3dProjectArchivePlan,
  getStoredByHash: getStoredBg3dModelByHash,
  revalidateStored: revalidateStoredBg3dModelForRendering,
  importAtomically: importVerifiedBg3dModelsAtomically,
  buildArchive: buildStudioProjectArchive,
});

function resolveDependencies(
  overrides: Partial<StudioBg3dProjectLibraryDependencies>,
): StudioBg3dProjectLibraryDependencies {
  return { ...DEFAULT_DEPENDENCIES, ...overrides };
}

function rightsMatch(left: StudioBg3dAttachmentRights, right: StudioBg3dAttachmentRights): boolean {
  return left.status === right.status
    && left.commercialUse === right.commercialUse
    && left.attributionRequired === right.attributionRequired
    && left.attribution === right.attribution
    && left.licenseName === right.licenseName;
}

function recordMatchesPlan(
  record: Bg3dVerifiedStoredRecord,
  planned: StudioBg3dProjectArchivePlan["attachments"][number],
): boolean {
  return record.storageVersion === 2
    && record.format === "glb"
    && record.contentHash === `sha256:${planned.sha256}`
    && record.byteSize === planned.byteSize
    && record.mime === planned.mimeType
    && rightsMatch(record.rights, planned.attachment.rights);
}

function copyReferences(
  references: StudioBg3dProjectArchivePlan["attachments"][number]["documentReferences"],
): NonNullable<StudioProjectArchiveAttachmentInput["documentReferences"]> {
  return references.map((reference) => ({
    pointer: reference.pointer,
    usage: reference.usage,
    ...(reference.mode ? { mode: reference.mode } : {}),
  }));
}

/**
 * Resolves every scene hash before validation starts. Missing or conflicting library rows therefore
 * fail before any archive builder is invoked, and no private IndexedDB id can enter the result.
 */
async function prepareAttachmentsFromPlan(
  plan: StudioBg3dProjectArchivePlan,
  options: PrepareStudioBg3dProjectArchiveOptions,
  dependencies: StudioBg3dProjectLibraryDependencies,
): Promise<StudioProjectArchiveAttachmentInput[]> {
  if (plan.attachments.length === 0) return [];

  let records: (Bg3dVerifiedStoredRecord | null)[];
  try {
    records = await Promise.all(
      plan.attachments.map((planned) => dependencies.getStoredByHash(planned.sha256)),
    );
  } catch {
    throw new StudioBg3dProjectLibraryError("export-model-missing");
  }
  if (records.some((record) => record === null)) {
    throw new StudioBg3dProjectLibraryError("export-model-missing");
  }

  const verifiedRecords = records as Bg3dVerifiedStoredRecord[];
  for (let index = 0; index < plan.attachments.length; index += 1) {
    const planned = plan.attachments[index];
    const record = verifiedRecords[index];
    if (!planned || !record || !recordMatchesPlan(record, planned)) {
      throw new StudioBg3dProjectLibraryError("export-model-mismatch");
    }
  }

  const attachments: StudioProjectArchiveAttachmentInput[] = [];
  let cumulativeUsedBytes = 0;
  for (let index = 0; index < plan.attachments.length; index += 1) {
    const planned = plan.attachments[index];
    const record = verifiedRecords[index];
    if (!planned || !record) throw new StudioBg3dProjectLibraryError("export-model-mismatch");
    let validation;
    try {
      validation = await dependencies.revalidateStored(record, {
        profile: "desktop",
        budgets: planned.validationBudgets,
        cumulativeUsedBytes,
        maximumCumulativeBytes: plan.totalAttachmentBytes,
        supportedRequiredExtensions: options.supportedRequiredExtensions,
      });
    } catch {
      throw new StudioBg3dProjectLibraryError("export-model-untrusted");
    }
    const expectedCumulativeBytes = cumulativeUsedBytes + planned.byteSize;
    if (
      validation.verifiedSha256 !== record.contentHash
      || validation.verifiedBytes.byteLength !== planned.byteSize
      || validation.metrics.byteSize !== planned.byteSize
      || validation.cumulativeBytesAfter !== expectedCumulativeBytes
    ) {
      throw new StudioBg3dProjectLibraryError("export-model-untrusted");
    }
    cumulativeUsedBytes = validation.cumulativeBytesAfter;
    attachments.push({
      kind: "glb",
      data: validation.verifiedBytes,
      mimeType: STUDIO_BG3D_GLB_MIME,
      documentReferences: copyReferences(planned.documentReferences),
    });
  }
  return attachments;
}

export async function prepareStudioBg3dProjectArchiveAttachments(
  project: unknown,
  options: PrepareStudioBg3dProjectArchiveOptions = {},
  dependencyOverrides: Partial<StudioBg3dProjectLibraryDependencies> = {},
): Promise<StudioProjectArchiveAttachmentInput[]> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const plan = dependencies.collectPlan(project, { limits: options.limits });
  return prepareAttachmentsFromPlan(plan, options, dependencies);
}

/** Thin StudioPage helper: verified BG3D bytes are prepared before the archive builder can run. */
export async function buildStudioProjectArchiveWithVerifiedBg3dModels(
  input: BuildStudioProjectArchiveInput,
  options: StudioProjectArchiveOptions = {},
  dependencyOverrides: Partial<StudioBg3dProjectLibraryDependencies> = {},
): Promise<BuildStudioProjectArchiveResult> {
  const dependencies = resolveDependencies(dependencyOverrides);
  // collectPlan returns a bounded canonical clone. Keep that one immutable snapshot across every
  // async hash lookup/revalidation and the archive builder so rights or scene metadata cannot be
  // changed on the caller-owned object between those boundaries.
  const plan = dependencies.collectPlan(input.project, { limits: options.limits });
  const bg3dAttachments = await prepareAttachmentsFromPlan(
    plan,
    { limits: options.limits },
    dependencies,
  );
  return dependencies.buildArchive({
    ...input,
    project: plan.project,
    attachments: [...(input.attachments ?? []), ...bg3dAttachments],
  }, options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rehydration may legitimately change raster `src` fields, but it must never change any canonical
 * BG3D scene. Compare the complete scene JSON at its stable document pointer, not only attachment
 * hashes, so camera, nodes, rights, budgets, and output settings are all bound to the authenticated
 * archive project.
 */
function collectBg3dSceneFingerprints(project: StudioProjectFile): string[] {
  const fingerprints: string[] = [];
  const visitElements = (elements: readonly unknown[], basePointer: string): void => {
    elements.forEach((element, index) => {
      if (!isRecord(element) || element.type !== "image" || element.bg3dScene === undefined) return;
      const serialized = serializeStudioBg3dSceneDocument(element.bg3dScene);
      if (!serialized) throw new StudioBg3dProjectLibraryError("import-project-mismatch");
      fingerprints.push(`${basePointer}/${index}/bg3dScene\u0000${serialized}`);
    });
  };
  project.pagesList.forEach((page, pageIndex) => {
    visitElements(page.elements, `/pagesList/${pageIndex}/elements`);
  });
  if (isRecord(project.master) && Array.isArray(project.master.elements)) {
    visitElements(project.master.elements, "/master/elements");
  }
  return fingerprints;
}

function bg3dScenesMatch(left: StudioProjectFile, right: StudioProjectFile): boolean {
  const leftFingerprints = collectBg3dSceneFingerprints(left);
  const rightFingerprints = collectBg3dSceneFingerprints(right);
  return leftFingerprints.length === rightFingerprints.length
    && leftFingerprints.every((fingerprint, index) => fingerprint === rightFingerprints[index]);
}

function referenceKey(reference: {
  readonly pointer: string;
  readonly usage: string;
  readonly mode?: string;
}): string {
  return `${reference.pointer}\u0000${reference.usage}\u0000${reference.mode ?? "asset-uri"}`;
}

function referencesMatch(
  planned: StudioBg3dProjectArchivePlan["attachments"][number]["documentReferences"],
  actual: readonly { readonly pointer: string; readonly usage: string; readonly mode?: string }[],
): boolean {
  if (planned.length !== actual.length) return false;
  const expected = new Set(planned.map(referenceKey));
  return expected.size === planned.length && actual.every((reference) => expected.has(referenceKey(reference)));
}

function createImportItem(
  planned: StudioBg3dProjectArchivePlan["attachments"][number],
  imported: ImportStudioProjectArchiveResult["attachments"] extends ReadonlyMap<string, infer Value>
    ? Value
    : never,
): Bg3dModelImportItem {
  const { metadata, blob } = imported;
  if (
    metadata.sha256 !== planned.sha256
    || metadata.byteSize !== planned.byteSize
    || metadata.mimeType !== planned.mimeType
    || !metadata.kinds.includes("glb")
    || blob.size !== planned.byteSize
    || blob.type !== planned.mimeType
    || !referencesMatch(planned.documentReferences, metadata.documentReferences)
  ) {
    throw new StudioBg3dProjectLibraryError("import-attachment-mismatch");
  }
  return {
    file: {
      name: planned.attachment.name,
      size: planned.byteSize,
      type: planned.mimeType,
      arrayBuffer: () => blob.arrayBuffer(),
    },
    rights: { ...planned.attachment.rights },
    expectedSha256: planned.attachment.hash,
  };
}

export interface InstallStudioBg3dProjectArchiveResult<ApplyResult> {
  readonly records: readonly Bg3dVerifiedStoredRecord[];
  readonly applyResult: ApplyResult;
}

/**
 * Verifies the complete canonical-project-to-archive map before the library's single atomic import.
 * The caller's project mutation runs only after that import succeeds. Empty BG3D plans skip IDB.
 */
export async function installStudioBg3dProjectArchiveModelsAndApply<ApplyResult>(
  importedResult: ImportStudioProjectArchiveResult,
  applyProject: (
    project: StudioProjectFile,
    importedResult: ImportStudioProjectArchiveResult,
  ) => ApplyResult | Promise<ApplyResult>,
  options: InstallStudioBg3dProjectArchiveOptions = {},
  dependencyOverrides: Partial<StudioBg3dProjectLibraryDependencies> = {},
): Promise<InstallStudioBg3dProjectArchiveResult<ApplyResult>> {
  const dependencies = resolveDependencies(dependencyOverrides);
  // Both calls synchronously create bounded snapshots before the first await. The authenticated
  // canonical project and the rehydrated project may differ in raster data URLs only; every BG3D
  // scene must be byte-for-byte canonical identical.
  const plan = dependencies.collectPlan(importedResult.canonicalProject, { limits: options.limits });
  const applyPlan = dependencies.collectPlan(importedResult.project, { limits: options.limits });
  if (!bg3dScenesMatch(plan.project, applyPlan.project)) {
    throw new StudioBg3dProjectLibraryError("import-project-mismatch");
  }
  const items: Bg3dModelImportItem[] = [];
  for (const planned of plan.attachments) {
    const imported = importedResult.attachments.get(planned.sha256);
    if (!imported) throw new StudioBg3dProjectLibraryError("import-attachment-missing");
    items.push(createImportItem(planned, imported));
  }

  const records = items.length > 0
    ? await dependencies.importAtomically(items, {
      ...options.verification,
      profile: options.verification?.profile ?? "desktop",
      cumulativeUsedBytes: options.verification?.cumulativeUsedBytes ?? 0,
      maximumCumulativeBytes: options.verification?.maximumCumulativeBytes
        ?? Math.max(1, (options.verification?.cumulativeUsedBytes ?? 0) + plan.totalAttachmentBytes),
    })
    : [];
  const applyResult = await applyProject(applyPlan.project, importedResult);
  return { records, applyResult };
}

import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

import {
  parseStudioAutosave,
  studioAutosaveKey,
  studioLifecycleAutosaveSidecarKey,
  writeStudioLifecycleAutosave,
  type StudioAutosavePayload,
} from "../studio-autosave";
import {
  createStudioProjectDocument,
  readStudioProjectDocuments,
  studioProjectDocumentHref,
  studioProjectDocumentStorageKey,
  type StudioDocumentKind,
  type StudioDocumentWorkspace,
  type StudioProjectDocumentEntry,
} from "../studio-project-document-store";
import {
  createStudioProject,
  markStudioProjectOpened,
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
  type StudioProjectKind,
  type StudioProjectLibraryEntry,
} from "../studio-project-library-store";
import { readStudioZipArchive } from "../studio-zip-reader";
import {
  ensureStudioSaveProfile,
  markStudioStorageBindingSynced,
  recordStudioManualSave,
  STUDIO_SAVE_PROFILE_STORAGE_KEY,
  upsertStudioStorageBinding,
} from "./studio-save-profile";
import {
  STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY,
} from "./studio-project-workspace-snapshots";

const REQUIRED_ENTRIES = Object.freeze([
  "manifest.json",
  "project/project.json",
  "project/documents.json",
  "storage/profile.json",
  "distribution/submissions.json",
  "README.txt",
  `workspace/${STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY}`,
]);
const PACKAGE_ENTRY_PATTERN = /^(?:manifest\.json|README\.txt|project\/(?:project|documents)\.json|storage\/profile\.json|distribution\/submissions\.json|workspace\/documents\/(?:index\.json|document-\d{4}\.autosave\.json))$/u;
const decoder = new TextDecoder("utf-8", { fatal: true });

interface PackageManifest {
  readonly format: "toonstudio-project";
  readonly formatVersion: 1;
  readonly entryNames: readonly string[];
}

interface WorkspaceIndexItem {
  readonly documentId: string;
  readonly entry: string | null;
}

interface WorkspaceIndex {
  readonly format: "toonstudio-project-workspace";
  readonly formatVersion: 1;
  readonly documents: readonly WorkspaceIndexItem[];
}

interface ParsedProjectPackage {
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly snapshots: ReadonlyMap<string, StudioAutosavePayload>;
  readonly autoSave: boolean;
  readonly createVersions: boolean;
}

export interface StudioProjectPackageImportResult {
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly restoredSnapshotCount: number;
  readonly href: string;
}

export interface StudioProjectPackageImportOptions {
  readonly storage: Storage;
  readonly target?: EventTarget;
  readonly authUserId?: string | null;
  readonly now?: string;
  readonly createProjectId?: () => string;
  readonly createDocumentId?: () => string;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ToonStudio 프로젝트 패키지의 JSON 구조가 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`ToonStudio 프로젝트 패키지의 ${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function jsonValue(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(`${path} JSON을 안전하게 읽지 못했습니다.`);
  }
}

function parseManifest(value: unknown): PackageManifest {
  const input = record(value);
  if (input.format !== "toonstudio-project" || input.formatVersion !== 1) {
    throw new Error("지원하지 않는 ToonStudio 프로젝트 패키지 버전입니다.");
  }
  if (!Array.isArray(input.entryNames) || input.entryNames.some((entry) => typeof entry !== "string")) {
    throw new Error("ToonStudio 프로젝트 패키지 manifest의 파일 목록이 올바르지 않습니다.");
  }
  return Object.freeze({
    format: "toonstudio-project",
    formatVersion: 1,
    entryNames: Object.freeze([...input.entryNames] as string[]),
  });
}

function parseWorkspaceIndex(value: unknown): WorkspaceIndex {
  const input = record(value);
  if (input.format !== "toonstudio-project-workspace" || input.formatVersion !== 1) {
    throw new Error("지원하지 않는 ToonStudio 원고 저장 형식입니다.");
  }
  if (!Array.isArray(input.documents)) {
    throw new Error("ToonStudio 원고 index에 문서 목록이 없습니다.");
  }
  const documents = input.documents.map((item) => {
    const entry = record(item);
    const documentId = stringValue(entry.documentId, "원고 문서 ID");
    const snapshotEntry = entry.entry === null
      ? null
      : stringValue(entry.entry, "원고 스냅샷 경로");
    if (snapshotEntry && !/^documents\/document-\d{4}\.autosave\.json$/u.test(snapshotEntry)) {
      throw new Error("ToonStudio 원고 스냅샷 경로가 허용된 형식이 아닙니다.");
    }
    return Object.freeze({ documentId, entry: snapshotEntry });
  });
  if (new Set(documents.map((document) => document.documentId)).size !== documents.length) {
    throw new Error("ToonStudio 원고 index에 중복 문서가 있습니다.");
  }
  return Object.freeze({
    format: "toonstudio-project-workspace",
    formatVersion: 1,
    documents: Object.freeze(documents),
  });
}

function importedProject(value: unknown): StudioProjectLibraryEntry {
  const project = record(value);
  return project as unknown as StudioProjectLibraryEntry;
}

function importedDocuments(value: unknown): readonly StudioProjectDocumentEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("ToonStudio 프로젝트 패키지에 작업 문서가 없습니다.");
  }
  return Object.freeze(value.map((item) => record(item) as unknown as StudioProjectDocumentEntry));
}

async function parseStudioProjectPackage(file: File): Promise<ParsedProjectPackage> {
  const archive = await readStudioZipArchive(file, {
    limits: {
      maxArchiveBytes: 520_000_000,
      maxEntries: 2_048,
      maxEntryCompressedBytes: 256_000_000,
      maxEntryUncompressedBytes: 256_000_000,
      maxTotalUncompressedBytes: 512_000_000,
      maxCentralDirectoryBytes: 16_000_000,
      maxPathBytes: 1_024,
      maxCompressionRatio: 100,
      maxCommentBytes: 65_535,
    },
  });
  const actualNames = archive.entries.filter((entry) => !entry.directory).map((entry) => entry.path);
  const manifest = parseManifest(jsonValue(await archive.readEntry("manifest.json"), "manifest.json"));
  if (new Set(actualNames).size !== actualNames.length) {
    throw new Error("ToonStudio 프로젝트 패키지에 중복 파일이 있습니다.");
  }
  if (manifest.entryNames.length !== actualNames.length) {
    throw new Error("ToonStudio 프로젝트 패키지 manifest와 실제 파일 수가 일치하지 않습니다.");
  }
  const manifestNames = new Set(manifest.entryNames);
  for (const name of actualNames) {
    if (!manifestNames.has(name) || !PACKAGE_ENTRY_PATTERN.test(name)) {
      throw new Error(`ToonStudio 프로젝트 패키지에 허용되지 않은 파일이 있습니다: ${name}`);
    }
  }
  for (const name of REQUIRED_ENTRIES) {
    if (!manifestNames.has(name) || !archive.getEntry(name)) {
      throw new Error(`ToonStudio 프로젝트 패키지에 필수 파일이 없습니다: ${name}`);
    }
  }

  const project = importedProject(jsonValue(
    await archive.readEntry("project/project.json"),
    "project/project.json",
  ));
  const documents = importedDocuments(jsonValue(
    await archive.readEntry("project/documents.json"),
    "project/documents.json",
  ));
  const profile = record(jsonValue(
    await archive.readEntry("storage/profile.json"),
    "storage/profile.json",
  ));
  const index = parseWorkspaceIndex(jsonValue(
    await archive.readEntry(`workspace/${STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY}`),
    `workspace/${STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY}`,
  ));
  const documentIds = new Set(documents.map((document) => document.id));
  if (documentIds.size !== documents.length) {
    throw new Error("ToonStudio 프로젝트 패키지에 중복 문서 ID가 있습니다.");
  }
  if (index.documents.some((document) => !documentIds.has(document.documentId))) {
    throw new Error("ToonStudio 원고 index가 존재하지 않는 문서를 가리킵니다.");
  }

  const snapshots = new Map<string, StudioAutosavePayload>();
  for (const item of index.documents) {
    if (!item.entry) continue;
    const path = `workspace/${item.entry}`;
    if (!manifestNames.has(path) || !archive.getEntry(path)) {
      throw new Error(`ToonStudio 프로젝트 패키지에 원고 스냅샷이 없습니다: ${path}`);
    }
    const bytes = await archive.readEntry(path);
    const snapshot = parseStudioAutosave(decoder.decode(bytes));
    if (!snapshot) throw new Error(`ToonStudio 원고 스냅샷이 손상되었습니다: ${path}`);
    snapshots.set(item.documentId, snapshot);
  }
  return Object.freeze({
    project,
    documents,
    snapshots,
    autoSave: profile.autoSave !== false,
    createVersions: profile.createVersions !== false,
  });
}

function generatedImportProjectId(factory: () => string): string {
  return `import-${factory()}`.slice(0, 160);
}

function generatedImportDocumentId(factory: () => string): string {
  return `import-document-${factory()}`.slice(0, 160);
}

function restoreRaw(storage: Storage, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

export async function importStudioProjectPackage(
  file: File,
  options: StudioProjectPackageImportOptions,
): Promise<StudioProjectPackageImportResult> {
  if (!(file instanceof File) || file.size <= 0 || !file.name.toLowerCase().endsWith(".toonstudio")) {
    throw new Error("유효한 .toonstudio 프로젝트 파일을 선택해 주세요.");
  }
  const parsed = await parseStudioProjectPackage(file);
  const now = options.now ?? new Date().toISOString();
  const createProjectId = options.createProjectId
    ?? (() => createSecureRandomUuid("프로젝트 가져오기 ID를 안전하게 만들 수 없습니다."));
  const createDocumentId = options.createDocumentId
    ?? (() => createSecureRandomUuid("원고 가져오기 ID를 안전하게 만들 수 없습니다."));
  const current = readStudioProjectLibrary(options.storage);
  let projectId = generatedImportProjectId(createProjectId);
  for (let attempt = 0; current.projects.some((project) => project.id === projectId); attempt += 1) {
    if (attempt >= 10) throw new Error("가져온 프로젝트의 고유 ID를 만들지 못했습니다.");
    projectId = generatedImportProjectId(createProjectId);
  }

  const occupiedDocumentIds = new Set(current.projects.flatMap((project) => (
    readStudioProjectDocuments(options.storage, project.id).documents.map((document) => document.id)
  )));
  const documentIdBySource = new Map<string, string>();
  for (const sourceDocument of parsed.documents) {
    let documentId = generatedImportDocumentId(createDocumentId);
    for (let attempt = 0; occupiedDocumentIds.has(documentId); attempt += 1) {
      if (attempt >= 10) throw new Error("가져온 원고의 고유 ID를 만들지 못했습니다.");
      documentId = generatedImportDocumentId(createDocumentId);
    }
    occupiedDocumentIds.add(documentId);
    documentIdBySource.set(sourceDocument.id, documentId);
  }

  const libraryBefore = options.storage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY);
  const profilesBefore = options.storage.getItem(STUDIO_SAVE_PROFILE_STORAGE_KEY);
  const createdAutosaveKeys: string[] = [];
  try {
    const project = createStudioProject(options.storage, {
      id: projectId,
      title: parsed.project.title,
      kind: parsed.project.kind as StudioProjectKind,
      templateId: parsed.project.templateId,
      description: parsed.project.description,
      primaryLocale: parsed.project.primaryLocale,
      createdAt: now,
    }, { target: options.target });
    const restoredDocuments = parsed.documents.map((sourceDocument) => ({
      sourceDocumentId: sourceDocument.id,
      document: createStudioProjectDocument(
        options.storage,
        project.id,
        {
          id: documentIdBySource.get(sourceDocument.id),
          title: sourceDocument.title,
          kind: sourceDocument.kind as StudioDocumentKind,
          defaultWorkspace: sourceDocument.defaultWorkspace as StudioDocumentWorkspace,
          width: sourceDocument.width,
          height: sourceDocument.height,
          pageCount: sourceDocument.pageCount,
          createdAt: now,
        },
        { target: options.target },
      ),
    }));
    const documents = restoredDocuments.map((restored) => restored.document);
    const opened = restoredDocuments.find((restored) => (
      restored.sourceDocumentId === parsed.project.lastOpenedDocumentId
    ))?.document ?? documents[0]!;
    markStudioProjectOpened(options.storage, project.id, opened.id, {
      at: now,
      target: options.target,
    });

    for (const restored of restoredDocuments) {
      const snapshot = parsed.snapshots.get(restored.sourceDocumentId);
      if (!snapshot) continue;
      const key = studioAutosaveKey({
        userId: options.authUserId ?? null,
        workId: restored.document.id,
      });
      createdAutosaveKeys.push(key);
      writeStudioLifecycleAutosave(options.storage, key, snapshot, { preservePrimary: false });
    }

    ensureStudioSaveProfile(options.storage, project.id, {
      provider: "browser",
      autoSave: parsed.autoSave,
      createVersions: parsed.createVersions,
      now,
      target: options.target,
    });
    upsertStudioStorageBinding(options.storage, project.id, {
      id: "local-file:imported",
      provider: "local-file",
      role: "backup",
      label: file.name,
      syncState: "pending",
    }, { now, target: options.target });
    const saved = recordStudioManualSave(options.storage, project.id, {
      now,
      target: options.target,
    });
    markStudioStorageBindingSynced(
      options.storage,
      project.id,
      "local-file:imported",
      {
        remotePath: file.name,
        byteLength: file.size,
        revision: saved.revision,
      },
      { now, target: options.target },
    );
    return Object.freeze({
      project: readStudioProjectLibrary(options.storage).projects.find(
        (candidate) => candidate.id === project.id,
      ) ?? project,
      documents: Object.freeze(documents),
      restoredSnapshotCount: createdAutosaveKeys.length,
      href: studioProjectDocumentHref(opened),
    });
  } catch (cause) {
    restoreRaw(options.storage, STUDIO_PROJECT_LIBRARY_STORAGE_KEY, libraryBefore);
    restoreRaw(options.storage, STUDIO_SAVE_PROFILE_STORAGE_KEY, profilesBefore);
    options.storage.removeItem(studioProjectDocumentStorageKey(projectId));
    for (const key of createdAutosaveKeys) {
      options.storage.removeItem(key);
      options.storage.removeItem(studioLifecycleAutosaveSidecarKey(key));
    }
    throw cause;
  }
}

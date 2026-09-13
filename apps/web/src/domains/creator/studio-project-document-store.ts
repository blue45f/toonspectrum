import {
  canonicalDocuments,
  DOCUMENT_KIND_SET,
  MAX_DOCUMENTS_PER_PROJECT,
  readStudioProjectDocuments,
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
  studioProjectDocumentStorageKey,
  validIdentity,
  validTimestamp,
} from "./studio-project-document-reader";

import type {
  CreateStudioProjectDocumentInput,
  StudioDocumentKind,
  StudioDocumentWorkspace,
  StudioProjectDocumentEntry,
  StudioProjectDocumentEventTarget,
  StudioProjectDocumentState,
  StudioProjectDocumentStorage,
} from "./studio-project-document-reader";
import type { StudioProjectKind } from "./studio-project-library-store";

export {
  readStudioProjectDocuments,
  STUDIO_DOCUMENT_KINDS,
  STUDIO_DOCUMENT_WORKSPACES,
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
  studioProjectDocumentStorageKey,
} from "./studio-project-document-reader";
export type {
  CreateStudioProjectDocumentInput,
  StudioDocumentKind,
  StudioDocumentStatus,
  StudioDocumentWorkspace,
  StudioProjectDocumentEntry,
  StudioProjectDocumentEventTarget,
  StudioProjectDocumentState,
  StudioProjectDocumentStorage,
} from "./studio-project-document-reader";

const workspaceList = (
  ...workspaces: StudioDocumentWorkspace[]
): readonly StudioDocumentWorkspace[] => Object.freeze(workspaces);

const KIND_WORKSPACES: Readonly<Record<StudioDocumentKind, readonly StudioDocumentWorkspace[]>> = Object.freeze({
  webtoon: workspaceList("comic", "draw", "image", "localization", "review"),
  illustration: workspaceList("draw", "image", "review"),
  image: workspaceList("image", "draw", "review"),
  design: workspaceList("design", "image", "slides", "review"),
  slides: workspaceList("slides", "design", "review"),
  storyboard: workspaceList("storyboard", "draw", "motion", "review"),
  whiteboard: workspaceList("whiteboard", "design", "review"),
  "three-d": workspaceList("3d", "image", "review"),
  animation: workspaceList("animation", "motion", "audio", "review"),
  motion: workspaceList("motion", "audio", "review"),
  audio: workspaceList("audio", "motion", "review"),
  localization: workspaceList("localization", "review"),
});

const PROJECT_DEFAULT_DOCUMENT: Readonly<Record<StudioProjectKind, StudioDocumentKind>> = Object.freeze({
  webtoon: "webtoon",
  illustration: "illustration",
  image: "image",
  design: "design",
  slides: "slides",
  storyboard: "storyboard",
  "three-d": "three-d",
  animation: "animation",
});

function normalizedTitle(value: string): string {
  const title = value.trim().replace(/\s+/gu, " ");
  if (!title) throw new Error("Document title is required.");
  if (title.length > 120) throw new Error("Document title is too long.");
  return title;
}

function positiveDimension(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new Error("Document dimensions must be positive integers.");
  }
  return value;
}

function positivePageCount(value: number | undefined): number {
  const pageCount = value ?? 1;
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100_000) {
    throw new Error("Document page count is invalid.");
  }
  return pageCount;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function documentSlug(title: string): string {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40) || "document";
}

function generatedDocumentId(
  title: string,
  createdAt: string,
  existing: ReadonlySet<string>,
): string {
  let attempt = 0;
  while (attempt < 10_000) {
    const id = `${documentSlug(title)}-${stableHash(`${title}\u0000${createdAt}\u0000${attempt}`).slice(0, 8)}`;
    if (!existing.has(id)) return id;
    attempt += 1;
  }
  throw new Error("A unique document id could not be created.");
}

export function writeStudioProjectDocuments(
  storage: StudioProjectDocumentStorage,
  state: StudioProjectDocumentState,
  target?: StudioProjectDocumentEventTarget,
): StudioProjectDocumentState {
  if (!validIdentity(state.projectId)) throw new Error("A valid project id is required.");
  if (!validTimestamp(state.updatedAt)) throw new Error("A valid document-library timestamp is required.");
  if (state.documents.length > MAX_DOCUMENTS_PER_PROJECT) throw new Error("The document library is full.");
  if (state.documents.some((document) => document.projectId !== state.projectId)) {
    throw new Error("Every document must belong to the same project.");
  }
  const next = Object.freeze({
    schemaVersion: 1 as const,
    projectId: state.projectId,
    documents: canonicalDocuments(state.documents),
    updatedAt: state.updatedAt,
  });
  storage.setItem(studioProjectDocumentStorageKey(state.projectId), JSON.stringify(next));
  target?.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, { detail: next }));
  return next;
}

function mutateDocuments(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  updater: (state: StudioProjectDocumentState, now: string) => StudioProjectDocumentState,
  options: {
    readonly at?: string;
    readonly target?: StudioProjectDocumentEventTarget;
  } = {},
): StudioProjectDocumentState {
  const now = options.at ?? new Date().toISOString();
  if (!validTimestamp(now)) throw new Error("A valid document-library timestamp is required.");
  return writeStudioProjectDocuments(
    storage,
    updater(readStudioProjectDocuments(storage, projectId), now),
    options.target,
  );
}

export function studioDocumentWorkspaces(
  kind: StudioDocumentKind,
): readonly StudioDocumentWorkspace[] {
  return KIND_WORKSPACES[kind];
}

export function studioDefaultDocumentKindForProject(
  kind: StudioProjectKind,
): StudioDocumentKind {
  return PROJECT_DEFAULT_DOCUMENT[kind];
}

export function createStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  input: CreateStudioProjectDocumentInput,
  options: { readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  if (!validIdentity(projectId)) throw new Error("A valid project id is required.");
  if (!DOCUMENT_KIND_SET.has(input.kind)) throw new Error("A supported document kind is required.");
  const title = normalizedTitle(input.title);
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!validTimestamp(createdAt)) throw new Error("A valid document creation time is required.");
  const allowedWorkspaces = KIND_WORKSPACES[input.kind];
  const defaultWorkspace = input.defaultWorkspace ?? allowedWorkspaces[0];
  if (!defaultWorkspace || !allowedWorkspaces.includes(defaultWorkspace)) {
    throw new Error("The selected workspace is not available for this document kind.");
  }
  let created: StudioProjectDocumentEntry | null = null;
  mutateDocuments(storage, projectId, (current) => {
    if (current.documents.length >= MAX_DOCUMENTS_PER_PROJECT) throw new Error("The document library is full.");
    const ids = new Set(current.documents.map((document) => document.id));
    const id = input.id ?? generatedDocumentId(title, createdAt, ids);
    if (!validIdentity(id)) throw new Error("A valid document id is required.");
    if (ids.has(id)) throw new Error("A document with this id already exists.");
    created = Object.freeze({
      id,
      projectId,
      title,
      kind: input.kind,
      status: "active",
      statusBeforeTrash: null,
      defaultWorkspace,
      allowedWorkspaces,
      width: positiveDimension(input.width),
      height: positiveDimension(input.height),
      pageCount: positivePageCount(input.pageCount),
      createdAt,
      updatedAt: createdAt,
      lastOpenedAt: createdAt,
    });
    return Object.freeze({
      schemaVersion: 1,
      projectId,
      documents: [...current.documents, created],
      updatedAt: createdAt,
    });
  }, { at: createdAt, target: options.target });
  if (!created) throw new Error("Document creation failed.");
  return created;
}

export function ensureInitialStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  input: {
    readonly projectId: string;
    readonly projectTitle: string;
    readonly projectKind: StudioProjectKind;
    readonly createdAt?: string;
    readonly target?: StudioProjectDocumentEventTarget;
  },
): StudioProjectDocumentEntry {
  const current = readStudioProjectDocuments(storage, input.projectId);
  const existing = current.documents.find((document) => document.status === "active");
  if (existing) return existing;
  const kind = studioDefaultDocumentKindForProject(input.projectKind);
  const title = input.projectKind === "webtoon"
    ? "EP01 원고"
    : input.projectKind === "slides"
      ? "발표 자료"
      : `${input.projectTitle} 작업 문서`;
  return createStudioProjectDocument(storage, input.projectId, {
    title,
    kind,
    createdAt: input.createdAt,
    width: kind === "webtoon" ? 1_080 : kind === "slides" ? 1_920 : 2_048,
    height: kind === "webtoon" ? 8_000 : kind === "slides" ? 1_080 : 2_048,
  }, { target: input.target });
}

function updateDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  patcher: (document: StudioProjectDocumentEntry, now: string) => StudioProjectDocumentEntry,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  if (!validIdentity(documentId)) throw new Error("A valid document id is required.");
  let updated: StudioProjectDocumentEntry | null = null;
  mutateDocuments(storage, projectId, (current, now) => {
    if (!current.documents.some((document) => document.id === documentId)) {
      throw new Error("Document not found.");
    }
    const documents = current.documents.map((document) => {
      if (document.id !== documentId) return document;
      updated = Object.freeze(patcher(document, now));
      return updated;
    });
    return Object.freeze({ schemaVersion: 1, projectId, documents, updatedAt: now });
  }, options);
  if (!updated) throw new Error("Document update failed.");
  return updated;
}

export function renameStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  title: string,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  const nextTitle = normalizedTitle(title);
  return updateDocument(storage, projectId, documentId, (document, now) => ({
    ...document,
    title: nextTitle,
    updatedAt: now,
  }), options);
}

export function setStudioProjectDocumentWorkspace(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  workspace: StudioDocumentWorkspace,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  return updateDocument(storage, projectId, documentId, (document, now) => {
    if (!document.allowedWorkspaces.includes(workspace)) {
      throw new Error("The selected workspace is not available for this document.");
    }
    return { ...document, defaultWorkspace: workspace, updatedAt: now };
  }, options);
}

export function markStudioProjectDocumentOpened(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  workspace?: StudioDocumentWorkspace,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  return updateDocument(storage, projectId, documentId, (document, now) => {
    if (workspace && !document.allowedWorkspaces.includes(workspace)) {
      throw new Error("The selected workspace is not available for this document.");
    }
    return {
      ...document,
      defaultWorkspace: workspace ?? document.defaultWorkspace,
      lastOpenedAt: now,
      updatedAt: now,
    };
  }, options);
}

export function duplicateStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  options: {
    readonly title?: string;
    readonly at?: string;
    readonly target?: StudioProjectDocumentEventTarget;
  } = {},
): StudioProjectDocumentEntry {
  const source = readStudioProjectDocuments(storage, projectId).documents.find(
    (document) => document.id === documentId,
  );
  if (!source) throw new Error("Document not found.");
  return createStudioProjectDocument(storage, projectId, {
    title: options.title ?? `${source.title} 복사본`,
    kind: source.kind,
    defaultWorkspace: source.defaultWorkspace,
    width: source.width,
    height: source.height,
    pageCount: source.pageCount,
    createdAt: options.at,
  }, { target: options.target });
}

export function archiveStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  return updateDocument(storage, projectId, documentId, (document, now) => {
    if (document.status === "trashed") throw new Error("Restore the document before archiving it.");
    return { ...document, status: "archived", statusBeforeTrash: null, updatedAt: now };
  }, options);
}

export function trashStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  return updateDocument(storage, projectId, documentId, (document, now) => document.status === "trashed"
    ? document
    : {
      ...document,
      statusBeforeTrash: document.status,
      status: "trashed",
      updatedAt: now,
    }, options);
}

export function restoreStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentEntry {
  return updateDocument(storage, projectId, documentId, (document, now) => ({
    ...document,
    status: document.status === "trashed" ? document.statusBeforeTrash ?? "active" : "active",
    statusBeforeTrash: null,
    updatedAt: now,
  }), options);
}

export function permanentlyDeleteStudioProjectDocument(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  documentId: string,
  options: { readonly at?: string; readonly target?: StudioProjectDocumentEventTarget } = {},
): StudioProjectDocumentState {
  if (!validIdentity(documentId)) throw new Error("A valid document id is required.");
  return mutateDocuments(storage, projectId, (current, now) => {
    const document = current.documents.find((candidate) => candidate.id === documentId);
    if (!document) throw new Error("Document not found.");
    if (document.status !== "trashed") throw new Error("Only trashed documents can be deleted permanently.");
    return Object.freeze({
      schemaVersion: 1,
      projectId,
      documents: current.documents.filter((candidate) => candidate.id !== documentId),
      updatedAt: now,
    });
  }, options);
}

export function studioProjectDocumentHref(
  document: StudioProjectDocumentEntry,
  workspace = document.defaultWorkspace,
): string {
  if (!document.allowedWorkspaces.includes(workspace)) {
    throw new Error("The selected workspace is not available for this document.");
  }
  const query = new URLSearchParams({ workspace });
  return `/studio/p/${encodeURIComponent(document.projectId)}/d/${encodeURIComponent(document.id)}?${query.toString()}`;
}

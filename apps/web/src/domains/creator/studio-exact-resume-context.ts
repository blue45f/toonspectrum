import {
  isStudioDocumentWorkspace,
  studioDocumentHref,
  type StudioDocumentWorkspaceId,
} from "./studio-document-workspace";

export const STUDIO_EXACT_RESUME_QUERY_KEY = "resume" as const;
export const STUDIO_EXACT_RESUME_QUERY_VALUE = "latest" as const;
export const STUDIO_EXACT_RESUME_UPDATED_EVENT = "toonspectrum:studio-exact-resume-updated" as const;
export const STUDIO_EXACT_RESUME_RESTORED_EVENT = "toonspectrum:studio-exact-resume-restored" as const;

const STORAGE_PREFIX = "toonspectrum:studio:exact-resume:v1";
const MAX_SELECTED_IDS = 64;
const MAX_SCROLL_OFFSET = 100_000_000;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const TOOL_IDS = new Set(["select", "draw", "hand"]);
const DRAW_MODE_IDS = new Set(["pen", "eraser", "shape", "pixel", "lasso-fill"]);

export interface StudioExactResumeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StudioExactResumeEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface StudioExactResumeContextV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly documentId: string;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly pageId: string | null;
  readonly selectedElementIds: readonly string[];
  readonly zoom: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly tool: "select" | "draw" | "hand";
  readonly drawMode: "pen" | "eraser" | "shape" | "pixel" | "lasso-fill";
  readonly focus: string | null;
  readonly language: string | null;
  readonly sourceVersion: string | null;
  readonly updatedAt: string;
}

export interface WriteStudioExactResumeContextInput {
  readonly projectId: string;
  readonly documentId: string;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly pageId?: string | null;
  readonly selectedElementIds?: readonly string[];
  readonly zoom?: number;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
  readonly tool?: StudioExactResumeContextV1["tool"];
  readonly drawMode?: StudioExactResumeContextV1["drawMode"];
  readonly focus?: string | null;
  readonly language?: string | null;
  readonly sourceVersion?: string | null;
  readonly updatedAt?: string;
}

function safeIdentity(value: unknown, maximum = 160): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value) return false;
  if (value === "." || value === ".." || value.includes("\\")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function nullableIdentity(value: unknown, maximum = 160): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return safeIdentity(value, maximum) ? value : undefined;
}

function safeTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

function canonicalSelectedIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_SELECTED_IDS) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of value) {
    if (!safeIdentity(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
  }
  return Object.freeze(result);
}

function toolId(value: unknown): StudioExactResumeContextV1["tool"] | null {
  return typeof value === "string" && TOOL_IDS.has(value)
    ? value as StudioExactResumeContextV1["tool"]
    : null;
}

function drawModeId(value: unknown): StudioExactResumeContextV1["drawMode"] | null {
  return typeof value === "string" && DRAW_MODE_IDS.has(value)
    ? value as StudioExactResumeContextV1["drawMode"]
    : null;
}

export function studioExactResumeStorageKey(projectId: string, documentId: string): string {
  if (!safeIdentity(projectId) || !safeIdentity(documentId)) {
    throw new Error("Exact resume storage requires valid project and document identities.");
  }
  return `${STORAGE_PREFIX}:${encodeURIComponent(projectId)}:${encodeURIComponent(documentId)}`;
}

function parseContext(value: unknown): StudioExactResumeContextV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1) return null;
  if (!safeIdentity(source.projectId) || !safeIdentity(source.documentId)) return null;
  if (!isStudioDocumentWorkspace(source.workspace)) return null;
  const pageId = nullableIdentity(source.pageId);
  const selectedElementIds = canonicalSelectedIds(source.selectedElementIds);
  const zoom = boundedNumber(source.zoom, MIN_ZOOM, MAX_ZOOM);
  const scrollLeft = boundedNumber(source.scrollLeft, 0, MAX_SCROLL_OFFSET);
  const scrollTop = boundedNumber(source.scrollTop, 0, MAX_SCROLL_OFFSET);
  const tool = toolId(source.tool);
  const drawMode = drawModeId(source.drawMode);
  const focus = nullableIdentity(source.focus, 256);
  const language = nullableIdentity(source.language, 48);
  const sourceVersion = nullableIdentity(source.sourceVersion, 160);
  if (
    pageId === undefined
    || !selectedElementIds
    || zoom === null
    || scrollLeft === null
    || scrollTop === null
    || !tool
    || !drawMode
    || focus === undefined
    || language === undefined
    || sourceVersion === undefined
    || !safeTimestamp(source.updatedAt)
  ) return null;
  return Object.freeze({
    schemaVersion: 1,
    projectId: source.projectId,
    documentId: source.documentId,
    workspace: source.workspace,
    pageId,
    selectedElementIds,
    zoom,
    scrollLeft,
    scrollTop,
    tool,
    drawMode,
    focus,
    language,
    sourceVersion,
    updatedAt: source.updatedAt,
  });
}

export function readStudioExactResumeContext(
  storage: StudioExactResumeStorage,
  projectId: string,
  documentId: string,
): StudioExactResumeContextV1 | null {
  let raw: string | null;
  try {
    raw = storage.getItem(studioExactResumeStorageKey(projectId, documentId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const context = parseContext(JSON.parse(raw));
    return context?.projectId === projectId && context.documentId === documentId ? context : null;
  } catch {
    return null;
  }
}

export function writeStudioExactResumeContext(
  storage: StudioExactResumeStorage,
  input: WriteStudioExactResumeContextInput,
  target?: StudioExactResumeEventTarget,
): StudioExactResumeContextV1 {
  const context = parseContext({
    schemaVersion: 1,
    projectId: input.projectId,
    documentId: input.documentId,
    workspace: input.workspace,
    pageId: input.pageId ?? null,
    selectedElementIds: [...(input.selectedElementIds ?? [])].slice(0, MAX_SELECTED_IDS),
    zoom: input.zoom ?? 1,
    scrollLeft: input.scrollLeft ?? 0,
    scrollTop: input.scrollTop ?? 0,
    tool: input.tool ?? "select",
    drawMode: input.drawMode ?? "pen",
    focus: input.focus ?? null,
    language: input.language ?? null,
    sourceVersion: input.sourceVersion ?? null,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
  if (!context) throw new Error("Exact resume context is invalid.");
  storage.setItem(studioExactResumeStorageKey(context.projectId, context.documentId), JSON.stringify(context));
  target?.dispatchEvent(new CustomEvent(STUDIO_EXACT_RESUME_UPDATED_EVENT, { detail: context }));
  return context;
}

export function removeStudioExactResumeContext(
  storage: StudioExactResumeStorage,
  projectId: string,
  documentId: string,
): void {
  storage.removeItem(studioExactResumeStorageKey(projectId, documentId));
}

export function studioExactResumeHref(input: {
  readonly projectId: string;
  readonly documentId: string;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly context?: StudioExactResumeContextV1 | null;
}): string {
  const params = new URLSearchParams();
  params.set(STUDIO_EXACT_RESUME_QUERY_KEY, STUDIO_EXACT_RESUME_QUERY_VALUE);
  return studioDocumentHref({
    projectId: input.projectId,
    documentId: input.documentId,
    workspace: input.context?.workspace ?? input.workspace,
    focus: input.context?.focus ?? null,
    language: input.context?.language ?? null,
    version: input.context?.sourceVersion ?? null,
    search: params,
  });
}

export function studioExactResumeRequested(search: string | URLSearchParams): boolean {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  return params.getAll(STUDIO_EXACT_RESUME_QUERY_KEY).length === 1
    && params.get(STUDIO_EXACT_RESUME_QUERY_KEY) === STUDIO_EXACT_RESUME_QUERY_VALUE;
}

export function studioExactResumeSummary(
  context: StudioExactResumeContextV1,
  locale: "ko" | "en",
): string {
  const zoom = `${Math.round(context.zoom * 100)}%`;
  const selected = context.selectedElementIds.length;
  if (locale === "ko") {
    return `${context.pageId ?? "최근 페이지"} · 확대 ${zoom}${selected > 0 ? ` · 선택 ${selected}개` : ""}`;
  }
  return `${context.pageId ?? "Recent page"} · ${zoom} zoom${selected > 0 ? ` · ${selected} selected` : ""}`;
}

export const STUDIO_RESUME_CHECKPOINT_STORAGE_KEY =
  "toonstudio:studio-resume-checkpoints:v1";
export const STUDIO_RESUME_CHECKPOINT_VERSION = 1 as const;
export const STUDIO_RESUME_CHECKPOINT_MAX_ENTRIES = 12;
export const STUDIO_RESUME_CHECKPOINT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1_000;
export const STUDIO_RESUME_CHECKPOINT_MAX_SELECTION = 24;

export interface StudioResumeViewport {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly zoom: number;
}

export interface StudioResumeCheckpoint {
  readonly version: typeof STUDIO_RESUME_CHECKPOINT_VERSION;
  readonly documentKey: string;
  readonly pageId: string;
  readonly selectedIds: readonly string[];
  readonly viewport: StudioResumeViewport;
  readonly updatedAt: number;
}

interface StudioResumeCheckpointEnvelope {
  readonly version: typeof STUDIO_RESUME_CHECKPOINT_VERSION;
  readonly checkpoints: readonly StudioResumeCheckpoint[];
}

export interface StudioResumeCheckpointStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioResumeViewportCaptureInput {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly zoom: number;
}

export interface StudioResumeViewportRestoreInput {
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface StudioResumeViewportRestorePlan {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly zoom: number;
}

function browserStorage(): StudioResumeCheckpointStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeIdentifier(value: unknown, maxLength = 1_024): value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || value.trim() !== value
  ) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function validTimestamp(value: unknown, now: number): value is number {
  return finite(value)
    && value <= now + 5 * 60_000
    && value >= now - STUDIO_RESUME_CHECKPOINT_MAX_AGE_MS;
}

function normalizeViewport(value: unknown): StudioResumeViewport | null {
  if (!record(value)) return null;
  if (!finite(value.scrollX) || !finite(value.scrollY) || !finite(value.zoom)) return null;
  return Object.freeze({
    scrollX: clamp(value.scrollX, 0, 1),
    scrollY: clamp(value.scrollY, 0, 1),
    zoom: clamp(value.zoom, 0.1, 8),
  });
}

function normalizeSelectedIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const candidate of value) {
    if (!safeIdentifier(candidate, 160) || seen.has(candidate)) continue;
    selected.push(candidate);
    seen.add(candidate);
    if (selected.length >= STUDIO_RESUME_CHECKPOINT_MAX_SELECTION) break;
  }
  return Object.freeze(selected);
}

export function normalizeStudioResumeCheckpoint(
  value: unknown,
  now = Date.now(),
): StudioResumeCheckpoint | null {
  if (!record(value) || value.version !== STUDIO_RESUME_CHECKPOINT_VERSION) return null;
  if (!safeIdentifier(value.documentKey) || !safeIdentifier(value.pageId, 160)) return null;
  if (!validTimestamp(value.updatedAt, now)) return null;
  const viewport = normalizeViewport(value.viewport);
  if (!viewport) return null;
  return Object.freeze({
    version: STUDIO_RESUME_CHECKPOINT_VERSION,
    documentKey: value.documentKey,
    pageId: value.pageId,
    selectedIds: normalizeSelectedIds(value.selectedIds),
    viewport,
    updatedAt: value.updatedAt,
  });
}

export function parseStudioResumeCheckpoints(
  raw: string | null,
  now = Date.now(),
): readonly StudioResumeCheckpoint[] {
  if (!raw) return Object.freeze([]);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!record(parsed) || parsed.version !== STUDIO_RESUME_CHECKPOINT_VERSION) {
      return Object.freeze([]);
    }
    if (!Array.isArray(parsed.checkpoints)) return Object.freeze([]);
    const byDocument = new Map<string, StudioResumeCheckpoint>();
    for (const candidate of parsed.checkpoints) {
      const checkpoint = normalizeStudioResumeCheckpoint(candidate, now);
      if (!checkpoint) continue;
      const previous = byDocument.get(checkpoint.documentKey);
      if (!previous || previous.updatedAt < checkpoint.updatedAt) {
        byDocument.set(checkpoint.documentKey, checkpoint);
      }
    }
    return Object.freeze(
      [...byDocument.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, STUDIO_RESUME_CHECKPOINT_MAX_ENTRIES),
    );
  } catch {
    return Object.freeze([]);
  }
}

export function readStudioResumeCheckpoint(
  documentKey: string,
  storage: StudioResumeCheckpointStorage | null = browserStorage(),
  now = Date.now(),
): StudioResumeCheckpoint | null {
  if (!storage || !safeIdentifier(documentKey)) return null;
  try {
    return parseStudioResumeCheckpoints(
      storage.getItem(STUDIO_RESUME_CHECKPOINT_STORAGE_KEY),
      now,
    ).find((checkpoint) => checkpoint.documentKey === documentKey) ?? null;
  } catch {
    return null;
  }
}

export function writeStudioResumeCheckpoint(
  input: Omit<StudioResumeCheckpoint, "version">,
  storage: StudioResumeCheckpointStorage | null = browserStorage(),
  now = Date.now(),
): boolean {
  if (!storage) return false;
  const checkpoint = normalizeStudioResumeCheckpoint({
    ...input,
    version: STUDIO_RESUME_CHECKPOINT_VERSION,
  }, now);
  if (!checkpoint) return false;
  try {
    const current = parseStudioResumeCheckpoints(
      storage.getItem(STUDIO_RESUME_CHECKPOINT_STORAGE_KEY),
      now,
    );
    const envelope: StudioResumeCheckpointEnvelope = {
      version: STUDIO_RESUME_CHECKPOINT_VERSION,
      checkpoints: [
        checkpoint,
        ...current.filter((item) => item.documentKey !== checkpoint.documentKey),
      ].slice(0, STUDIO_RESUME_CHECKPOINT_MAX_ENTRIES),
    };
    storage.setItem(STUDIO_RESUME_CHECKPOINT_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function captureStudioResumeViewport(
  input: StudioResumeViewportCaptureInput,
): StudioResumeViewport {
  const maxLeft = Math.max(0, input.scrollWidth - input.viewportWidth);
  const maxTop = Math.max(0, input.scrollHeight - input.viewportHeight);
  return Object.freeze({
    scrollX: maxLeft > 0 && finite(input.scrollLeft)
      ? clamp(input.scrollLeft / maxLeft, 0, 1)
      : 0,
    scrollY: maxTop > 0 && finite(input.scrollTop)
      ? clamp(input.scrollTop / maxTop, 0, 1)
      : 0,
    zoom: finite(input.zoom) ? clamp(input.zoom, 0.1, 8) : 1,
  });
}


export function applyStudioResumeViewport(
  target: Pick<HTMLElement, "scrollLeft" | "scrollTop">,
  plan: Pick<StudioResumeViewportRestorePlan, "scrollLeft" | "scrollTop">,
): void {
  target.scrollLeft = plan.scrollLeft;
  target.scrollTop = plan.scrollTop;
}

export function planStudioResumeViewportRestore(
  viewport: StudioResumeViewport,
  input: StudioResumeViewportRestoreInput,
): StudioResumeViewportRestorePlan {
  const maxLeft = Math.max(0, input.scrollWidth - input.viewportWidth);
  const maxTop = Math.max(0, input.scrollHeight - input.viewportHeight);
  return Object.freeze({
    scrollLeft: Math.round(maxLeft * clamp(viewport.scrollX, 0, 1)),
    scrollTop: Math.round(maxTop * clamp(viewport.scrollY, 0, 1)),
    zoom: clamp(viewport.zoom, 0.1, 8),
  });
}

import {
  validateStudioSeriesKit,
  type StudioSeriesKit,
} from "./studio-series-kit";

export interface StudioSeriesKitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = "toonstudio:series-kit:v1:";

function normalizedProjectId(projectId: string): string {
  const value = projectId.trim();
  if (!value || value === "." || value === ".." || value.includes("\\")) {
    throw new Error("A valid project id is required for a Series Kit.");
  }
  return value;
}

export function studioSeriesKitStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(normalizedProjectId(projectId))}`;
}

/** Create a safe, useful webtoon-first Series Kit instead of an empty configuration form. */
export function createDefaultStudioSeriesKit(projectId: string): StudioSeriesKit {
  const normalized = normalizedProjectId(projectId);
  return Object.freeze({
    schemaVersion: 1,
    id: `series-kit:${normalized}`,
    projectId: normalized,
    version: 1,
    name: "기본 Series Kit",
    colors: Object.freeze([
      Object.freeze({ id: "ink", label: "기본 글자", value: "#171717" }),
      Object.freeze({ id: "paper", label: "말풍선 배경", value: "#ffffff" }),
      Object.freeze({ id: "accent", label: "작품 포인트", value: "#e85d32" }),
      Object.freeze({ id: "narration", label: "내레이션", value: "#5c4b43" }),
    ]),
    textStyles: Object.freeze([
      Object.freeze({
        id: "dialogue",
        label: "기본 대사",
        fontId: "system-sans",
        sizePx: 20,
        lineHeight: 1.45,
        weight: 500,
        colorTokenId: "ink",
        verticalWriting: false,
      }),
      Object.freeze({
        id: "narration",
        label: "내레이션",
        fontId: "system-sans",
        sizePx: 18,
        lineHeight: 1.5,
        weight: 600,
        colorTokenId: "narration",
        verticalWriting: false,
      }),
      Object.freeze({
        id: "title",
        label: "에피소드 제목",
        fontId: "system-sans",
        sizePx: 36,
        lineHeight: 1.2,
        weight: 800,
        colorTokenId: "ink",
        verticalWriting: false,
      }),
    ]),
    balloonStyles: Object.freeze([
      Object.freeze({
        id: "dialogue-balloon",
        label: "기본 말풍선",
        textStyleId: "dialogue",
        fillColorTokenId: "paper",
        strokeColorTokenId: "ink",
        strokeWidthPx: 2,
        paddingPx: 18,
        cornerRadiusPx: 28,
      }),
    ]),
    components: Object.freeze([]),
    exportDefaults: Object.freeze([
      Object.freeze({ targetId: "webtoon-platform", widthPx: 800, format: "png", colorSpace: "srgb" }),
      Object.freeze({ targetId: "social", widthPx: 1080, format: "png", colorSpace: "srgb" }),
      Object.freeze({ targetId: "print", widthPx: null, format: "pdf", colorSpace: "cmyk" }),
    ]),
  });
}

function parseSeriesKit(raw: string, projectId: string): StudioSeriesKit | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const kit = value as StudioSeriesKit;
  if (kit.schemaVersion !== 1 || kit.projectId !== projectId) return null;
  if (validateStudioSeriesKit(kit).some((issue) => issue.severity === "error")) return null;
  return Object.freeze({
    ...kit,
    colors: Object.freeze([...kit.colors]),
    textStyles: Object.freeze([...kit.textStyles]),
    balloonStyles: Object.freeze([...kit.balloonStyles]),
    components: Object.freeze([...kit.components]),
    exportDefaults: Object.freeze([...kit.exportDefaults]),
  });
}

/** Read a valid project kit. Corrupt or foreign values fail closed rather than entering documents. */
export function readStudioSeriesKit(
  storage: Pick<StudioSeriesKitStorage, "getItem">,
  projectId: string,
): StudioSeriesKit | null {
  const normalized = normalizedProjectId(projectId);
  const raw = storage.getItem(studioSeriesKitStorageKey(normalized));
  return raw ? parseSeriesKit(raw, normalized) : null;
}

/** Persist one immutable version only after all references and output defaults validate. */
export function writeStudioSeriesKit(
  storage: Pick<StudioSeriesKitStorage, "setItem">,
  kit: StudioSeriesKit,
): StudioSeriesKit {
  const issues = validateStudioSeriesKit(kit);
  if (issues.some((issue) => issue.severity === "error")) {
    throw new Error("Series Kit contains blocking issues.");
  }
  const immutable = Object.freeze({
    ...kit,
    colors: Object.freeze(kit.colors.map((item) => Object.freeze({ ...item }))),
    textStyles: Object.freeze(kit.textStyles.map((item) => Object.freeze({ ...item }))),
    balloonStyles: Object.freeze(kit.balloonStyles.map((item) => Object.freeze({ ...item }))),
    components: Object.freeze(kit.components.map((item) => Object.freeze({ ...item }))),
    exportDefaults: Object.freeze(kit.exportDefaults.map((item) => Object.freeze({ ...item }))),
  });
  storage.setItem(studioSeriesKitStorageKey(kit.projectId), JSON.stringify(immutable));
  return immutable;
}

/** Load the current kit or initialize a project-scoped default through the same authority. */
export function ensureStudioSeriesKit(
  storage: StudioSeriesKitStorage,
  projectId: string,
): StudioSeriesKit {
  const current = readStudioSeriesKit(storage, projectId);
  if (current) return current;
  return writeStudioSeriesKit(storage, createDefaultStudioSeriesKit(projectId));
}

/** Save edited values as a new version so project documents can stay pinned to earlier versions. */
export function saveNextStudioSeriesKitVersion(
  storage: StudioSeriesKitStorage,
  current: StudioSeriesKit,
  patch: Omit<Partial<StudioSeriesKit>, "schemaVersion" | "id" | "projectId" | "version">,
): StudioSeriesKit {
  return writeStudioSeriesKit(storage, {
    ...current,
    ...patch,
    schemaVersion: 1,
    id: current.id,
    projectId: current.projectId,
    version: current.version + 1,
  });
}

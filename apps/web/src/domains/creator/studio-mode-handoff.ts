import {
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "./studio-mode-creation-plan";
import type { StudioModeCopy } from "./studio-mode-profile";
import {
  createStudioProjectDocument,
  studioProjectDocumentHref,
  type StudioProjectDocumentEventTarget,
  type StudioProjectDocumentStorage,
} from "./studio-project-document-store";
import type { StudioProjectKind } from "./studio-project-library-store";

export type StudioModeHandoffId =
  | "storyboard-to-webtoon"
  | "webtoon-to-animation"
  | "webtoon-to-design"
  | "illustration-to-design"
  | "three-d-to-webtoon"
  | "three-d-to-illustration"
  | "webtoon-to-slides";

export interface StudioModeHandoffDefinition {
  readonly id: StudioModeHandoffId;
  readonly source: StudioProjectKind;
  readonly target: StudioProjectKind;
  readonly transfer: "copy" | "reference" | "render" | "derive";
  readonly label: StudioModeCopy;
  readonly title: StudioModeCopy;
}

export interface StudioModeHandoffRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly projectId: string;
  readonly sourceDocumentId: string;
  readonly targetDocumentId: string;
  readonly handoffId: StudioModeHandoffId;
  readonly transfer: StudioModeHandoffDefinition["transfer"];
  readonly createdAt: string;
}

export interface StudioModeHandoffStorage extends StudioProjectDocumentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const definition = (
  id: StudioModeHandoffId,
  source: StudioProjectKind,
  target: StudioProjectKind,
  transfer: StudioModeHandoffDefinition["transfer"],
  labelKo: string,
  labelEn: string,
  titleKo: string,
  titleEn: string,
): StudioModeHandoffDefinition => Object.freeze({
  id,
  source,
  target,
  transfer,
  label: Object.freeze({ ko: labelKo, en: labelEn }),
  title: Object.freeze({ ko: titleKo, en: titleEn }),
});

export const STUDIO_MODE_HANDOFFS: readonly StudioModeHandoffDefinition[] = Object.freeze([
  definition("storyboard-to-webtoon", "storyboard", "webtoon", "derive", "웹툰 원고로 이어 만들기", "Continue as webtoon", "콘티에서 만든 웹툰 원고", "Webtoon from storyboard"),
  definition("webtoon-to-animation", "webtoon", "animation", "derive", "모션 웹툰 만들기", "Create motion comic", "모션 웹툰", "Motion comic"),
  definition("webtoon-to-design", "webtoon", "design", "derive", "표지·홍보물 만들기", "Create cover & promotion", "작품 표지", "Series cover"),
  definition("illustration-to-design", "illustration", "design", "derive", "홍보 디자인으로 보내기", "Send to promotion design", "일러스트 홍보 디자인", "Illustration promotion"),
  definition("three-d-to-webtoon", "three-d", "webtoon", "render", "웹툰 배경 레퍼런스로 보내기", "Send to webtoon reference", "3D 레퍼런스 웹툰 원고", "Webtoon with 3D reference"),
  definition("three-d-to-illustration", "three-d", "illustration", "render", "일러스트 레퍼런스로 보내기", "Send to illustration reference", "3D 레퍼런스 일러스트", "Illustration with 3D reference"),
  definition("webtoon-to-slides", "webtoon", "slides", "derive", "작품 피치덱 만들기", "Create series pitch deck", "작품 피칭", "Series pitch"),
]);

const HANDOFF_PREFIX = "toonspectrum:studio-mode-handoffs:v1:";
const MAX_HANDOFF_RECORDS = 200;

function handoffStorageKey(projectId: string): string {
  return `${HANDOFF_PREFIX}${encodeURIComponent(projectId)}`;
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
}

function isHandoffId(value: unknown): value is StudioModeHandoffId {
  return typeof value === "string" && STUDIO_MODE_HANDOFFS.some((item) => item.id === value);
}

function sourceDocumentFromLocation(): string | null {
  if (typeof globalThis.location !== "object") return null;
  const match = /^\/studio\/p\/[^/]+\/d\/([^/?#]+)/u.exec(globalThis.location.pathname);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    return validIdentity(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function readStudioModeHandoffRecords(
  storage: Pick<StudioModeHandoffStorage, "getItem">,
  projectId: string,
): readonly StudioModeHandoffRecord[] {
  if (!validIdentity(projectId)) return Object.freeze([]);
  try {
    const raw = storage.getItem(handoffStorageKey(projectId));
    if (!raw) return Object.freeze([]);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Object.freeze([]);
    const records = parsed.slice(-MAX_HANDOFF_RECORDS).flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const item = candidate as Record<string, unknown>;
      if (
        item.schemaVersion !== 1
        || item.projectId !== projectId
        || !validIdentity(item.id)
        || !validIdentity(item.sourceDocumentId)
        || !validIdentity(item.targetDocumentId)
        || !isHandoffId(item.handoffId)
        || (item.transfer !== "copy" && item.transfer !== "reference" && item.transfer !== "render" && item.transfer !== "derive")
        || typeof item.createdAt !== "string"
        || !Number.isFinite(Date.parse(item.createdAt))
      ) return [];
      return [Object.freeze({
        schemaVersion: 1 as const,
        id: item.id,
        projectId,
        sourceDocumentId: item.sourceDocumentId,
        targetDocumentId: item.targetDocumentId,
        handoffId: item.handoffId,
        transfer: item.transfer,
        createdAt: item.createdAt,
      })];
    });
    return Object.freeze(records);
  } catch {
    return Object.freeze([]);
  }
}

function writeHandoffRecord(storage: StudioModeHandoffStorage, record: StudioModeHandoffRecord): void {
  const current = readStudioModeHandoffRecords(storage, record.projectId);
  const next = [...current, record].slice(-MAX_HANDOFF_RECORDS);
  storage.setItem(handoffStorageKey(record.projectId), JSON.stringify(next));
}

export function studioModeHandoffsFor(mode: StudioProjectKind): readonly StudioModeHandoffDefinition[] {
  return STUDIO_MODE_HANDOFFS.filter((handoff) => handoff.source === mode);
}

export function executeStudioModeHandoff(
  storage: StudioModeHandoffStorage,
  projectId: string,
  handoff: StudioModeHandoffDefinition,
  locale: string,
  options: {
    readonly target?: StudioProjectDocumentEventTarget;
    readonly at?: string;
    readonly sourceDocumentId?: string;
  } = {},
): { readonly documentId: string; readonly href: string; readonly record: StudioModeHandoffRecord } {
  const sourceDocumentId = options.sourceDocumentId ?? sourceDocumentFromLocation() ?? "unknown-source";
  if (!validIdentity(projectId) || !validIdentity(sourceDocumentId)) {
    throw new Error("A valid project and source document are required for a mode handoff.");
  }
  const plan = resolveStudioModeCreationPlan(handoff.target);
  const createdAt = options.at ?? new Date().toISOString();
  const created = createStudioProjectDocument(storage, projectId, {
    title: translateLocaleBranchForLocale(locale, "domains.creator.studio.mode.handoff", handoff.title),
    kind: plan.document.kind,
    defaultWorkspace: plan.document.workspace,
    width: plan.document.width,
    height: plan.document.height,
    pageCount: plan.document.pageCount,
    createdAt,
  }, { target: options.target });
  const record: StudioModeHandoffRecord = Object.freeze({
    schemaVersion: 1,
    id: `${handoff.id}:${sourceDocumentId}:${created.id}`.slice(0, 160),
    projectId,
    sourceDocumentId,
    targetDocumentId: created.id,
    handoffId: handoff.id,
    transfer: handoff.transfer,
    createdAt,
  });
  writeHandoffRecord(storage, record);

  const baseHref = buildStudioModeLaunchHref(
    { href: studioProjectDocumentHref(created, plan.document.workspace) },
    plan,
  );
  const [pathname = baseHref, rawSearch = ""] = baseHref.split("?", 2);
  const search = new URLSearchParams(rawSearch);
  search.set("handoff", handoff.id);
  search.set("handoffSource", sourceDocumentId);
  return Object.freeze({
    documentId: created.id,
    href: `${pathname}?${search.toString()}`,
    record,
  });
}

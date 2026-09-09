import { normalizeResearchQuery } from "./research-dashboard";

import type { CreatorResource } from "@/shared/lib/creator-resources";

const NOTEBOOK_VERSION = 1 as const;
const NOTEBOOK_SIZE_LIMIT = 65_536;
export const RESEARCH_NOTE_LIMIT = 36;
export const RESEARCH_NOTE_TEXT_LIMIT = 320;
export const RESEARCH_NOTE_SOURCE_LIMIT = 5;

export const RESEARCH_NOTEBOOK_KEY = "toonstudio:research-notebook:v1";

export const RESEARCH_NOTE_KINDS = [
  {
    id: "observation",
    eyebrow: "확인한 근거",
    label: "관찰",
    description: "자료에서 직접 확인한 형태·맥락·조건을 기록합니다.",
    empty: "아직 확인한 근거가 없습니다. 자료에서 직접 보인 사실부터 짧게 적어보세요.",
  },
  {
    id: "question",
    eyebrow: "남은 불확실성",
    label: "질문",
    description: "추가 출처나 원문 확인이 필요한 지점을 남깁니다.",
    empty: "남은 질문을 적으면 같은 표현을 다시 검색해 조사 흐름을 이어갈 수 있습니다.",
  },
  {
    id: "decision",
    eyebrow: "창작 선택",
    label: "결정",
    description: "근거를 바탕으로 실제 장면에 반영할 선택을 기록합니다.",
    empty: "자료를 모은 뒤 채택한 장면·인물·소품 선택을 기록하세요.",
  },
] as const;

export type ResearchNoteKind = typeof RESEARCH_NOTE_KINDS[number]["id"];

export interface ResearchNotebookEntry {
  id: string;
  kind: ResearchNoteKind;
  text: string;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchNotebook {
  version: typeof NOTEBOOK_VERSION;
  entries: ResearchNotebookEntry[];
}

export interface ResearchNotebookEntryInput {
  id: string;
  kind: ResearchNoteKind;
  text: string;
  sourceIds?: readonly string[];
  now?: Date;
}

export interface ResearchNotebookEntryPatch {
  kind?: ResearchNoteKind;
  text?: string;
  sourceIds?: readonly string[];
}

export interface ResearchNotebookSummary {
  total: number;
  observationCount: number;
  questionCount: number;
  decisionCount: number;
  linkedCount: number;
  unlinkedDecisionCount: number;
}

type ResearchNotebookResource = Pick<CreatorResource, "id" | "title" | "sourceUrl">;

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function cleanIdentifier(value: unknown, maximum = 160): string {
  if (typeof value !== "string" || value.length > maximum) return "";
  const result = value.normalize("NFKC").trim();
  if (!result || containsControlCharacter(result)) return "";
  return result;
}

export function normalizeResearchNoteText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, RESEARCH_NOTE_TEXT_LIMIT);
}

export function isResearchNoteTextValid(value: string): boolean {
  const text = normalizeResearchNoteText(value);
  return text.length >= 2 && text.length <= RESEARCH_NOTE_TEXT_LIMIT;
}

function isResearchNoteKind(value: unknown): value is ResearchNoteKind {
  return typeof value === "string" && RESEARCH_NOTE_KINDS.some((kind) => kind.id === value);
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeNow(now: Date | undefined): string {
  const value = now ?? new Date();
  return Number.isFinite(value.getTime()) ? value.toISOString() : new Date(0).toISOString();
}

function sanitizeSourceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const sourceIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = cleanIdentifier(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sourceIds.push(id);
    if (sourceIds.length >= RESEARCH_NOTE_SOURCE_LIMIT) break;
  }
  return sourceIds;
}

export function createResearchNotebook(): ResearchNotebook {
  return { version: NOTEBOOK_VERSION, entries: [] };
}

export function sanitizeResearchNotebook(value: unknown): ResearchNotebook {
  const input = recordOf(value);
  const rows = Array.isArray(input.entries) ? input.entries : [];
  const entries: ResearchNotebookEntry[] = [];
  const seen = new Set<string>();

  for (const raw of rows) {
    const row = recordOf(raw);
    const id = cleanIdentifier(row.id);
    const text = typeof row.text === "string" ? normalizeResearchNoteText(row.text) : "";
    const createdAt = normalizeTimestamp(row.createdAt);
    const updatedAt = normalizeTimestamp(row.updatedAt) ?? createdAt;
    if (!id || seen.has(id) || !isResearchNoteKind(row.kind) || !isResearchNoteTextValid(text) || !createdAt || !updatedAt) continue;
    seen.add(id);
    entries.push({
      id,
      kind: row.kind,
      text,
      sourceIds: sanitizeSourceIds(row.sourceIds),
      createdAt,
      updatedAt,
    });
    if (entries.length >= RESEARCH_NOTE_LIMIT) break;
  }

  return { version: NOTEBOOK_VERSION, entries };
}

export function parseResearchNotebook(raw: string | null): ResearchNotebook {
  if (!raw) return createResearchNotebook();
  if (raw.length > NOTEBOOK_SIZE_LIMIT) throw new Error("판단 노트 저장값이 허용 크기를 초과했습니다.");
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("판단 노트 저장값의 JSON 형식이 올바르지 않습니다.");
  }
  const input = recordOf(value);
  if (input.version !== NOTEBOOK_VERSION) throw new Error("지원하지 않는 판단 노트 버전입니다.");
  return sanitizeResearchNotebook(input);
}

export function serializeResearchNotebook(notebook: ResearchNotebook): string {
  return JSON.stringify(sanitizeResearchNotebook(notebook));
}

export function researchNotebookEntryId(
  now = Date.now(),
  random: () => number = Math.random,
): string {
  const timestamp = Number.isFinite(now) ? Math.max(0, Math.floor(now)) : 0;
  const entropyValue = random();
  const entropy = Number.isFinite(entropyValue)
    ? Math.floor(Math.abs(entropyValue % 1) * 2_176_782_336).toString(36).padStart(6, "0")
    : "000000";
  return `note-${timestamp.toString(36)}-${entropy}`;
}

export function addResearchNotebookEntry(
  notebook: ResearchNotebook,
  input: ResearchNotebookEntryInput,
): ResearchNotebook {
  if (notebook.entries.length >= RESEARCH_NOTE_LIMIT) return notebook;
  const id = cleanIdentifier(input.id);
  const text = normalizeResearchNoteText(input.text);
  if (!id || notebook.entries.some((entry) => entry.id === id) || !isResearchNoteKind(input.kind) || !isResearchNoteTextValid(text)) return notebook;
  const timestamp = normalizeNow(input.now);
  return sanitizeResearchNotebook({
    version: NOTEBOOK_VERSION,
    entries: [{
      id,
      kind: input.kind,
      text,
      sourceIds: input.sourceIds ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }, ...notebook.entries],
  });
}

export function updateResearchNotebookEntry(
  notebook: ResearchNotebook,
  id: string,
  patch: ResearchNotebookEntryPatch,
  now = new Date(),
): ResearchNotebook {
  const targetId = cleanIdentifier(id);
  const current = notebook.entries.find((entry) => entry.id === targetId);
  if (!current) return notebook;
  const text = patch.text === undefined ? current.text : normalizeResearchNoteText(patch.text);
  const kind = patch.kind ?? current.kind;
  if (!isResearchNoteKind(kind) || !isResearchNoteTextValid(text)) return notebook;
  const next = notebook.entries.map((entry) => entry.id === targetId ? {
    ...entry,
    kind,
    text,
    sourceIds: patch.sourceIds === undefined ? entry.sourceIds : sanitizeSourceIds(patch.sourceIds),
    updatedAt: normalizeNow(now),
  } : entry);
  return sanitizeResearchNotebook({ version: NOTEBOOK_VERSION, entries: next });
}

export function removeResearchNotebookEntry(notebook: ResearchNotebook, id: string): ResearchNotebook {
  const targetId = cleanIdentifier(id);
  if (!targetId || !notebook.entries.some((entry) => entry.id === targetId)) return notebook;
  return { ...notebook, entries: notebook.entries.filter((entry) => entry.id !== targetId) };
}

export function mergeResearchNotebooks(current: ResearchNotebook, incoming: ResearchNotebook): ResearchNotebook {
  return sanitizeResearchNotebook({
    version: NOTEBOOK_VERSION,
    entries: [...current.entries, ...incoming.entries],
  });
}

export function summarizeResearchNotebook(notebook: ResearchNotebook): ResearchNotebookSummary {
  const observationCount = notebook.entries.filter((entry) => entry.kind === "observation").length;
  const questionCount = notebook.entries.filter((entry) => entry.kind === "question").length;
  const decisionCount = notebook.entries.filter((entry) => entry.kind === "decision").length;
  const linkedCount = notebook.entries.filter((entry) => entry.sourceIds.length > 0).length;
  return {
    total: notebook.entries.length,
    observationCount,
    questionCount,
    decisionCount,
    linkedCount,
    unlinkedDecisionCount: notebook.entries.filter((entry) => entry.kind === "decision" && entry.sourceIds.length === 0).length,
  };
}

export function researchNotebookSearchQuery(value: string): string {
  return normalizeResearchQuery(value).slice(0, 80);
}

function markdownText(value: string): string {
  return value.replace(/([\\`*_[\]])/gu, "\\$1");
}

export function buildResearchNotebookMarkdown(
  notebook: ResearchNotebook,
  resources: readonly ResearchNotebookResource[],
): string {
  if (!notebook.entries.length) return "";
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
  const sections = RESEARCH_NOTE_KINDS.map((kind) => {
    const entries = notebook.entries.filter((entry) => entry.kind === kind.id);
    if (!entries.length) return "";
    const rows = entries.map((entry) => {
      const linked = entry.sourceIds
        .map((sourceId) => resourceMap.get(sourceId))
        .filter((resource): resource is ResearchNotebookResource => Boolean(resource));
      const sources = linked.length
        ? `\n  - 연결 근거: ${linked.map((resource) => `[${markdownText(resource.title)}](${resource.sourceUrl})`).join(", ")}`
        : entry.sourceIds.length
          ? "\n  - 연결 근거: 현재 저장 보드에서 찾을 수 없음"
          : "";
      return `- ${markdownText(entry.text)}${sources}`;
    });
    return `### ${kind.eyebrow}\n\n${rows.join("\n")}`;
  }).filter(Boolean);

  return [
    "## 근거에서 장면 결정으로",
    "아래 기록은 사용자가 직접 작성한 관찰·질문·결정입니다. 연결된 자료가 사실 확인이나 권리 확보를 자동 보증하지는 않습니다.",
    ...sections,
  ].join("\n\n");
}

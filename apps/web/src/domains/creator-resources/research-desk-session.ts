import {
  isResearchQueryValid,
  normalizeResearchQuery,
  RESEARCH_SEARCH_MODES,
} from "./research-dashboard";

import type { ResearchSearchMode } from "./research-dashboard";

const SESSION_VERSION = 1 as const;
const SESSION_SIZE_LIMIT = 32_768;
const HISTORY_LIMIT = 8;
const TITLE_LIMIT = 80;
const QUESTION_LIMIT = 180;
const CONTEXT_LIMIT = 240;

export const RESEARCH_DESK_SESSION_KEY = "toonstudio:research-desk:v1";

export const RESEARCH_INTENTS = [
  {
    id: "scene",
    label: "장면·공간",
    description: "시대, 장소, 빛, 분위기의 시각 근거를 찾습니다.",
    defaultMode: "assets",
    questionPlaceholder: "예: 1920년대 경성 기차역의 구조와 야간 조명은 어땠을까?",
    contextPlaceholder: "예: 1920년대 후반 · 겨울밤 · 역무원 시점",
    suggestions: ["1920년대 기차역 야간", "비 오는 시장 골목", "아르누보 호텔 로비"],
  },
  {
    id: "character",
    label: "인물·복식",
    description: "인물의 시대성, 직업, 계층을 보여줄 외형 근거를 찾습니다.",
    defaultMode: "assets",
    questionPlaceholder: "예: 조선 후기 여성 상인의 복식과 휴대품은 무엇이었을까?",
    contextPlaceholder: "예: 18세기 후반 · 상업 도시 · 활동적인 실루엣",
    suggestions: ["조선 후기 여성 상인 복식", "빅토리아 시대 철도원", "1960년대 학생 교복"],
  },
  {
    id: "prop",
    label: "소품·기술",
    description: "손에 잡히는 물건의 구조, 재료, 사용 방식을 확인합니다.",
    defaultMode: "assets",
    questionPlaceholder: "예: 1930년대 휴대용 카메라는 어떤 자세로 조작했을까?",
    contextPlaceholder: "예: 실내 저조도 · 한 손 조작 · 근접 컷",
    suggestions: ["1930년대 휴대용 카메라", "황동 천문 망원경 구조", "옛 철도 승차권 검표기"],
  },
  {
    id: "edition",
    label: "작품·판본",
    description: "원작, 번역, 판본, 출판 정보를 교차 확인합니다.",
    defaultMode: "books",
    questionPlaceholder: "예: 이 작품의 최초 판본과 주요 번역판은 어떻게 다른가?",
    contextPlaceholder: "예: 원작 연도 · 한국어/일본어 판본 · 표기 차이",
    suggestions: ["Alice in Wonderland 초판", "夏目漱石 판본", "9784088820118"],
  },
  {
    id: "opportunity",
    label: "공모·지원",
    description: "지원 대상, 제출물, 마감 원문을 확인합니다.",
    defaultMode: "opportunities",
    questionPlaceholder: "예: 신인 웹툰 작가가 지원할 수 있는 제작 지원은 무엇인가?",
    contextPlaceholder: "예: 개인 작가 · 시놉시스 보유 · 2026년 하반기",
    suggestions: ["웹툰 창작자 제작 지원", "신인 작가 공모", "콘텐츠 해외 진출 지원"],
  },
] as const;

export type ResearchIntentId = typeof RESEARCH_INTENTS[number]["id"];

export interface ResearchSearchHistoryEntry {
  mode: ResearchSearchMode;
  query: string;
  searchedAt: string;
}

export interface ResearchDeskSession {
  version: typeof SESSION_VERSION;
  title: string;
  question: string;
  context: string;
  intent: ResearchIntentId;
  lastMode: ResearchSearchMode;
  history: ResearchSearchHistoryEntry[];
}

export type ResearchDeskFocusPatch = Partial<Pick<
  ResearchDeskSession,
  "title" | "question" | "context" | "intent" | "lastMode"
>>;

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedDraftText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.slice(0, maximum);
}

function cleanQueryText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, maximum);
}

function isSearchMode(value: unknown): value is ResearchSearchMode {
  return typeof value === "string" && RESEARCH_SEARCH_MODES.some((mode) => mode.id === value);
}

function isIntent(value: unknown): value is ResearchIntentId {
  return typeof value === "string" && RESEARCH_INTENTS.some((intent) => intent.id === value);
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function createResearchDeskSession(): ResearchDeskSession {
  return {
    version: SESSION_VERSION,
    title: "",
    question: "",
    context: "",
    intent: "scene",
    lastMode: "assets",
    history: [],
  };
}

export function researchIntentById(value: ResearchIntentId) {
  return RESEARCH_INTENTS.find((intent) => intent.id === value) ?? RESEARCH_INTENTS[0];
}

export function sanitizeResearchDeskSession(value: unknown): ResearchDeskSession {
  const input = recordOf(value);
  const history: ResearchSearchHistoryEntry[] = [];
  const seen = new Set<string>();
  const rows = Array.isArray(input.history) ? input.history : [];

  for (const row of rows) {
    const entry = recordOf(row);
    if (!isSearchMode(entry.mode)) continue;
    const query = normalizeResearchQuery(cleanQueryText(entry.query, 80));
    const searchedAt = normalizeTimestamp(entry.searchedAt);
    if (!isResearchQueryValid(query) || !searchedAt) continue;
    const identity = `${entry.mode}:${query.toLocaleLowerCase("ko-KR")}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    history.push({ mode: entry.mode, query, searchedAt });
    if (history.length >= HISTORY_LIMIT) break;
  }

  return {
    version: SESSION_VERSION,
    title: boundedDraftText(input.title, TITLE_LIMIT),
    question: boundedDraftText(input.question, QUESTION_LIMIT),
    context: boundedDraftText(input.context, CONTEXT_LIMIT),
    intent: isIntent(input.intent) ? input.intent : "scene",
    lastMode: isSearchMode(input.lastMode) ? input.lastMode : "assets",
    history,
  };
}

export function parseResearchDeskSession(raw: string | null): ResearchDeskSession {
  if (!raw) return createResearchDeskSession();
  if (raw.length > SESSION_SIZE_LIMIT) throw new Error("리서치 세션 저장값이 허용 크기를 초과했습니다.");
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("리서치 세션 저장값의 JSON 형식이 올바르지 않습니다.");
  }
  const input = recordOf(value);
  if (input.version !== SESSION_VERSION) throw new Error("지원하지 않는 리서치 세션 버전입니다.");
  return sanitizeResearchDeskSession(input);
}

export function serializeResearchDeskSession(session: ResearchDeskSession): string {
  return JSON.stringify(sanitizeResearchDeskSession(session));
}

export function updateResearchDeskFocus(
  session: ResearchDeskSession,
  patch: ResearchDeskFocusPatch,
): ResearchDeskSession {
  return sanitizeResearchDeskSession({ ...session, ...patch, history: session.history });
}

export function recordResearchSearch(
  session: ResearchDeskSession,
  mode: ResearchSearchMode,
  value: string,
  now = new Date(),
): ResearchDeskSession {
  const query = normalizeResearchQuery(value);
  if (!isResearchQueryValid(query)) return session;
  const timestamp = Number.isFinite(now.getTime()) ? now.toISOString() : new Date(0).toISOString();
  const identity = `${mode}:${query.toLocaleLowerCase("ko-KR")}`;
  const history = session.history.filter((entry) => (
    `${entry.mode}:${entry.query.toLocaleLowerCase("ko-KR")}` !== identity
  ));
  history.unshift({ mode, query, searchedAt: timestamp });
  return sanitizeResearchDeskSession({ ...session, lastMode: mode, history });
}

export function clearResearchSearchHistory(session: ResearchDeskSession): ResearchDeskSession {
  return { ...session, history: [] };
}

export function isResearchDeskSessionEmpty(session: ResearchDeskSession): boolean {
  return !session.title.trim()
    && !session.question.trim()
    && !session.context.trim()
    && !session.history.length
    && session.intent === "scene"
    && session.lastMode === "assets";
}

export function researchDeskBriefContext(session: ResearchDeskSession) {
  const intent = researchIntentById(session.intent);
  return {
    title: session.title,
    question: session.question,
    context: session.context,
    intentLabel: intent.label,
    recentSearches: session.history,
  };
}

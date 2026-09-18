export type CreatorAgeBand = "unknown" | "under-14" | "14-15" | "16-17" | "18-plus";
export type CreatorCapability =
  | "browse"
  | "learning"
  | "community-posting"
  | "public-profile"
  | "direct-messaging"
  | "assistant-hiring"
  | "payments"
  | "rights-offers"
  | "mature-content";

export type AgePolicyDecision = {
  readonly allowed: boolean;
  readonly guardianRequired: boolean;
  readonly reason: string;
};

const AGE_POLICY: Record<CreatorAgeBand, Record<CreatorCapability, AgePolicyDecision>> = {
  unknown: {
    browse: { allowed: true, guardianRequired: false, reason: "연령 확인 없이 공개 자료 탐색은 가능합니다." },
    learning: { allowed: true, guardianRequired: false, reason: "학습 자료는 연령 확인 없이 이용할 수 있습니다." },
    "community-posting": { allowed: false, guardianRequired: false, reason: "게시 전 연령대 확인이 필요합니다." },
    "public-profile": { allowed: false, guardianRequired: false, reason: "프로필 공개 전 연령대 확인이 필요합니다." },
    "direct-messaging": { allowed: false, guardianRequired: false, reason: "개인 메시지는 연령대 확인 후 사용할 수 있습니다." },
    "assistant-hiring": { allowed: false, guardianRequired: false, reason: "업무 매칭은 연령대 확인 후 사용할 수 있습니다." },
    payments: { allowed: false, guardianRequired: false, reason: "금전 기능은 연령대 확인 후 사용할 수 있습니다." },
    "rights-offers": { allowed: false, guardianRequired: false, reason: "판권 제안 수신은 연령대 확인 후 사용할 수 있습니다." },
    "mature-content": { allowed: false, guardianRequired: false, reason: "성인 대상 콘텐츠는 성인 확인이 필요합니다." },
  },
  "under-14": {
    browse: { allowed: true, guardianRequired: false, reason: "공개 자료 탐색은 가능합니다." },
    learning: { allowed: true, guardianRequired: false, reason: "연령 적합 학습 자료는 이용할 수 있습니다." },
    "community-posting": { allowed: false, guardianRequired: true, reason: "공개 게시 기능은 보호자 동의·운영 정책 확인이 필요합니다." },
    "public-profile": { allowed: false, guardianRequired: true, reason: "공개 프로필은 보호자 동의와 최소 공개 원칙이 필요합니다." },
    "direct-messaging": { allowed: false, guardianRequired: true, reason: "성인과의 직접 연락을 기본 차단합니다." },
    "assistant-hiring": { allowed: false, guardianRequired: true, reason: "고용·용역 매칭은 보호자 및 별도 계약 절차가 필요합니다." },
    payments: { allowed: false, guardianRequired: true, reason: "결제·정산은 보호자와 별도 절차가 필요합니다." },
    "rights-offers": { allowed: false, guardianRequired: true, reason: "판권·계약 제안은 보호자/법정대리인 검토가 필요합니다." },
    "mature-content": { allowed: false, guardianRequired: false, reason: "성인 대상 콘텐츠는 제공하지 않습니다." },
  },
  "14-15": {
    browse: { allowed: true, guardianRequired: false, reason: "공개 자료 탐색은 가능합니다." },
    learning: { allowed: true, guardianRequired: false, reason: "연령 적합 학습 자료는 이용할 수 있습니다." },
    "community-posting": { allowed: true, guardianRequired: false, reason: "신고·차단·개인정보 보호 규칙 아래 게시할 수 있습니다." },
    "public-profile": { allowed: true, guardianRequired: true, reason: "공개 범위를 최소화하고 보호자 설정을 권장합니다." },
    "direct-messaging": { allowed: false, guardianRequired: true, reason: "낯선 성인과의 직접 연락은 보호 장치가 필요합니다." },
    "assistant-hiring": { allowed: false, guardianRequired: true, reason: "고용·용역 매칭은 보호자 및 계약 검토가 필요합니다." },
    payments: { allowed: false, guardianRequired: true, reason: "금전 거래는 보호자와 별도 절차가 필요합니다." },
    "rights-offers": { allowed: false, guardianRequired: true, reason: "판권·계약 제안은 보호자/법정대리인 검토가 필요합니다." },
    "mature-content": { allowed: false, guardianRequired: false, reason: "성인 대상 콘텐츠는 제공하지 않습니다." },
  },
  "16-17": {
    browse: { allowed: true, guardianRequired: false, reason: "공개 자료 탐색은 가능합니다." },
    learning: { allowed: true, guardianRequired: false, reason: "학습 자료를 이용할 수 있습니다." },
    "community-posting": { allowed: true, guardianRequired: false, reason: "신고·차단 정책 아래 게시할 수 있습니다." },
    "public-profile": { allowed: true, guardianRequired: false, reason: "연락처·학교 등 민감정보는 비공개가 기본입니다." },
    "direct-messaging": { allowed: true, guardianRequired: true, reason: "연락 요청 필터·차단·신고 기능과 보호자 옵션을 둡니다." },
    "assistant-hiring": { allowed: false, guardianRequired: true, reason: "업무 계약은 보호자/법정대리인 확인을 거칩니다." },
    payments: { allowed: false, guardianRequired: true, reason: "정산·결제는 보호자/법정대리인 확인을 거칩니다." },
    "rights-offers": { allowed: false, guardianRequired: true, reason: "판권·계약 제안은 보호자/법정대리인 검토가 필요합니다." },
    "mature-content": { allowed: false, guardianRequired: false, reason: "성인 대상 콘텐츠는 제공하지 않습니다." },
  },
  "18-plus": Object.fromEntries([
    "browse", "learning", "community-posting", "public-profile", "direct-messaging",
    "assistant-hiring", "payments", "rights-offers", "mature-content",
  ].map((capability) => [capability, { allowed: true, guardianRequired: false, reason: "성인 계정에서 사용할 수 있습니다." }])) as Record<CreatorCapability, AgePolicyDecision>,
};

export function creatorAgePolicy(ageBand: CreatorAgeBand, capability: CreatorCapability): AgePolicyDecision {
  return AGE_POLICY[ageBand][capability];
}

export type CreatorSupportArea = "mentoring" | "editing" | "legal" | "tax" | "translation" | "marketing" | "assistant" | "education" | "publishing";
export type CreatorSupportRequest = {
  id: string;
  area: CreatorSupportArea;
  title: string;
  detail: string;
  status: "draft" | "requested" | "matched" | "done";
  createdAt: string;
};

export type RookieCreatorProfile = {
  id: string;
  penName: string;
  stage: "student" | "rookie" | "independent" | "professional";
  genres: string[];
  portfolioUrl: string;
  goal: string;
  discoveryStatus: "private" | "review" | "discoverable";
};

export type AssistantBrief = {
  roles: string[];
  languages: string[];
  regions: string[];
  timezoneOverlapHours: number;
  maxHourlyUsd: number;
};

export type AssistantCandidate = {
  id: string;
  displayName: string;
  roles: string[];
  languages: string[];
  region: string;
  timezoneOverlapHours: number;
  hourlyUsd: number;
  portfolioUrl: string;
  verified: boolean;
};

export type AssistantMatch = AssistantCandidate & { score: number; reasons: string[] };

function overlap(left: readonly string[], right: readonly string[]): string[] {
  const wanted = new Set(left.map((item) => item.trim().toLowerCase()).filter(Boolean));
  return [...new Set(right.map((item) => item.trim().toLowerCase()).filter((item) => wanted.has(item)))];
}

export function matchAssistantCandidates(brief: AssistantBrief, candidates: readonly AssistantCandidate[]): AssistantMatch[] {
  return candidates.map((candidate) => {
    const roleMatches = overlap(brief.roles, candidate.roles);
    const languageMatches = overlap(brief.languages, candidate.languages);
    const regionMatch = brief.regions.length === 0 || brief.regions.some((region) => region.toLowerCase() === candidate.region.toLowerCase());
    const timezoneFit = candidate.timezoneOverlapHours >= brief.timezoneOverlapHours;
    const budgetFit = brief.maxHourlyUsd <= 0 || candidate.hourlyUsd <= brief.maxHourlyUsd;
    let score = 0;
    if (roleMatches.length) score += 35;
    if (languageMatches.length) score += 20;
    if (regionMatch) score += 10;
    if (timezoneFit) score += 15;
    if (budgetFit) score += 10;
    if (candidate.verified) score += 10;
    const reasons = [
      roleMatches.length ? `역할 ${roleMatches.join(", ")} 일치` : "역할 일치 없음",
      languageMatches.length ? `언어 ${languageMatches.join(", ")} 일치` : "언어 일치 없음",
      timezoneFit ? "요청한 시간대 겹침 충족" : "시간대 겹침 부족",
      budgetFit ? "예산 범위 내" : "예산 초과",
      candidate.verified ? "검증 표시 있음" : "검증 필요",
    ];
    return { ...candidate, score, reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.hourlyUsd - b.hourlyUsd);
}

export type SynopsisDraft = {
  title: string;
  logline: string;
  premise: string;
  theme: string;
  audience: string;
  world: string;
  characters: string;
  seasonArc: string;
};

export type WebNovelChapter = {
  id: string;
  title: string;
  summary: string;
  wordCount: number;
  status: "idea" | "draft" | "review" | "published";
};

export type AdaptationEpisode = {
  id: string;
  title: string;
  sourceChapterIds: string[];
  hook: string;
  beats: string[];
};

export function createWebtoonAdaptationPlan(chapters: readonly WebNovelChapter[], chaptersPerEpisode = 2): AdaptationEpisode[] {
  const size = Math.min(6, Math.max(1, Math.floor(chaptersPerEpisode || 1)));
  const usable = chapters.filter((chapter) => chapter.title.trim() || chapter.summary.trim());
  const result: AdaptationEpisode[] = [];
  for (let index = 0; index < usable.length; index += size) {
    const source = usable.slice(index, index + size);
    const summaries = source.map((chapter) => chapter.summary.trim()).filter(Boolean);
    result.push({
      id: `adapt-${index / size + 1}`,
      title: `${result.length + 1}화 · ${source[0]?.title.trim() || "새 에피소드"}`,
      sourceChapterIds: source.map((chapter) => chapter.id),
      hook: summaries[0] || source[0]?.title || "도입 훅을 작성하세요.",
      beats: summaries.length ? summaries : source.map((chapter) => chapter.title).filter(Boolean),
    });
  }
  return result;
}

export type RightsInquiry = {
  id: string;
  medium: "film" | "animation" | "drama" | "game" | "translation" | "audio" | "merchandise";
  company: string;
  contact: string;
  territory: string;
  scope: string;
  status: "received" | "reviewing" | "needs-counsel" | "declined" | "closed";
  createdAt: string;
};

export type VoiceDialogue = {
  id: string;
  episode: number;
  panel: number;
  speaker: string;
  text: string;
  locale: string;
  audioName?: string;
};

export type EducationProgram = {
  id: string;
  institution: string;
  program: string;
  region: string;
  mode: "offline" | "online" | "hybrid";
  level: "beginner" | "intermediate" | "advanced";
  duration: string;
  url: string;
  tags: string[];
};

export const WEBTOON_CURRICULUM_GUIDE = [
  { phase: "기초", subjects: ["드로잉 기초", "스토리 구조", "디지털 툴", "저작권 기초"] },
  { phase: "제작", subjects: ["콘티·연출", "캐릭터·배경", "채색·후보정", "레터링·효과"] },
  { phase: "연재", subjects: ["회차 운영", "마감·협업", "플랫폼 규격", "독자 피드백"] },
  { phase: "확장", subjects: ["포트폴리오", "계약·세무", "글로벌 번역", "영상·애니·게임 IP"] },
] as const;

export type CreatorGrowthIpState = {
  version: 1;
  ageBand: CreatorAgeBand;
  rookieProfiles: RookieCreatorProfile[];
  supportRequests: CreatorSupportRequest[];
  assistantCandidates: AssistantCandidate[];
  synopsis: SynopsisDraft;
  novelChapters: WebNovelChapter[];
  adaptationEpisodes: AdaptationEpisode[];
  rightsInquiries: RightsInquiry[];
  voiceDialogues: VoiceDialogue[];
  educationPrograms: EducationProgram[];
};

export const EMPTY_CREATOR_GROWTH_IP_STATE: CreatorGrowthIpState = {
  version: 1,
  ageBand: "unknown",
  rookieProfiles: [],
  supportRequests: [],
  assistantCandidates: [],
  synopsis: { title: "", logline: "", premise: "", theme: "", audience: "", world: "", characters: "", seasonArc: "" },
  novelChapters: [],
  adaptationEpisodes: [],
  rightsInquiries: [],
  voiceDialogues: [],
  educationPrograms: [],
};

export const CREATOR_GROWTH_IP_STORAGE_KEY = "toonstudio:creator-growth-ip:v1";

function text(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function number(value: unknown, fallback = 0, min = 0, max = 1_000_000): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function id(value: unknown): string { return text(value, 160).replace(/[^A-Za-z0-9._:-]/gu, ""); }
function list(value: unknown, max = 20): string[] {
  return Array.isArray(value) ? [...new Set(value.map((item) => text(item, 80)).filter(Boolean))].slice(0, max) : [];
}
function safeUrl(value: unknown): string {
  const raw = text(value, 1000);
  if (!raw) return "";
  try { const url = new URL(raw); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : ""; } catch { return ""; }
}

export function normalizeCreatorGrowthIpState(value: unknown): CreatorGrowthIpState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(EMPTY_CREATOR_GROWTH_IP_STATE);
  const record = value as Record<string, unknown>;
  const ageBand: CreatorAgeBand = ["unknown", "under-14", "14-15", "16-17", "18-plus"].includes(String(record.ageBand)) ? record.ageBand as CreatorAgeBand : "unknown";
  const synopsisRecord = record.synopsis && typeof record.synopsis === "object" && !Array.isArray(record.synopsis) ? record.synopsis as Record<string, unknown> : {};
  const synopsis: SynopsisDraft = {
    title: text(synopsisRecord.title, 160), logline: text(synopsisRecord.logline, 500), premise: text(synopsisRecord.premise), theme: text(synopsisRecord.theme, 500),
    audience: text(synopsisRecord.audience, 500), world: text(synopsisRecord.world), characters: text(synopsisRecord.characters), seasonArc: text(synopsisRecord.seasonArc),
  };
  const rows = <T>(key: string, map: (row: Record<string, unknown>) => T | null, limit = 200): T[] => Array.isArray(record[key])
    ? (record[key] as unknown[]).flatMap((item) => item && typeof item === "object" && !Array.isArray(item) ? [map(item as Record<string, unknown>)] : []).filter((item): item is T => item !== null).slice(0, limit)
    : [];
  const rookieProfiles = rows<RookieCreatorProfile>("rookieProfiles", (row) => {
    const rowId = id(row.id); const penName = text(row.penName, 80); if (!rowId || !penName) return null;
    const stage = ["student", "rookie", "independent", "professional"].includes(String(row.stage)) ? row.stage as RookieCreatorProfile["stage"] : "rookie";
    const discoveryStatus = ["private", "review", "discoverable"].includes(String(row.discoveryStatus)) ? row.discoveryStatus as RookieCreatorProfile["discoveryStatus"] : "private";
    return { id: rowId, penName, stage, genres: list(row.genres, 12), portfolioUrl: safeUrl(row.portfolioUrl), goal: text(row.goal, 800), discoveryStatus };
  });
  const supportRequests = rows<CreatorSupportRequest>("supportRequests", (row) => {
    const rowId = id(row.id); const title = text(row.title, 160); if (!rowId || !title) return null;
    const area = ["mentoring", "editing", "legal", "tax", "translation", "marketing", "assistant", "education", "publishing"].includes(String(row.area)) ? row.area as CreatorSupportArea : "mentoring";
    const status = ["draft", "requested", "matched", "done"].includes(String(row.status)) ? row.status as CreatorSupportRequest["status"] : "draft";
    return { id: rowId, area, title, detail: text(row.detail, 3000), status, createdAt: text(row.createdAt, 40) || new Date(0).toISOString() };
  });
  const assistantCandidates = rows<AssistantCandidate>("assistantCandidates", (row) => {
    const rowId = id(row.id); const displayName = text(row.displayName, 100); if (!rowId || !displayName) return null;
    return { id: rowId, displayName, roles: list(row.roles), languages: list(row.languages), region: text(row.region, 100), timezoneOverlapHours: number(row.timezoneOverlapHours, 0, 0, 24), hourlyUsd: number(row.hourlyUsd, 0, 0, 10000), portfolioUrl: safeUrl(row.portfolioUrl), verified: row.verified === true };
  });
  const novelChapters = rows<WebNovelChapter>("novelChapters", (row) => {
    const rowId = id(row.id); if (!rowId) return null;
    const status = ["idea", "draft", "review", "published"].includes(String(row.status)) ? row.status as WebNovelChapter["status"] : "draft";
    return { id: rowId, title: text(row.title, 160), summary: text(row.summary, 5000), wordCount: number(row.wordCount, 0, 0, 2_000_000), status };
  }, 500);
  const adaptationEpisodes = createWebtoonAdaptationPlan(novelChapters, 2);
  const rightsInquiries = rows<RightsInquiry>("rightsInquiries", (row) => {
    const rowId = id(row.id); if (!rowId) return null;
    const medium = ["film", "animation", "drama", "game", "translation", "audio", "merchandise"].includes(String(row.medium)) ? row.medium as RightsInquiry["medium"] : "film";
    const status = ["received", "reviewing", "needs-counsel", "declined", "closed"].includes(String(row.status)) ? row.status as RightsInquiry["status"] : "received";
    return { id: rowId, medium, company: text(row.company, 160), contact: text(row.contact, 240), territory: text(row.territory, 160), scope: text(row.scope, 3000), status, createdAt: text(row.createdAt, 40) || new Date(0).toISOString() };
  });
  const voiceDialogues = rows<VoiceDialogue>("voiceDialogues", (row) => {
    const rowId = id(row.id); const dialogue = text(row.text, 3000); if (!rowId || !dialogue) return null;
    return { id: rowId, episode: number(row.episode, 1, 1, 100000), panel: number(row.panel, 1, 1, 100000), speaker: text(row.speaker, 100), text: dialogue, locale: text(row.locale, 32) || "ko-KR", audioName: text(row.audioName, 240) || undefined };
  }, 1000);
  const educationPrograms = rows<EducationProgram>("educationPrograms", (row) => {
    const rowId = id(row.id); const institution = text(row.institution, 160); const program = text(row.program, 200); if (!rowId || !institution || !program) return null;
    const mode = ["offline", "online", "hybrid"].includes(String(row.mode)) ? row.mode as EducationProgram["mode"] : "offline";
    const level = ["beginner", "intermediate", "advanced"].includes(String(row.level)) ? row.level as EducationProgram["level"] : "beginner";
    return { id: rowId, institution, program, region: text(row.region, 160), mode, level, duration: text(row.duration, 120), url: safeUrl(row.url), tags: list(row.tags) };
  });
  return { version: 1, ageBand, rookieProfiles, supportRequests, assistantCandidates, synopsis, novelChapters, adaptationEpisodes, rightsInquiries, voiceDialogues, educationPrograms };
}

export function loadCreatorGrowthIpState(storage: Storage | null | undefined): CreatorGrowthIpState {
  if (!storage) return structuredClone(EMPTY_CREATOR_GROWTH_IP_STATE);
  try { const raw = storage.getItem(CREATOR_GROWTH_IP_STORAGE_KEY); return raw ? normalizeCreatorGrowthIpState(JSON.parse(raw)) : structuredClone(EMPTY_CREATOR_GROWTH_IP_STATE); }
  catch { return structuredClone(EMPTY_CREATOR_GROWTH_IP_STATE); }
}

export function saveCreatorGrowthIpState(storage: Storage | null | undefined, state: CreatorGrowthIpState): void {
  if (!storage) return;
  const normalized = normalizeCreatorGrowthIpState(state);
  const serialized = JSON.stringify(normalized);
  if (serialized.length > 2_000_000) throw new Error("창작 지원 데이터가 브라우저 저장 한도를 넘었습니다. 오래된 항목을 내보낸 뒤 정리하세요.");
  storage.setItem(CREATOR_GROWTH_IP_STORAGE_KEY, serialized);
}

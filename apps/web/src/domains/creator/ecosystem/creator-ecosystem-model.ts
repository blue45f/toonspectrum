export const CREATOR_ECOSYSTEM_STORAGE_KEY = "toonspectrum:creator-ecosystem:v1";
export const CREATOR_ECOSYSTEM_MAX_BYTES = 1_500_000;

export const SAMPLE_WORKS = Object.freeze([
  { id: "latte-courage", title: "라테 한 잔의 용기", genre: "로맨스", summary: "잘못 전달된 음료에서 시작하는 4컷 대화극", scenePackIds: ["cafe-dialogue", "close-reaction"] },
  { id: "meeting-snack", title: "회의의 진짜 결론", genre: "일상", summary: "긴 회의를 간식 한 봉지가 끝내는 짧은 코미디", scenePackIds: ["office-two-shot", "prop-handoff"] },
  { id: "last-bread", title: "사라진 마지막 빵", genre: "액션", summary: "골목 추격이 뜻밖의 배달 임무로 바뀌는 4컷", scenePackIds: ["alley-chase", "prop-handoff"] },
  { id: "empty-seat-note", title: "빈자리의 쪽지", genre: "미스터리", summary: "같은 시간, 같은 좌석에 남는 쪽지의 비밀", scenePackIds: ["subway-two-shot", "close-reaction"] },
] as const);

export const SCENE_PACKS = Object.freeze([
  { id: "cafe-dialogue", title: "카페 2인 대화", includes: ["아이레벨 투샷", "마주 앉기", "고백·갈등 표정", "낮·노을·야간 조명"] },
  { id: "office-two-shot", title: "사무실 회의 뒤 대화", includes: ["대칭 투샷", "회의 테이블", "생각·당황·갈등 연기", "문서 소품"] },
  { id: "prop-handoff", title: "물건 건네기", includes: ["손 접촉 기준점", "상자·편지·휴대폰", "받기 전·후 포즈", "시선 가이드"] },
  { id: "subway-two-shot", title: "지하철 나란히 앉기", includes: ["정면 투샷", "귓속말", "어깨 기대기", "창문 반사 가이드"] },
  { id: "alley-chase", title: "골목 추격", includes: ["달리기 방향", "와이드·반응 컷", "속도선 안전영역", "야간 조명"] },
  { id: "close-reaction", title: "표정·반응 클로즈업", includes: ["기쁨·슬픔·분노·당황", "강도 3단계", "시선 방향", "말풍선 여백"] },
] as const);

export const GUIDED_LESSONS = Object.freeze([
  { id: "first-four-cut", title: "내 첫 4컷 완성", steps: ["샘플 선택", "대사 한 줄 변경", "표정 변경", "저장", "이미지 내보내기"] },
  { id: "fix-reading-order", title: "헷갈리는 말풍선 순서 고치기", steps: ["문제 장면 열기", "읽기 순서 표시", "말풍선 이동", "휴대폰 미리보기", "재검사"] },
  { id: "continuity-pass", title: "회차 연속성 검수", steps: ["캐릭터 설정 등록", "장면 상태 입력", "충돌 확인", "전환 설명", "승인본 잠금"] },
] as const);

export interface ContinuityFact {
  id: string;
  episode: number;
  entity: string;
  field: string;
  value: string;
  transitionReason: string;
}
export interface DialogueRecord {
  id: string;
  source: string;
  sourceRevision: number;
  translations: Record<string, { text: string; sourceRevision: number; approved: boolean }>;
}
export interface BetaFeedback {
  id: string;
  packageId: string;
  pageId: string;
  clarity: number;
  readability: number;
  curiosity: number;
  comment: string;
}
export interface CreatorEcosystemState {
  version: 1;
  installedScenePackIds: string[];
  lessonSteps: Record<string, string[]>;
  continuityFacts: ContinuityFact[];
  dialogue: DialogueRecord[];
  betaFeedback: BetaFeedback[];
}
export const EMPTY_CREATOR_ECOSYSTEM_STATE: CreatorEcosystemState = Object.freeze({
  version: 1,
  installedScenePackIds: [],
  lessonSteps: {},
  continuityFacts: [],
  dialogue: [],
  betaFeedback: [],
});

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}
function finiteRating(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
}
function id(value: unknown): string {
  const normalized = text(value, 160);
  return /^[A-Za-z0-9._:-]+$/u.test(normalized) ? normalized : "";
}

export function normalizeCreatorEcosystemState(value: unknown): CreatorEcosystemState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE);
  const record = value as Record<string, unknown>;
  const installed = Array.isArray(record.installedScenePackIds)
    ? record.installedScenePackIds.map(id).filter((item) => SCENE_PACKS.some((pack) => pack.id === item)).slice(0, SCENE_PACKS.length)
    : [];
  const lessonSteps: Record<string, string[]> = {};
  if (record.lessonSteps && typeof record.lessonSteps === "object" && !Array.isArray(record.lessonSteps)) {
    for (const lesson of GUIDED_LESSONS) {
      const raw = (record.lessonSteps as Record<string, unknown>)[lesson.id];
      const allowedSteps: readonly string[] = lesson.steps;
      lessonSteps[lesson.id] = Array.isArray(raw)
        ? raw.map((item) => text(item, 120)).filter((item) => allowedSteps.includes(item)).slice(0, lesson.steps.length)
        : [];
    }
  }
  const continuityFacts = Array.isArray(record.continuityFacts) ? record.continuityFacts.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const fact = item as Record<string, unknown>;
    const episode = typeof fact.episode === "number" && Number.isInteger(fact.episode) && fact.episode > 0 && fact.episode <= 100_000 ? fact.episode : 0;
    const normalized = { id: id(fact.id), episode, entity: text(fact.entity, 120), field: text(fact.field, 120), value: text(fact.value, 500), transitionReason: text(fact.transitionReason, 1000) };
    return normalized.id && episode && normalized.entity && normalized.field && normalized.value ? [normalized] : [];
  }).slice(0, 500) : [];
  const dialogue = Array.isArray(record.dialogue) ? record.dialogue.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const translations: DialogueRecord["translations"] = {};
    if (row.translations && typeof row.translations === "object" && !Array.isArray(row.translations)) {
      for (const [locale, raw] of Object.entries(row.translations as Record<string, unknown>)) {
        if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u.test(locale) || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const entry = raw as Record<string, unknown>;
        const translated = text(entry.text, 12_000);
        const sourceRevision = typeof entry.sourceRevision === "number" && Number.isInteger(entry.sourceRevision) && entry.sourceRevision >= 0 ? entry.sourceRevision : -1;
        if (translated && sourceRevision >= 0) translations[locale] = { text: translated, sourceRevision, approved: entry.approved === true };
      }
    }
    const sourceRevision = typeof row.sourceRevision === "number" && Number.isInteger(row.sourceRevision) && row.sourceRevision >= 0 ? row.sourceRevision : 0;
    const normalized = { id: id(row.id), source: text(row.source, 12_000), sourceRevision, translations };
    return normalized.id && normalized.source ? [normalized] : [];
  }).slice(0, 1000) : [];
  const betaFeedback = Array.isArray(record.betaFeedback) ? record.betaFeedback.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const feedback = item as Record<string, unknown>;
    const normalized = { id: id(feedback.id), packageId: id(feedback.packageId), pageId: id(feedback.pageId), clarity: finiteRating(feedback.clarity), readability: finiteRating(feedback.readability), curiosity: finiteRating(feedback.curiosity), comment: text(feedback.comment, 2000) };
    return normalized.id && normalized.packageId && normalized.pageId && normalized.clarity && normalized.readability && normalized.curiosity ? [normalized] : [];
  }).slice(0, 500) : [];
  return { version: 1, installedScenePackIds: [...new Set(installed)], lessonSteps, continuityFacts, dialogue, betaFeedback };
}

export function loadCreatorEcosystemState(storage: Storage | null | undefined): CreatorEcosystemState {
  if (!storage) return structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE);
  try {
    const raw = storage.getItem(CREATOR_ECOSYSTEM_STORAGE_KEY);
    if (!raw || raw.length > CREATOR_ECOSYSTEM_MAX_BYTES) return structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE);
    return normalizeCreatorEcosystemState(JSON.parse(raw));
  } catch {
    return structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE);
  }
}
export function saveCreatorEcosystemState(storage: Storage | null | undefined, state: CreatorEcosystemState): void {
  if (!storage) return;
  const normalized = normalizeCreatorEcosystemState(state);
  const serialized = JSON.stringify(normalized);
  if (serialized.length > CREATOR_ECOSYSTEM_MAX_BYTES) throw new Error("창작 생태계 기록이 1.5MB 제한을 초과했습니다.");
  storage.setItem(CREATOR_ECOSYSTEM_STORAGE_KEY, serialized);
}

export interface ContinuityIssue {
  key: string;
  previousId: string;
  currentId: string;
  message: string;
}
export function detectContinuityIssues(facts: readonly ContinuityFact[]): ContinuityIssue[] {
  const sorted = [...facts].sort((left, right) => left.episode - right.episode || left.id.localeCompare(right.id));
  const previous = new Map<string, ContinuityFact>();
  const issues: ContinuityIssue[] = [];
  for (const fact of sorted) {
    const key = `${fact.entity.trim().toLowerCase()}\u0000${fact.field.trim().toLowerCase()}`;
    const before = previous.get(key);
    if (before && before.value.trim().toLowerCase() !== fact.value.trim().toLowerCase() && !fact.transitionReason.trim()) {
      issues.push({ key, previousId: before.id, currentId: fact.id, message: `${fact.entity}의 ${fact.field}이(가) ${before.episode}화 '${before.value}'에서 ${fact.episode}화 '${fact.value}'(으)로 바뀌었지만 전환 설명이 없습니다.` });
    }
    previous.set(key, fact);
  }
  return issues;
}

export interface PreflightDocument {
  title: string;
  tags: string[];
  pages: Array<{ id: string; minimumTextPx: number; missingAssets: string[]; rightsBlocked: string[]; readingOrderComplete: boolean; approved: boolean }>;
}
export interface PreflightFinding {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
  safeFix?: "trim-title" | "dedupe-tags";
}
export function parsePreflightDocument(value: unknown): PreflightDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("원고 점검 JSON은 객체여야 합니다.");
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.tags) || !Array.isArray(source.pages) || source.pages.length > 500) throw new Error("tags와 pages 배열을 확인하세요.");
  const pages = source.pages.map((page, index) => {
    if (!page || typeof page !== "object" || Array.isArray(page)) throw new Error(`${index + 1}번째 페이지 형식을 확인하세요.`);
    const item = page as Record<string, unknown>;
    const pageId = id(item.id);
    if (!pageId) throw new Error(`${index + 1}번째 페이지 ID를 확인하세요.`);
    const list = (input: unknown) => Array.isArray(input) ? input.map((entry) => text(entry, 160)).filter(Boolean).slice(0, 100) : [];
    return { id: pageId, minimumTextPx: typeof item.minimumTextPx === "number" && Number.isFinite(item.minimumTextPx) ? item.minimumTextPx : 0, missingAssets: list(item.missingAssets), rightsBlocked: list(item.rightsBlocked), readingOrderComplete: item.readingOrderComplete === true, approved: item.approved === true };
  });
  return { title: text(source.title, 240), tags: source.tags.map((entry) => text(entry, 80)).filter(Boolean).slice(0, 50), pages };
}
export function runPreflight(document: PreflightDocument): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  if (!document.title) findings.push({ code: "TITLE_REQUIRED", severity: "error", path: "title", message: "작품 제목이 필요합니다." });
  if (document.title !== document.title.trim()) findings.push({ code: "TITLE_WHITESPACE", severity: "warning", path: "title", message: "제목 앞뒤 공백을 정리할 수 있습니다.", safeFix: "trim-title" });
  const normalizedTags = document.tags.map((tag) => tag.toLowerCase());
  if (new Set(normalizedTags).size !== normalizedTags.length) findings.push({ code: "DUPLICATE_TAG", severity: "warning", path: "tags", message: "중복 태그를 정리할 수 있습니다.", safeFix: "dedupe-tags" });
  document.pages.forEach((page, index) => {
    if (page.minimumTextPx > 0 && page.minimumTextPx < 18) findings.push({ code: "TEXT_TOO_SMALL", severity: "warning", path: `pages[${index}].minimumTextPx`, message: `${page.id}: 휴대폰에서 대사가 작을 수 있습니다.` });
    if (page.missingAssets.length) findings.push({ code: "MISSING_ASSET", severity: "error", path: `pages[${index}].missingAssets`, message: `${page.id}: 누락 에셋 ${page.missingAssets.join(", ")}` });
    if (page.rightsBlocked.length) findings.push({ code: "RIGHTS_BLOCKED", severity: "error", path: `pages[${index}].rightsBlocked`, message: `${page.id}: 사용 권리를 확인하지 못한 에셋 ${page.rightsBlocked.join(", ")}` });
    if (!page.readingOrderComplete) findings.push({ code: "READING_ORDER", severity: "warning", path: `pages[${index}].readingOrderComplete`, message: `${page.id}: 읽기 순서가 완료되지 않았습니다.` });
    if (!page.approved) findings.push({ code: "NOT_APPROVED", severity: "warning", path: `pages[${index}].approved`, message: `${page.id}: 승인 상태가 아닙니다.` });
  });
  return findings;
}
export function applySafePreflightFixes(document: PreflightDocument): PreflightDocument {
  const seen = new Set<string>();
  return { ...document, title: document.title.trim(), tags: document.tags.filter((tag) => {
    const key = tag.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }) };
}

export function upsertDialogueSource(state: CreatorEcosystemState, idValue: string, source: string): CreatorEcosystemState {
  const existing = state.dialogue.find((row) => row.id === idValue);
  const next: DialogueRecord = existing && existing.source === source
    ? existing
    : { id: idValue, source: source.trim().slice(0, 12_000), sourceRevision: (existing?.sourceRevision ?? -1) + 1, translations: existing?.translations ?? {} };
  return { ...state, dialogue: [...state.dialogue.filter((row) => row.id !== idValue), next].slice(0, 1000) };
}
export function setDialogueTranslation(state: CreatorEcosystemState, dialogueId: string, locale: string, translated: string, approved = false): CreatorEcosystemState {
  return { ...state, dialogue: state.dialogue.map((row) => row.id === dialogueId ? { ...row, translations: { ...row.translations, [locale]: { text: translated.trim().slice(0, 12_000), sourceRevision: row.sourceRevision, approved } } } : row) };
}
export function translationStatus(row: DialogueRecord, locale: string): "missing" | "stale" | "draft" | "approved" {
  const translation = row.translations[locale];
  if (!translation) return "missing";
  if (translation.sourceRevision !== row.sourceRevision) return "stale";
  return translation.approved ? "approved" : "draft";
}

export interface BetaReviewPackage {
  kind: "toonstudio-beta-review";
  version: 1;
  packageId: string;
  title: string;
  pages: Array<{ id: string; label: string }>;
  questions: string[];
}
export function createBetaReviewPackage(title: string, pageLabels: readonly string[]): BetaReviewPackage {
  if (!title.trim() || !pageLabels.length || pageLabels.length > 100) throw new Error("작품 제목과 1~100개의 검토 페이지가 필요합니다.");
  return { kind: "toonstudio-beta-review", version: 1, packageId: crypto.randomUUID(), title: title.trim().slice(0, 120), pages: pageLabels.map((label, index) => ({ id: `page-${index + 1}`, label: label.trim().slice(0, 120) || `${index + 1}페이지` })), questions: ["장면이 이해됐나요?", "대사를 읽기 편했나요?", "다음 장면이 궁금한가요?"] };
}
export function parseBetaFeedbackPackage(value: unknown): BetaFeedback[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("베타 독자 피드백 파일을 확인하세요.");
  const record = value as Record<string, unknown>;
  if (record.kind !== "toonstudio-beta-feedback" || record.version !== 1 || !Array.isArray(record.feedback) || record.feedback.length > 100) throw new Error("지원하지 않는 피드백 파일입니다.");
  return normalizeCreatorEcosystemState({ version: 1, betaFeedback: record.feedback }).betaFeedback;
}

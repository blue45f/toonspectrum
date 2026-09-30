// 무료 글로벌 별자리 운세 API 클라이언트.
//
// - horoscope-app-api (Vercel 호스팅, API 키 불필요, 무료)
// - Aztro API는 2026-09-30 확인 기준 서비스 종료(Heroku "No such app")되어 제외
// - 실패 시 null 반환 → 호출 측에서 로컬 운세로 폴백
// - 날짜+별자리 기준 인메모리 캐시로 호출 최소화
//
// fetch 구현을 주입받으므로 브라우저/Node/테스트 모두에서 동작한다.

export type HoroscopePeriod = "daily" | "weekly" | "monthly";

export interface GlobalHoroscope {
  sign: string; // "aries" 등 영문 id
  date: string; // "2026-09-30"
  period: HoroscopePeriod;
  text: string; // 영문 운세 원문
  source: "horoscope-app-api";
}

export type HoroscopeSentiment = "positive" | "mixed" | "caution";

export interface HoroscopeGist {
  sentiment: HoroscopeSentiment;
  /** 한국어 키워드 (최대 3개) */
  keywordsKo: string[];
  /** 한 줄 한국어 요약 */
  summaryKo: string;
}

const API_BASE = "https://horoscope-app-api.vercel.app/api/v1/get-horoscope";

interface CacheEntry {
  fetchedAt: number;
  value: GlobalHoroscope | null;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

type FetchImpl = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

function defaultFetch(): FetchImpl | null {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== "function") return null;
  return f as FetchImpl;
}

/** 무료 API에서 글로벌 별자리 운세를 가져온다. 실패하면 null. */
export async function fetchGlobalHoroscope(
  signId: string,
  period: HoroscopePeriod = "daily",
  fetchImpl?: FetchImpl,
): Promise<GlobalHoroscope | null> {
  const key = `${signId}:${period}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.value;

  const impl = fetchImpl ?? defaultFetch();
  if (!impl) return null;

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
  try {
    const res = await impl(`${API_BASE}/${period}?sign=${encodeURIComponent(signId)}&day=today`, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) {
      cache.set(key, { fetchedAt: now, value: null });
      return null;
    }
    const body = (await res.json()) as { data?: { date?: string; period?: string; sign?: string; horoscope?: string } };
    const text = body?.data?.horoscope?.trim();
    if (!text) {
      cache.set(key, { fetchedAt: now, value: null });
      return null;
    }
    const value: GlobalHoroscope = {
      sign: (body.data?.sign ?? signId).toLowerCase(),
      date: body.data?.date ?? "",
      period,
      text,
      source: "horoscope-app-api",
    };
    cache.set(key, { fetchedAt: now, value });
    return value;
  } catch {
    cache.set(key, { fetchedAt: now, value: null });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 테스트용 캐시 초기화. */
export function clearHoroscopeCache(): void {
  cache.clear();
}

// ── 영문 운세 → 한국어 gist ──────────────────────────────────────────────
// API가 영문 텍스트만 제공하므로, 키워드 기반 감성 분석으로 한국어 요약을 만든다.
// 번역이 아니라 "오늘의 핵심 기운" 추출임을 summaryKo에 명시한다.

const POSITIVE_WORDS: Array<[RegExp, string]> = [
  [/\bopportunit\w*/i, "기회"],
  [/\bsuccess\w*/i, "성공"],
  [/\bluck\w*/i, "행운"],
  [/\bjoy\w*|\bhapp\w*/i, "기쁨"],
  [/\blove\b/i, "사랑"],
  [/\benergy\b|\benergetic\b/i, "활력"],
  [/\bcreativ\w*/i, "창의"],
  [/\bconfiden\w*/i, "자신감"],
  [/\bharmony\b/i, "조화"],
  [/\bgrowth\b/i, "성장"],
  [/\bcelebrat\w*/i, "축하"],
  [/\bprogress\b/i, "진전"],
];

const CAUTION_WORDS: Array<[RegExp, string]> = [
  [/\bcareful\b|\bcaution\b/i, "신중"],
  [/\bavoid\b/i, "자제"],
  [/\bstress\w*/i, "스트레스"],
  [/\bconflict\w*/i, "갈등"],
  [/\bchalleng\w*/i, "도전"],
  [/\bpatient\b|\bpatience\b/i, "인내"],
  [/\btired\b|\bexhaust\w*|\bburnout\b/i, "휴식"],
  [/\bmisunderstand\w*/i, "오해 주의"],
  [/\bdelay\w*/i, "지연"],
  [/\banxiet\w*|\bworry\b/i, "불안 다스리기"],
];

/** 영문 운세 텍스트에서 한국어 gist를 추출한다 (결정적). */
export function summarizeHoroscopeKo(text: string): HoroscopeGist {
  const positives: string[] = [];
  const cautions: string[] = [];
  for (const [re, ko] of POSITIVE_WORDS) {
    if (re.test(text) && !positives.includes(ko)) positives.push(ko);
  }
  for (const [re, ko] of CAUTION_WORDS) {
    if (re.test(text) && !cautions.includes(ko)) cautions.push(ko);
  }
  const keywordsKo = [...positives.slice(0, 2), ...cautions.slice(0, 1)].slice(0, 3);
  let sentiment: HoroscopeSentiment = "mixed";
  if (positives.length > cautions.length + 1) sentiment = "positive";
  else if (cautions.length > positives.length) sentiment = "caution";

  const summaryKo =
    sentiment === "positive"
      ? `세계의 점성가들은 오늘 당신에게 '${keywordsKo.join("·") || "긍정"}'의 기운이 강하다고 봅니다.`
      : sentiment === "caution"
        ? `세계의 점성가들은 오늘 '${keywordsKo.join("·") || "신중"}'이 필요한 날이라고 전합니다.`
        : `세계의 점성가들은 오늘 '${keywordsKo.join("·") || "균형"}'을 키워드로 꼽았습니다.`;

  return { sentiment, keywordsKo, summaryKo };
}

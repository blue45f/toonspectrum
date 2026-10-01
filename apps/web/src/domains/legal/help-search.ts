import { searchSiteDirectory, type SiteDirectoryEntry } from "./site-directory-search";

/**
 * 도움말 검색 — 문제형 문장("저장이 안 돼요")도 주제·질문·화면으로 이어지게 하는 로컬 전용 매칭.
 *
 * 1. 검색어를 낱말로 나누고 끝의 조사(이/가/은/는/을/를 …)를 떼어 낸다.
 * 2. "안", "돼요", "보여요"처럼 문제를 말할 때 붙는 표현과 한 글자 낱말은 버린다.
 * 3. 낱말이 하나라도 맞으면 결과로 보고, 맞은 낱말 수(제목은 가중)로 순서를 정한다.
 */

/** 떼어 낼 조사 — 긴 것부터 확인한다. 떼고 남은 말이 두 글자 이상일 때만 뗀다(작가, 효과 등 보호). */
const KOREAN_PARTICLES = [
  "에서는", "에서", "으로는", "으로", "에게", "까지", "부터", "처럼", "이랑", "하고",
  "이", "가", "은", "는", "을", "를", "에", "로", "도", "만", "의", "와", "과", "랑",
] as const;

/** 문제를 설명할 때 붙지만 기능을 가리키지 않는 표현. */
const STOPWORDS = new Set([
  // 한국어
  "안", "못", "왜", "좀", "뭐", "어떻게", "어디", "어디서", "어디에", "무엇", "방법", "하는", "하나요", "되나요", "돼나요",
  "돼요", "되요", "돼", "되", "안돼요", "안되요", "안돼", "안되", "안됨", "됨", "해요", "했어요", "하고", "싶어요", "싶은데",
  "보여요", "안보여요", "안보임", "없어요", "없음", "있어요", "나요", "나와요", "안나와요", "사라졌어요", "됐어요", "했는데",
  "되는데", "문제", "오류", "에러",
  // 영어
  "a", "an", "the", "is", "are", "am", "my", "i", "to", "do", "does", "did", "how", "why", "what", "where", "can", "cannot",
  "can't", "cant", "not", "no", "doesn't", "doesnt", "won't", "wont", "isn't", "isnt", "work", "works", "working",
  "failed", "fail", "fails", "problem", "issue", "error", "help", "please", "it", "in", "on", "of", "for", "with",
]);

const SPLIT_PATTERN = /[\s,.;:!?·/|()[\]{}"'“”‘’~…]+/u;

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function stripParticle(token: string): string {
  for (const particle of KOREAN_PARTICLES) {
    if (token.endsWith(particle) && token.length - particle.length >= 2) return token.slice(0, -particle.length);
  }
  return token;
}

/** 검색어를 의미 있는 낱말로 바꾼다. 중복은 한 번만 남긴다. */
export function helpSearchTokens(query: string): string[] {
  const tokens: string[] = [];
  for (const raw of normalize(query.slice(0, 160)).split(SPLIT_PATTERN)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const token = stripParticle(raw);
    if (token.length < 2 || STOPWORDS.has(token) || tokens.includes(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

export interface HelpSearchFields {
  /** 제목처럼 크게 보이는 문구(맞으면 2점). */
  readonly primary: readonly string[];
  /** 설명·키워드·본문(맞으면 1점). */
  readonly secondary: readonly string[];
}

/** 낱말별로 제목에서 맞으면 2점, 나머지 문구에서 맞으면 1점. 하나도 맞지 않으면 0. */
export function scoreHelpFields(fields: HelpSearchFields, tokens: readonly string[]): number {
  const primary = normalize(fields.primary.join(" "));
  const secondary = normalize(fields.secondary.join(" "));
  let score = 0;
  for (const token of tokens) {
    if (primary.includes(token)) score += 2;
    else if (secondary.includes(token)) score += 1;
  }
  return score;
}

/**
 * 점수가 0보다 큰 항목만 점수 높은 순(같으면 원래 순서)으로 돌려준다.
 * 의미 있는 낱말이 없으면(빈 검색어, "안 돼요"만 입력) 거르지 않고 모두 돌려준다.
 */
export function rankHelpItems<T>(
  items: readonly T[],
  fieldsOf: (item: T) => HelpSearchFields,
  tokens: readonly string[],
): T[] {
  if (tokens.length === 0) return [...items];
  return items
    .map((item, index) => ({ item, index, score: scoreHelpFields(fieldsOf(item), tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.item);
}

/**
 * 사이트맵 목적지 중 낱말이 이름·설명에 들어간 화면을 "관련 화면"으로 고른다.
 * 경로 메타데이터(영문 분류값)에만 걸린 목적지는 잡음이 많아 제외한다.
 * 이미 주제 카드로 보여 준 경로(`exclude`)는 다시 넣지 않는다.
 */
export function rankRelatedScreens(
  entries: readonly SiteDirectoryEntry[],
  tokens: readonly string[],
  exclude: ReadonlySet<string> = new Set(),
  limit = 6,
): SiteDirectoryEntry[] {
  const ranked = new Map<string, { readonly entry: SiteDirectoryEntry; score: number; readonly order: number }>();
  for (const token of tokens) {
    for (const entry of searchSiteDirectory(entries, token)) {
      if (exclude.has(entry.href)) continue;
      const gain = normalize(`${entry.label.ko} ${entry.label.en}`).includes(token)
        ? 3
        : normalize(`${entry.description.ko} ${entry.description.en}`).includes(token)
          ? 2
          : 0;
      if (gain === 0) continue;
      const current = ranked.get(entry.href);
      if (current) current.score += gain;
      else ranked.set(entry.href, { entry, score: gain, order: ranked.size });
    }
  }
  return [...ranked.values()]
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, limit)
    .map((value) => value.entry);
}

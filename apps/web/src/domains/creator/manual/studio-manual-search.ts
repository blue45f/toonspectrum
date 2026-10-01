import { MANUAL_ARTICLES, MANUAL_CATEGORIES, type ManualArticle, type ManualCategory } from "./studio-manual-data";

export const MANUAL_QUERY_LIMIT = 160;
export const MANUAL_BASE_PATH = "/studio/manual";
/** 한국어 설명문 기준 분당 읽는 글자 수(공백 포함 근사치). */
const READING_CHARACTERS_PER_MINUTE = 500;

export function manualArticleHref(id: string): string {
  return `${MANUAL_BASE_PATH}/${encodeURIComponent(id)}`;
}

export function findManualArticle(id: string | undefined): ManualArticle | undefined {
  return MANUAL_ARTICLES.find((article) => article.id === id);
}

export function findManualCategory(id: string | undefined): ManualCategory | undefined {
  return MANUAL_CATEGORIES.find((category) => category.id === id);
}

/** 목차와 이전·다음 문서가 같은 순서를 쓰도록 분류 순서대로 정렬한 문서 목록. */
export const MANUAL_ARTICLES_IN_ORDER: readonly ManualArticle[] = MANUAL_CATEGORIES.flatMap((category) =>
  MANUAL_ARTICLES.filter((article) => article.category === category.id),
);

export function manualArticlesInCategory(categoryId: string): readonly ManualArticle[] {
  return MANUAL_ARTICLES_IN_ORDER.filter((article) => article.category === categoryId);
}

export function adjacentManualArticles(id: string): { readonly previous?: ManualArticle; readonly next?: ManualArticle } {
  const index = MANUAL_ARTICLES_IN_ORDER.findIndex((article) => article.id === id);
  if (index < 0) return {};
  return { previous: MANUAL_ARTICLES_IN_ORDER[index - 1], next: MANUAL_ARTICLES_IN_ORDER[index + 1] };
}

export function normalizeManualSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ").trim();
}

function articleText(article: ManualArticle): string {
  return [
    article.title, article.summary,
    ...article.sections.flatMap((section) => [
      section.title, ...section.paragraphs, ...(section.steps ?? []), section.note ?? "",
    ]),
  ].join(" ");
}

/** 본문 분량으로 계산한 대략의 읽기 시간(분, 최소 1분). */
export function manualReadingMinutes(article: ManualArticle): number {
  return Math.max(1, Math.round(articleText(article).length / READING_CHARACTERS_PER_MINUTE));
}

const SEARCH_INDEX = MANUAL_ARTICLES.map((article) => ({
  article,
  title: normalizeManualSearch(article.title),
  keywords: normalizeManualSearch(article.keywords.join(" ")),
  text: normalizeManualSearch(`${articleText(article)} ${article.keywords.join(" ")}`),
}));

function manualSearchTokens(query: string): readonly string[] {
  return normalizeManualSearch(query.slice(0, MANUAL_QUERY_LIMIT)).split(" ").filter(Boolean);
}

/** Literal token matching only: user input is never compiled into a regular expression. */
export function searchManual(query: string, category = "all"): readonly ManualArticle[] {
  const tokens = manualSearchTokens(query);
  return SEARCH_INDEX
    .filter(({ article, text }) => (category === "all" || article.category === category)
      && tokens.every((token) => text.includes(token)))
    .map((entry) => ({
      article: entry.article,
      score: tokens.reduce((sum, token) => sum + (entry.title.includes(token) ? 10 : 0)
        + (entry.keywords.includes(token) ? 5 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score)
    .map(({ article }) => article);
}

export interface ManualTextSegment {
  readonly text: string;
  readonly match: boolean;
}

/**
 * 검색어와 일치하는 부분을 표시하기 위해 문장을 조각낸다. 정규식을 만들지 않고
 * 대소문자만 무시한 문자열 비교를 사용한다(NFKC 정규화로 길이가 바뀌는 입력은 강조하지 않는다).
 */
export function highlightManualText(text: string, query: string): readonly ManualTextSegment[] {
  const tokens = manualSearchTokens(query).filter((token) => token.length > 0);
  if (!tokens.length || !text) return [{ text, match: false }];
  const lower = text.toLocaleLowerCase("ko-KR");
  if (lower.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    let from = lower.indexOf(token);
    while (from >= 0) {
      marks.fill(true, from, from + token.length);
      from = lower.indexOf(token, from + token.length);
    }
  }
  const segments: ManualTextSegment[] = [];
  let start = 0;
  for (let index = 1; index <= text.length; index += 1) {
    if (index === text.length || marks[index] !== marks[start]) {
      segments.push({ text: text.slice(start, index), match: marks[start] === true });
      start = index;
    }
  }
  return segments;
}

/** 검색창 아래에 보여줄 추천 검색어. 모두 실제 문서에서 결과가 나오는 단어여야 한다. */
export const MANUAL_SUGGESTED_QUERIES: readonly string[] = ["브러시", "레이어", "말풍선", "3D", "내보내기", "복구", "AI", "OST"];

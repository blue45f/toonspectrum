import type { Title } from "@/shared/lib/types";

import { WEEK_DAYS } from "@/shared/lib/taxonomy";
import { kstDayOfWeek } from "@/shared/lib/utils";

/**
 * 탐색 허브(/discover)가 쓰는 빌드 시점 카탈로그 스냅샷.
 *
 * `/data/home.json`은 `pnpm catalog:gen`(prebuild)이 만드는 공개 정적 파일이라 API 연결 여부와
 * 관계없이 같은 출처에서 읽을 수 있다. 오늘 요일도 빌드 시점 값이므로 화면에서는 방문자의 KST
 * 요일과 비교해 "오늘"이라고 부를지 결정한다.
 */
export const DISCOVER_HOME_SNAPSHOT_URL = "/data/home.json";

export interface DiscoverHomeSnapshot {
  /** 편집 추천(featured) 중 조회 신호가 가장 높은 작품. 없을 수 있다. */
  readonly spotlight?: Title | null;
  /** 편집 추천 작품 목록. 예전 스냅샷에는 없을 수 있다. */
  readonly featured?: readonly Title[];
  readonly topRated: readonly Title[];
  readonly waitFree: readonly Title[];
  readonly newest: readonly Title[];
  readonly todayDay: string;
  readonly todayReleases: readonly Title[];
  readonly genres: readonly string[];
  readonly stats: {
    readonly titles: number;
    readonly platforms: number;
    readonly genres: number;
  };
  readonly generatedAt: string;
}

export type DiscoverShelfId = "weekday" | "top-rated" | "free" | "newest";

export interface DiscoverShelf {
  readonly id: DiscoverShelfId;
  readonly titles: readonly Title[];
  readonly href: string;
}

/** 한 줄에 보여 줄 최대 작품 수 — 스냅샷 목록은 12편이지만 레일은 10편이면 충분하다. */
export const DISCOVER_SHELF_LIMIT = 10;

// Date#getUTCDay()(0=일) → WEEK_DAYS 인덱스(0=월 … 6=일).
const WEEK_DAY_INDEX_FROM_UTC_DAY = [6, 0, 1, 2, 3, 4, 5] as const;

const ENGLISH_WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** 방문 시점의 KST 요일 라벨(월~일). */
export function currentKstWeekDay(): string {
  return WEEK_DAYS[WEEK_DAY_INDEX_FROM_UTC_DAY[kstDayOfWeek()]];
}

/** 한국어 요일 한 글자(월~일)를 영어 요일 이름으로 바꾼다. 알 수 없는 값은 그대로 둔다. */
export function englishWeekDay(day: string): string {
  const index = WEEK_DAYS.findIndex((entry) => entry === day);
  return index >= 0 ? ENGLISH_WEEK_DAYS[index] : day;
}

/**
 * 공개 연도로 믿을 수 있는 가장 이른 해. 수집 단계의 파싱 오류(0, 두 자리 연도 등)를 거른다.
 * 오래된 만화·웹소설도 이 해보다 늦으므로 실제 작품을 빼지 않는다.
 */
export const MIN_PLAUSIBLE_RELEASE_YEAR = 1900;

const KST_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" });

/** 방문 시점의 KST 연도. */
export function currentKstYear(now: Date = new Date()): number {
  return Number(KST_YEAR.format(now));
}

/**
 * "최근 공개" 레일에 둘 수 있는 연도인지 — 미래 연도(예: 작가명 `kore2081`에서 잘못 읽은 2081)는
 * 공개된 작품일 수 없으므로 뺀다.
 */
export function hasPlausibleReleaseYear(title: Pick<Title, "releaseYear">, maxYear: number): boolean {
  return Number.isInteger(title.releaseYear)
    && title.releaseYear >= MIN_PLAUSIBLE_RELEASE_YEAR
    && title.releaseYear <= maxYear;
}

/**
 * 스냅샷을 화면 레일 목록으로 바꾼다. 비어 있는 레일은 빼서 빈 가로 스크롤이 생기지 않게 한다.
 * `now`는 "최근 공개" 레일에서 미래 연도를 거르는 기준 시각이다(테스트용 주입).
 */
export function buildDiscoverShelves(snapshot: DiscoverHomeSnapshot, now: Date = new Date()): DiscoverShelf[] {
  const maxYear = currentKstYear(now);
  const shelves: DiscoverShelf[] = [
    { id: "weekday", titles: snapshot.todayReleases, href: "/calendar" },
    { id: "top-rated", titles: snapshot.topRated, href: "/ranking?axis=rating" },
    { id: "free", titles: snapshot.waitFree, href: "/search?pricing=free,wait-free" },
    { id: "newest", titles: snapshot.newest.filter((title) => hasPlausibleReleaseYear(title, maxYear)), href: "/explore?sort=newest" },
  ];
  return shelves
    .map((shelf) => ({ ...shelf, titles: shelf.titles.slice(0, DISCOVER_SHELF_LIMIT) }))
    .filter((shelf) => shelf.titles.length > 0);
}

/** 탐색 허브 히어로의 대표 작품과 함께 보여 줄 추천 수. */
export const DISCOVER_SPOTLIGHT_EXTRA_COUNT = 2;

export interface DiscoverSpotlightPick {
  readonly lead: Title;
  readonly more: readonly Title[];
}

/**
 * 히어로에 둘 대표 작품을 고른다 — 편집 추천(spotlight)이 없으면 평점 랭킹 1위로 대신한다.
 * 함께 보여 줄 작품은 편집 추천 → 평점 랭킹 순으로 채우고 대표 작품과 겹치지 않게 한다.
 */
export function pickDiscoverSpotlight(snapshot: DiscoverHomeSnapshot): DiscoverSpotlightPick | null {
  const lead = snapshot.spotlight ?? snapshot.featured?.[0] ?? snapshot.topRated[0] ?? null;
  if (!lead) return null;
  const seen = new Set([lead.id]);
  const more: Title[] = [];
  for (const title of [...(snapshot.featured ?? []), ...snapshot.topRated]) {
    if (more.length >= DISCOVER_SPOTLIGHT_EXTRA_COUNT) break;
    if (seen.has(title.id)) continue;
    seen.add(title.id);
    more.push(title);
  }
  return { lead, more };
}

/** `ids` 순서(최근 본 순)대로 작품을 정렬한다. 응답에 없는 id는 건너뛴다. */
export function orderTitlesByIds(ids: readonly string[], titles: readonly Title[]): Title[] {
  const byId = new Map(titles.map((title) => [title.id, title]));
  return ids.map((id) => byId.get(id)).filter((title): title is Title => title !== undefined);
}

const KST_DATE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });

/** 스냅샷 생성일을 KST "YYYY-MM-DD"로 표시한다. 형식이 깨졌으면 null. */
export function snapshotDateLabel(generatedAt: string): string | null {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return KST_DATE.format(date);
}

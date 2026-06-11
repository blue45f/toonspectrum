// 정적 카탈로그 페이로드 슬리밍 — 목록(카드) 경로와 상세 전용 데이터의 분리 규약.
//
// public/data/catalog.json 은 클라이언트 인메모리 엔진(검색·탐색·랭킹·추천)의 입력으로
// 24k+ 작품 전체를 싣는다. 목록·검색이 읽지 않는 무거운 필드는 여기서 떼어내
// public/data/detail/<bucket>.json 샤드(해시 버킷)로 옮기고, 상세/비교 화면에서만 작은
// 샤드 1개를 추가로 받아 합친다.
//
//   분리 대상(상세 전용):
//     - synopsis 원문(목록 카드는 SYNOPSIS_CARD_MAX 자로 축약 — 카드 line-clamp 노출 범위)
//     - availability[].url ("보러가기" 링크 — 상세·비교에서만 사용)
//     - stats.ratingDist (평점 분포 막대 — 상세에서만 사용)
//
// 생산자: scripts/build-static-catalog.ts / 소비자: src/catalog-static-engine.ts.
// apps/api/data/catalog.json.gz(정규화 Title[] 교환 포맷)와 DB 스냅샷 계약은 건드리지 않는다.
import type { Availability, Title, TitleCard, TitleStats } from "./types";

// 카드 시놉시스 최대 길이(코드포인트) — 카드 UI는 line-clamp 1~3줄이라 이 이상은 노출되지 않는다.
export const SYNOPSIS_CARD_MAX = 160;

// 상세 샤드 버킷 수 — 24k 작품 기준 버킷당 ~190편, 원시 ~30KB(전송 시 압축 ~7KB).
export const DETAIL_SHARD_COUNT = 128;

// 상세 전용 필드 묶음(샤드 항목). 키는 페이로드 절약을 위해 1글자.
export interface TitleDetailExtra {
  /** synopsis 원문 — 목록 축약본과 다를 때만 존재 */
  s?: string;
  /** availability[].url — 목록 availability 와 같은 순서(인덱스 정렬), 없는 자리는 null */
  u?: (string | null)[];
  /** stats.ratingDist 원본 */
  d?: TitleStats["ratingDist"];
}

export type DetailShardFile = Record<string, TitleDetailExtra>;

// 결정적 문자열 해시(djb2) — 빌드 생성기와 클라이언트 엔진이 같은 버킷을 가리켜야 한다.
export function detailShardBucket(id: string): number {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0;
  return hash % DETAIL_SHARD_COUNT;
}

// 버킷 번호 → public/data 하위 상대 경로 (예: "detail/07.json")
export function detailShardFileForBucket(bucket: number): string {
  return `detail/${bucket.toString(16).padStart(2, "0")}.json`;
}

// 작품 id → 해당 상세 샤드의 public/data 하위 상대 경로
export function detailShardFile(id: string): string {
  return detailShardFileForBucket(detailShardBucket(id));
}

// 코드포인트 기준 축약(서로게이트 쌍 안전). 잘렸을 때만 말줄임표를 붙인다.
export function truncateSynopsis(synopsis: string, max = SYNOPSIS_CARD_MAX): string {
  const points = [...synopsis];
  if (points.length <= max) return synopsis;
  return `${points.slice(0, max).join("").trimEnd()}…`;
}

function slimAvailability(availability: Availability[]): Availability[] {
  return availability.map(({ platformId, pricing, isOriginal }) =>
    isOriginal === undefined ? { platformId, pricing } : { platformId, pricing, isOriginal }
  );
}

function slimStats(stats: TitleStats): TitleCard["stats"] {
  const { ratingDist: _ratingDist, ...rest } = stats;
  return rest;
}

// 목록/검색용 카드 — catalog.json·ranking/*.json 항목. 카드 컴포넌트(title-card·rank-row·
// ranking-board)와 검색 점수기가 읽는 필드는 모두 유지하고 상세 전용 필드만 줄인다.
export function toListTitle(title: Title): TitleCard {
  return {
    ...title,
    synopsis: truncateSynopsis(title.synopsis ?? ""),
    availability: slimAvailability(title.availability),
    stats: slimStats(title.stats),
  };
}

// 연재 캘린더 카드 — 캘린더 항목은 시놉시스를 노출하지 않으므로 한층 더 가볍게.
export function toCalendarTitle(title: Title): TitleCard {
  const { synopsis: _synopsis, ...card } = toListTitle(title);
  return card;
}

// 상세 샤드 항목 생성 — 떼어낼 것이 하나도 없으면 null(샤드에 키를 만들지 않음).
export function buildDetailExtra(title: Title): TitleDetailExtra | null {
  const extra: TitleDetailExtra = {};
  const synopsis = title.synopsis ?? "";
  if (truncateSynopsis(synopsis) !== synopsis) extra.s = synopsis;
  const urls = title.availability.map((a) => a.url ?? null);
  if (urls.some((u) => u !== null)) extra.u = urls;
  const dist = title.stats?.ratingDist;
  if (Array.isArray(dist) && dist.length === 5) extra.d = dist;
  return Object.keys(extra).length > 0 ? extra : null;
}

// 슬림 카드 + 샤드 항목 → 상세용 Title 복원(스토어 원본은 변형하지 않는 새 객체).
export function mergeDetailExtra(title: Title, extra: TitleDetailExtra | undefined): Title {
  if (!extra) return title;
  return {
    ...title,
    ...(extra.s !== undefined ? { synopsis: extra.s } : {}),
    availability: extra.u
      ? title.availability.map((a, i) => {
          const url = extra.u?.[i];
          return url ? { ...a, url } : a;
        })
      : title.availability,
    stats: extra.d ? { ...title.stats, ratingDist: extra.d } : title.stats,
  };
}

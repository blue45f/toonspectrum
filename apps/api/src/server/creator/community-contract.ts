// 연재 시리즈/챌린지/팔로우 공통 타입·순수 헬퍼 — 단위 테스트 대상 순수 로직.
import { cleanTags, clampText, MAX_DESCRIPTION, normalizeMultiline } from "./shared";

export type CreatorSeriesStatus = "ongoing" | "completed";
export type CreatorSeriesSort = "recent" | "likes" | "views";
export type CreatorChallengeState = "upcoming" | "ongoing" | "ended";

const SERIES_STATUSES = new Set<CreatorSeriesStatus>(["ongoing", "completed"]);
const SERIES_SORTS = new Set<CreatorSeriesSort>(["recent", "likes", "views"]);
export const MAX_SERIES_TITLE = 80;

export function parseSeriesStatus(value: unknown): CreatorSeriesStatus {
  return SERIES_STATUSES.has(value as CreatorSeriesStatus) ? (value as CreatorSeriesStatus) : "ongoing";
}

export function parseSeriesSort(value: unknown): CreatorSeriesSort {
  return SERIES_SORTS.has(value as CreatorSeriesSort) ? (value as CreatorSeriesSort) : "recent";
}

export interface CreatorSeriesInput {
  title?: unknown;
  description?: unknown;
  cover?: unknown;
  tags?: unknown;
  status?: unknown;
}

export interface ValidatedSeriesInput {
  title: string;
  description: string;
  cover: string;
  tags: string[];
  status: CreatorSeriesStatus;
}

// 시리즈 입력 정규화 — community.validatePostInput과 같은 {value,error} 패턴.
export function validateSeriesInput(input: CreatorSeriesInput): { value?: ValidatedSeriesInput; error?: string } {
  const title = clampText(input.title, MAX_SERIES_TITLE);
  if (title.length < 1) return { error: "시리즈 제목을 입력해 주세요." };
  return {
    value: {
      title,
      description: normalizeMultiline(input.description, MAX_DESCRIPTION),
      cover: String(input.cover ?? ""),
      tags: cleanTags(input.tags),
      status: parseSeriesStatus(input.status),
    },
  };
}

// 회차 번호 자동 부여 — 시리즈 내 최대 회차 + 1 (유효하지 않은 값은 무시, 최소 1화).
export function nextEpisodeNumber(existing: Array<number | string | null | undefined>): number {
  let max = 0;
  for (const raw of existing) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > max) max = Math.floor(value);
  }
  return max + 1;
}

// 팔로우 쌍 검증 — 자기 자신 팔로우 금지(순수 로직: 단위 테스트 대상).
export function validateFollowPair(
  followerId: unknown,
  creatorId: unknown
): { followerId?: string; creatorId?: string; error?: string } {
  const follower = clampText(followerId, 160);
  const creator = clampText(creatorId, 160);
  if (!follower || !creator) return { error: "로그인이 필요해요." };
  if (follower === creator) return { error: "자기 자신은 팔로우할 수 없습니다." };
  return { followerId: follower, creatorId: creator };
}

// 챌린지 진행 상태 — startsAt/endsAt이 없으면 항상 시작됨/끝나지 않음으로 본다.
export function challengeStateOf(
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  now: Date = new Date()
): CreatorChallengeState {
  const start = startsAt == null ? null : new Date(startsAt);
  const end = endsAt == null ? null : new Date(endsAt);
  if (start && start.getTime() > now.getTime()) return "upcoming";
  if (end && end.getTime() < now.getTime()) return "ended";
  return "ongoing";
}

// 기본(시드) 챌린지 — 코드 정의 주간 주제. ensureDefaultChallenges가 idempotent하게 보장한다.
export interface SeedChallengeDef {
  slug: string;
  title: string;
  theme: string;
  durationDays: number;
}

export const SEED_CHALLENGES: SeedChallengeDef[] = [
  {
    slug: "rainy-day",
    title: "비 오는 날",
    theme: "창밖의 빗소리, 우산 속 두 사람, 젖은 골목… ‘비 오는 날’을 주제로 한 컷툰·일러스트를 올려 보세요.",
    durationDays: 7,
  },
  {
    slug: "first-meeting-4cut",
    title: "첫 만남 4컷",
    theme: "두 캐릭터의 첫 만남을 딱 4컷으로! 기승전결이 살아있는 4컷 만화에 도전해 보세요.",
    durationDays: 14,
  },
  {
    slug: "remake-my-fav",
    title: "나의 최애 리메이크",
    theme: "내가 사랑하는 작품의 명장면을 나만의 그림체로 리메이크해 공유하는 챌린지입니다.",
    durationDays: 21,
  },
  {
    slug: "midnight-snack",
    title: "한밤의 야식툰",
    theme: "새벽 1시, 참을 수 없는 야식의 유혹… 먹는 장면이 한 컷 이상 들어간 일상툰을 그려 보세요.",
    durationDays: 28,
  },
];

// 시드 챌린지의 노출 기간 — 기준 시각의 자정(UTC)부터 durationDays 동안. 순수 함수(테스트 대상).
export function seedChallengeWindow(def: SeedChallengeDef, now: Date = new Date()): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + Math.max(1, def.durationDays) * 86_400_000);
  return { startsAt, endsAt };
}

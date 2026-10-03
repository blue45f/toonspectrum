import { apiFetch } from "@/platform/api";

import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";

/**
 * 가상 스튜디오 예약·대기열·갤러리 좋아요의 서버 동기화 계층.
 *
 * 서버가 정본이고 패널의 로컬 상태는 화면 반영용이다. 패널은 지금까지처럼
 * "다음 전체 배열"을 콜백으로 넘기고, 이 계층이 이전 배열과의 차이만 서버에
 * 반영한다. 서버 변경 응답은 전부 스냅샷이라 성공하면 그 값으로 교체하고,
 * 실패하면 스냅샷을 다시 읽어 맞춘다(자기 치유). 서버에 닿지 않거나 게스트면
 * 동기화 자체를 하지 않아 기존 세션 동작이 그대로 유지된다.
 */

export interface StudioVirtualSpaceSocialTransport {
  loadBookings(scopeKey: string): Promise<unknown>;
  createBooking(scopeKey: string, booking: StudioSpaceBooking): Promise<unknown>;
  cancelBooking(scopeKey: string, bookingId: string): Promise<unknown>;
  joinWaitlist(scopeKey: string, entry: StudioSpaceWaitlistEntry): Promise<unknown>;
  leaveWaitlist(scopeKey: string, entryId: string): Promise<unknown>;
  loadGalleryLikes(scopeKey: string): Promise<unknown>;
  toggleGalleryLike(scopeKey: string, frameId: string): Promise<unknown>;
}

function bookingsPath(scopeKey: string): string {
  return `/studio/space/bookings/${encodeURIComponent(scopeKey)}`;
}

function waitlistPath(scopeKey: string): string {
  return `/studio/space/waitlist/${encodeURIComponent(scopeKey)}`;
}

function galleryLikesPath(scopeKey: string): string {
  return `/studio/space/gallery-likes/${encodeURIComponent(scopeKey)}`;
}

async function requestJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`studio space social request failed: ${response.status}`);
  return response.json();
}

export function createDefaultStudioVirtualSpaceSocialTransport(): StudioVirtualSpaceSocialTransport {
  return {
    async loadBookings(scopeKey) {
      return requestJson(await apiFetch(bookingsPath(scopeKey), { method: "GET" }));
    },
    async createBooking(scopeKey, booking) {
      return requestJson(
        await apiFetch(bookingsPath(scopeKey), {
          method: "POST",
          body: JSON.stringify(booking),
        }),
      );
    },
    async cancelBooking(scopeKey, bookingId) {
      return requestJson(
        await apiFetch(`${bookingsPath(scopeKey)}/${encodeURIComponent(bookingId)}/cancel`, {
          method: "POST",
        }),
      );
    },
    async joinWaitlist(scopeKey, entry) {
      return requestJson(
        await apiFetch(waitlistPath(scopeKey), {
          method: "POST",
          body: JSON.stringify(entry),
        }),
      );
    },
    async leaveWaitlist(scopeKey, entryId) {
      return requestJson(
        await apiFetch(`${waitlistPath(scopeKey)}/${encodeURIComponent(entryId)}`, {
          method: "DELETE",
        }),
      );
    },
    async loadGalleryLikes(scopeKey) {
      return requestJson(await apiFetch(galleryLikesPath(scopeKey), { method: "GET" }));
    },
    async toggleGalleryLike(scopeKey, frameId) {
      return requestJson(
        await apiFetch(`${galleryLikesPath(scopeKey)}/toggle`, {
          method: "POST",
          body: JSON.stringify({ frameId }),
        }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// 서버 응답 검증 — 서버 응답도 신뢰하지 않고 클라이언트 계약으로 다시 거른다.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readEpoch(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTextList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    result.push(item);
  }
  return result;
}

function acceptBooking(value: unknown): StudioSpaceBooking | null {
  if (!isRecord(value)) return null;
  const id = readText(value.id);
  const spaceId = readText(value.spaceId);
  const spaceName = readText(value.spaceName);
  const capacity = readEpoch(value.capacity);
  const equipmentTags = readTextList(value.equipmentTags);
  const startsAt = readEpoch(value.startsAt);
  const endsAt = readEpoch(value.endsAt);
  const bookerNames = readTextList(value.bookerNames);
  if (
    id === null ||
    spaceId === null ||
    spaceName === null ||
    capacity === null ||
    equipmentTags === null ||
    startsAt === null ||
    endsAt === null ||
    bookerNames === null ||
    (value.status !== "confirmed" && value.status !== "cancelled")
  ) {
    return null;
  }
  return {
    id,
    spaceId,
    spaceName,
    capacity,
    equipmentTags,
    startsAt,
    endsAt,
    bookerNames,
    note: typeof value.note === "string" ? value.note : "",
    status: value.status,
  };
}

function acceptWaitlistEntry(value: unknown): StudioSpaceWaitlistEntry | null {
  if (!isRecord(value)) return null;
  const base = acceptBooking({ ...value, status: "confirmed" });
  const requestedAt = readEpoch(value.requestedAt);
  if (base === null || requestedAt === null) return null;
  return {
    id: base.id,
    spaceId: base.spaceId,
    spaceName: base.spaceName,
    capacity: base.capacity,
    equipmentTags: base.equipmentTags,
    startsAt: base.startsAt,
    endsAt: base.endsAt,
    bookerNames: base.bookerNames,
    note: base.note,
    requestedAt,
  };
}

export interface StudioVirtualSpaceBookingsSnapshot {
  readonly bookings: readonly StudioSpaceBooking[];
  readonly waitlist: readonly StudioSpaceWaitlistEntry[];
}

export function acceptBookingsSnapshot(
  value: unknown,
  scopeKey: string,
): StudioVirtualSpaceBookingsSnapshot | null {
  if (!isRecord(value) || value.scopeKey !== scopeKey) return null;
  if (!Array.isArray(value.bookings) || !Array.isArray(value.waitlist)) return null;
  const bookings: StudioSpaceBooking[] = [];
  for (const item of value.bookings) {
    const booking = acceptBooking(item);
    if (booking === null) return null;
    bookings.push(booking);
  }
  const waitlist: StudioSpaceWaitlistEntry[] = [];
  for (const item of value.waitlist) {
    const entry = acceptWaitlistEntry(item);
    if (entry === null) return null;
    waitlist.push(entry);
  }
  return { bookings, waitlist };
}

export function acceptGalleryLikes(value: unknown, scopeKey: string): StudioGalleryStats | null {
  if (!isRecord(value) || value.scopeKey !== scopeKey || !isRecord(value.frames)) return null;
  const stats: Record<string, { views: number; likes: number; likedBy: readonly string[] }> = {};
  for (const [frameId, frame] of Object.entries(value.frames)) {
    if (!isRecord(frame)) return null;
    const likes = readEpoch(frame.likes);
    const likedBy = readTextList(frame.likedBy);
    if (likes === null || likedBy === null) return null;
    stats[frameId] = { views: 0, likes, likedBy };
  }
  return stats;
}

export function acceptGalleryLikeToggle(
  value: unknown,
): { readonly frameId: string; readonly likes: number; readonly likedBy: readonly string[] } | null {
  if (!isRecord(value)) return null;
  const frameId = readText(value.frameId);
  const likes = readEpoch(value.likes);
  const likedBy = readTextList(value.likedBy);
  if (frameId === null || likes === null || likedBy === null) return null;
  return { frameId, likes, likedBy };
}

// ---------------------------------------------------------------------------
// diff — 패널이 넘긴 다음 배열과 이전 배열의 차이만 서버 연산으로 바꾼다.
// ---------------------------------------------------------------------------

export interface StudioBookingsDiff {
  readonly created: readonly StudioSpaceBooking[];
  readonly cancelledIds: readonly string[];
}

export function diffBookings(
  prev: readonly StudioSpaceBooking[],
  next: readonly StudioSpaceBooking[],
): StudioBookingsDiff {
  const prevById = new Map(prev.map((booking) => [booking.id, booking]));
  const created: StudioSpaceBooking[] = [];
  const cancelledIds: string[] = [];
  for (const booking of next) {
    const before = prevById.get(booking.id);
    if (!before) {
      if (booking.status === "confirmed") created.push(booking);
    } else if (before.status === "confirmed" && booking.status === "cancelled") {
      cancelledIds.push(booking.id);
    }
  }
  return { created, cancelledIds };
}

export interface StudioWaitlistDiff {
  readonly joined: readonly StudioSpaceWaitlistEntry[];
  readonly leftIds: readonly string[];
}

export function diffWaitlist(
  prev: readonly StudioSpaceWaitlistEntry[],
  next: readonly StudioSpaceWaitlistEntry[],
): StudioWaitlistDiff {
  const prevIds = new Set(prev.map((entry) => entry.id));
  const nextIds = new Set(next.map((entry) => entry.id));
  return {
    joined: next.filter((entry) => !prevIds.has(entry.id)),
    leftIds: prev.filter((entry) => !nextIds.has(entry.id)).map((entry) => entry.id),
  };
}

/** 내 좋아요 멤버십이 바뀐 프레임만 토글 대상으로 잡는다(조회수 변경은 제외). */
export function diffGalleryLikeToggles(
  prev: StudioGalleryStats,
  next: StudioGalleryStats,
  userId: string,
): readonly string[] {
  const frameIds = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const toggled: string[] = [];
  for (const frameId of frameIds) {
    const wasLiked = prev[frameId]?.likedBy.includes(userId) ?? false;
    const isLiked = next[frameId]?.likedBy.includes(userId) ?? false;
    if (wasLiked !== isLiked) toggled.push(frameId);
  }
  return toggled;
}

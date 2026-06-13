import { eq, inArray } from "drizzle-orm";
import {
  db,
  users,
  ratings,
  reads,
  subscriptions,
  reviews,
  reviewLikes,
  collections,
  collectionItems,
} from "../db";
import { fromDb } from "../api-helpers";
import { invalidateSessionUser } from "./session";
import { ensureUserLifecycleSchema, normalizeUserAccountStatus, softDeleteUserAccount } from "./user-lifecycle";

// 로그인 사용자의 전체 데이터를 클라이언트 하이드레이션 형태로 반환 (GET /api/me · POST /api/me/merge 공용)
export async function loadMe(uid: string) {
  try {
    await ensureUserLifecycleSchema();
    const [me] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (me && normalizeUserAccountStatus(me.status) !== "active") {
      return {
        profile: { id: uid, status: normalizeUserAccountStatus(me.status) },
        ratings: {},
        reads: {},
        subscriptions: {},
        reviews: {},
        likedReviews: {},
        collections: [],
      };
    }
    const [rt, rd, sub, rv, lk, cols] = await Promise.all([
      db.select().from(ratings).where(eq(ratings.userId, uid)),
      db.select().from(reads).where(eq(reads.userId, uid)),
      db.select().from(subscriptions).where(eq(subscriptions.userId, uid)),
      db.select().from(reviews).where(eq(reviews.userId, uid)),
      db.select().from(reviewLikes).where(eq(reviewLikes.userId, uid)),
      db.select().from(collections).where(eq(collections.userId, uid)),
    ]);

    // 컬렉션 아이템은 이 사용자의 컬렉션 id로 한정 조회 (전체 테이블 스캔 방지)
    const colIds = cols.map((c) => c.id);
    const colItems = colIds.length
      ? await db.select().from(collectionItems).where(inArray(collectionItems.collectionId, colIds))
      : [];
    const itemsByCol: Record<string, string[]> = {};
    for (const it of colItems) (itemsByCol[it.collectionId] ??= []).push(it.titleId);

    return {
      profile: {
        id: me?.id,
        name: me?.name,
        image: me?.image,
        avatar: me?.avatar,
        email: me?.email,
        bio: me?.bio,
        status: me?.status,
      },
      ratings: Object.fromEntries(rt.map((r) => [r.titleId, fromDb(r.value)])),
      reads: Object.fromEntries(rd.map((r) => [r.titleId, r.state])),
      subscriptions: Object.fromEntries(sub.map((s) => [s.titleId, true])),
      reviews: Object.fromEntries(
        rv.map((r) => [
          r.titleId,
          {
            rating: fromDb(r.rating),
            text: r.text,
            tags: r.tags,
            spoiler: r.spoiler,
            createdAt: new Date(r.createdAt ?? Date.now()).toISOString(),
          },
        ])
      ),
      likedReviews: Object.fromEntries(lk.map((l) => [l.reviewId, true])),
      collections: cols.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        titleIds: itemsByCol[c.id] ?? [],
        createdAt: new Date(c.createdAt ?? Date.now()).toISOString(),
      })),
    };
  } catch {
    // DB(Neon) 불가(쿼터/장애) 시 빈 데이터로 폴백 — 로그인 세션은 유지되고 클라 로컬 데이터를 사용.
    return { profile: { id: uid }, ratings: {}, reads: {}, subscriptions: {}, reviews: {}, likedReviews: {}, collections: [] };
  }
}

export async function deleteMyAccount(uid: string): Promise<{ ok: true; deletedAt: string } | ProfileUpdateError> {
  const row = await softDeleteUserAccount(uid, "self-service account deletion");
  if (!row) return { error: "사용자를 찾을 수 없어요." };
  return { ok: true, deletedAt: new Date(row.deletedAt ?? Date.now()).toISOString() };
}

// 업로드 아바타(dataURL)는 users.image 에 저장한다. 너무 크면 거부(DB 부하·요청 한도 보호).
export const MAX_PROFILE_IMAGE_BYTES = 400 * 1024;
const PROFILE_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

export interface UpdateProfileInput {
  name?: string;
  bio?: string;
  image?: string | null; // dataURL 또는 빈 문자열/ null(제거)
}

export interface ProfileUpdateError {
  error: string;
}

// dataURL 크기 검증(서버측). 유효하면 그대로, 비우면 null, 잘못된 형식이면 에러.
function validateProfileImage(value: string): string | null | ProfileUpdateError {
  const raw = value.trim();
  if (!raw) return null;
  const match = PROFILE_IMAGE_RE.exec(raw);
  if (!match) return { error: "지원하지 않는 이미지 형식이에요." };
  // 인코딩 헤더 제외한 실제 바이트가 한도를 넘으면 거부.
  if (raw.length > MAX_PROFILE_IMAGE_BYTES) return { error: "이미지가 너무 커요. (최대 400KB)" };
  return raw;
}

// 프로필(name·bio·image) 갱신. image 가 dataURL 이면 검증 후 users.image 에 저장.
// 반환은 갱신 후 프로필. 형식 오류 시 ProfileUpdateError 를 반환(컨트롤러가 400 매핑).
export async function updateProfile(
  uid: string,
  input: UpdateProfileInput
): Promise<{ profile: { id: string; name: string | null; image: string | null; avatar: string | null; email: string | null; bio: string | null } } | ProfileUpdateError> {
  const patch: { name?: string | null; bio?: string | null; image?: string | null } = {};

  if (typeof input.name === "string") {
    const name = input.name.trim().slice(0, 60);
    if (!name) return { error: "이름을 입력해 주세요." };
    patch.name = name;
  }
  if (typeof input.bio === "string") {
    patch.bio = input.bio.trim().slice(0, 280) || null;
  }
  if (input.image !== undefined) {
    if (input.image === null || (typeof input.image === "string" && input.image.trim() === "")) {
      patch.image = null;
    } else if (typeof input.image === "string") {
      const checked = validateProfileImage(input.image);
      if (checked && typeof checked === "object" && "error" in checked) return checked;
      patch.image = checked;
    }
  }

  if (Object.keys(patch).length === 0) return { error: "변경할 내용이 없어요." };

  const [row] = await db.update(users).set(patch).where(eq(users.id, uid)).returning({
    id: users.id,
    name: users.name,
    image: users.image,
    avatar: users.avatar,
    email: users.email,
    bio: users.bio,
  });
  if (!row) return { error: "사용자를 찾을 수 없어요." };
  // 프로필 변경 즉시 세션 마이크로캐시 무효화 — 다음 요청부터 새 값을 읽는다.
  invalidateSessionUser(uid);
  return { profile: row };
}

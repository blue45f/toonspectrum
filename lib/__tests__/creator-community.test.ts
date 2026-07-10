// 창작 커뮤니티(연재 시리즈·챌린지·팔로우) 테스트 — community.test.ts 패턴.
// 순수 검증 테스트는 항상 실행되고, DB가 있는 환경에서만 통합 테스트가 돈다.
import { inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  creatorFollows,
  creatorSeries,
  creatorWorkRevisions,
  creatorWorks,
  db,
  dbClient,
  users,
} from "../db";
import {
  SEED_CHALLENGES,
  challengeStateOf,
  createSeries,
  createWork,
  deleteSeries,
  ensureCreatorCommunitySchema,
  getSeries,
  getWork,
  getWorkRevision,
  addComment,
  listComments,
  listWorkRevisions,
  listWorks,
  nextEpisodeNumber,
  parseSeriesSort,
  parseSeriesStatus,
  seedChallengeWindow,
  toggleFollow,
  toggleLike,
  restoreWorkRevision,
  updateWork,
  validateFollowPair,
  validateSeriesInput,
} from "../server/creator";
import {
  CREATOR_WORK_REVISION_RETENTION,
  CreatorWorkRevisionConflictError,
  CreatorWorkRevisionNotFoundError,
} from "../server/creator-work-revisions";

import { retryOnDeadlock } from "./db-test-utils";

const createdUserIds = new Set<string>();
const createdWorkIds = new Set<string>();
const createdSeriesIds = new Set<string>();

async function cleanupCreatorRecords() {
  if (createdUserIds.size > 0) {
    // 팔로우는 복합 PK — 테스트 사용자 기준으로 제거(작품·시리즈는 FK cascade가 아닌 명시 삭제).
    await retryOnDeadlock(() =>
      db.delete(creatorFollows).where(inArray(creatorFollows.followerId, [...createdUserIds])),
    );
    await retryOnDeadlock(() =>
      db.delete(creatorFollows).where(inArray(creatorFollows.creatorId, [...createdUserIds])),
    );
  }
  if (createdWorkIds.size > 0) {
    await retryOnDeadlock(() => db.delete(creatorWorks).where(inArray(creatorWorks.id, [...createdWorkIds])));
    createdWorkIds.clear();
  }
  if (createdSeriesIds.size > 0) {
    await retryOnDeadlock(() => db.delete(creatorSeries).where(inArray(creatorSeries.id, [...createdSeriesIds])));
    createdSeriesIds.clear();
  }
  if (createdUserIds.size > 0) {
    await retryOnDeadlock(() => db.delete(users).where(inArray(users.id, [...createdUserIds])));
    createdUserIds.clear();
  }
}

async function ensureTestUserSchema() {
  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      "emailVerified" TIMESTAMPTZ,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      "passwordHash" TEXT,
      avatar TEXT,
      bio TEXT,
      "createdAt" TIMESTAMPTZ
    )
  `);
}

async function createCreatorTestUser(name = "테스트 창작자", idPrefix = "test-user-") {
  await ensureTestUserSchema();
  expect(await ensureCreatorCommunitySchema()).toBe(true);
  const id = `${idPrefix}${crypto.randomUUID()}`;
  createdUserIds.add(id);
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    name,
    avatar: "#2f855a",
  });
  return id;
}

let dbAvailable = false;
beforeAll(async () => {
  try {
    await dbClient.execute("SELECT 1");
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});

afterEach(async () => {
  if (!dbAvailable) return;
  await cleanupCreatorRecords();
});

// ── 순수 로직 ─────────────────────────────────────────────────────────
describe("creator community validation", () => {
  it("회차 번호는 시리즈 내 최대 회차 + 1 로 부여한다", () => {
    expect(nextEpisodeNumber([])).toBe(1);
    expect(nextEpisodeNumber([null, undefined])).toBe(1);
    expect(nextEpisodeNumber([1, 2, 5])).toBe(6);
    expect(nextEpisodeNumber([3.7])).toBe(4); // 소수 회차는 내림 후 +1
    expect(nextEpisodeNumber(["8", Number.NaN, -2])).toBe(9); // 문자열 숫자 허용·음수/NaN 무시
  });

  it("시리즈 입력을 정규화한다(제목 필수·태그 중복 제거·상태 화이트리스트)", () => {
    const ok = validateSeriesInput({
      title: "  야자 끝나고   옥상에서  ",
      description: "  옥상\n\n\n로맨스  ",
      tags: ["#로맨스", "로맨스", "학원", ""],
      status: "completed",
    });
    expect(ok.error).toBeUndefined();
    expect(ok.value?.title).toBe("야자 끝나고 옥상에서");
    expect(ok.value?.description).toContain("옥상");
    expect(ok.value?.tags).toEqual(["로맨스", "학원"]);
    expect(ok.value?.status).toBe("completed");

    expect(validateSeriesInput({ title: "   " }).error).toBeTruthy();
    expect(validateSeriesInput({ title: "제목", status: "bad" }).value?.status).toBe("ongoing");
  });

  it("시리즈 상태/정렬 파싱은 허용값만 통과한다", () => {
    expect(parseSeriesStatus("completed")).toBe("completed");
    expect(parseSeriesStatus("unknown")).toBe("ongoing");
    expect(parseSeriesSort("likes")).toBe("likes");
    expect(parseSeriesSort("views")).toBe("views");
    expect(parseSeriesSort("invalid")).toBe("recent");
  });

  it("자기 자신 팔로우는 거부한다", () => {
    expect(validateFollowPair("u1", "u1").error).toBeTruthy();
    expect(validateFollowPair("", "u2").error).toBeTruthy();
    const ok = validateFollowPair(" u1 ", "u2");
    expect(ok.error).toBeUndefined();
    expect(ok.followerId).toBe("u1");
    expect(ok.creatorId).toBe("u2");
  });

  it("챌린지 진행 상태를 기간으로 판정한다", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(challengeStateOf("2026-06-08", "2026-06-15", now)).toBe("ongoing");
    expect(challengeStateOf("2026-06-12", "2026-06-20", now)).toBe("upcoming");
    expect(challengeStateOf("2026-06-01", "2026-06-09", now)).toBe("ended");
    expect(challengeStateOf(null, null, now)).toBe("ongoing"); // 상시 챌린지
  });

  it("시드 챌린지 정의는 3~4개·고유 slug·유효 기간을 가진다", () => {
    expect(SEED_CHALLENGES.length).toBeGreaterThanOrEqual(3);
    expect(SEED_CHALLENGES.length).toBeLessThanOrEqual(4);
    const slugs = new Set(SEED_CHALLENGES.map((def) => def.slug));
    expect(slugs.size).toBe(SEED_CHALLENGES.length);
    const now = new Date("2026-06-10T07:30:00Z");
    for (const def of SEED_CHALLENGES) {
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.theme.length).toBeGreaterThan(0);
      const { startsAt, endsAt } = seedChallengeWindow(def, now);
      expect(startsAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(endsAt.getTime() - startsAt.getTime()).toBe(def.durationDays * 86_400_000);
      // 생성 직후엔 항상 진행중이어야 시드가 의미 있다.
      expect(challengeStateOf(startsAt, endsAt, now)).toBe("ongoing");
    }
  });
});

// ── DB 통합 ──────────────────────────────────────────────────────────
describe("creator community (DB)", { timeout: 90000 }, () => {
  it("owner-only snapshot, 낙관적 충돌, 복원을 단조 revision으로 처리한다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const owner = await createCreatorTestUser("revision 소유자", "revision-owner-");
    const reader = await createCreatorTestUser("revision 외부인", "revision-reader-");
    const created = await createWork(owner, {
      title: "revision 원고",
      status: "published",
      pages: ["data:image/png;base64,AA=="],
      doc: { versionLabel: "initial", privateNote: "owner only" },
    });
    createdWorkIds.add(created.id);
    expect(created.revision).toBe(1);
    await expect(getWork(created.id, owner)).resolves.toMatchObject({ revision: 1 });
    const publicWork = await getWork(created.id, reader);
    expect(publicWork).not.toHaveProperty("revision");
    expect(publicWork?.doc).not.toHaveProperty("privateNote");
    await expect(listWorkRevisions(reader, created.id)).rejects.toBeInstanceOf(
      CreatorWorkRevisionNotFoundError
    );

    const baseline = await getWorkRevision(owner, created.id, 1);
    expect(baseline.snapshot.doc).toEqual({ versionLabel: "initial", privateNote: "owner only" });

    const updated = await updateWork(owner, created.id, {
      doc: { versionLabel: "updated", privateNote: "still owner only" },
      baseRevision: 1,
    });
    expect(updated.revision).toBe(2);
    const stale = await updateWork(owner, created.id, { title: "stale", baseRevision: 1 })
      .catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(CreatorWorkRevisionConflictError);
    expect((stale as CreatorWorkRevisionConflictError).currentRevision).toBe(2);

    const restored = await restoreWorkRevision(owner, created.id, 1, 2);
    expect(restored.revision).toBe(3);
    await expect(getWork(created.id, owner)).resolves.toMatchObject({
      revision: 3,
      doc: { versionLabel: "initial", privateNote: "owner only" },
    });
    await expect(listWorkRevisions(owner, created.id)).resolves.toMatchObject([
      { revision: 3, restoredFromRevision: 1 },
      { revision: 2, restoredFromRevision: null },
      { revision: 1, restoredFromRevision: null },
    ]);
  }, 90000);

  it("작품별 snapshot은 성공한 저장과 같은 transaction에서 최신 보존 상한까지만 유지한다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const owner = await createCreatorTestUser("retention 소유자", "revision-retention-");
    const created = await createWork(owner, { title: "보존 상한 원고", status: "draft" });
    createdWorkIds.add(created.id);
    let currentRevision = created.revision;
    for (let index = 0; index < CREATOR_WORK_REVISION_RETENTION + 2; index += 1) {
      const saved = await updateWork(owner, created.id, {
        description: `저장 ${index + 1}`,
        baseRevision: currentRevision,
      });
      currentRevision = saved.revision;
    }

    const revisions = await listWorkRevisions(owner, created.id, CREATOR_WORK_REVISION_RETENTION);
    expect(revisions).toHaveLength(CREATOR_WORK_REVISION_RETENTION);
    expect(revisions[0]?.revision).toBe(currentRevision);
    expect(revisions.at(-1)?.revision).toBe(currentRevision - CREATOR_WORK_REVISION_RETENTION + 1);
    expect(revisions.some((item) => item.revision === 1)).toBe(false);
  }, 90000);

  it("snapshot insert가 실패하면 같은 transaction의 작품 수정과 revision 증가도 rollback한다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const owner = await createCreatorTestUser("rollback 소유자", "revision-rollback-");
    const created = await createWork(owner, { title: "원본 제목", status: "draft" });
    createdWorkIds.add(created.id);

    // 다음 번호를 미리 점유해 snapshot insert만 실패하도록 의도적으로 불일치 상태를 만든다.
    await db.insert(creatorWorkRevisions).values({
      workId: created.id,
      revision: 2,
      snapshot: {},
    });

    await expect(updateWork(owner, created.id, {
      title: "rollback되어야 하는 제목",
      baseRevision: 1,
    })).rejects.toThrow();
    await expect(getWork(created.id, owner)).resolves.toMatchObject({
      title: "원본 제목",
      revision: 1,
    });
  }, 90000);

  it("초안은 소유자만 조회할 수 있고 좋아요·댓글 경로에서도 공개되지 않는다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const owner = await createCreatorTestUser("초안 소유자", "draft-owner-");
    const reader = await createCreatorTestUser("다른 독자", "draft-reader-");
    const draft = await createWork(owner, {
      title: "아직 공개하지 않은 원고",
      status: "draft",
      pages: ["data:image/png;base64,AA=="],
      doc: { privateNote: "외부에 보이면 안 됨" },
    });
    createdWorkIds.add(draft.id);

    await expect(getWork(draft.id, owner)).resolves.toMatchObject({ id: draft.id, isOwner: true });
    await expect(getWork(draft.id, reader)).resolves.toBeNull();
    await expect(getWork(draft.id)).resolves.toBeNull();
    await expect(toggleLike(reader, draft.id)).rejects.toThrow(/공개된 작품/);
    await expect(addComment(reader, draft.id, "미공개 작품 댓글")).rejects.toThrow(/공개된 작품/);
    await expect(listComments(draft.id)).resolves.toEqual([]);

    await updateWork(owner, draft.id, { status: "published" });
    await expect(getWork(draft.id, reader)).resolves.toMatchObject({ id: draft.id, status: "published" });
  }, 90000);

  it("시리즈에 회차를 게시하면 episodeNo 가 max+1 로 자동 부여된다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const userId = await createCreatorTestUser();
    const series = await createSeries(userId, { title: "회차 테스트 시리즈" });
    createdSeriesIds.add(series.id);

    const first = await createWork(userId, { title: "1화 제목", seriesId: series.id });
    createdWorkIds.add(first.id);
    const second = await createWork(userId, { title: "2화 제목", seriesId: series.id });
    createdWorkIds.add(second.id);

    expect(first.episodeNo).toBe(1);
    expect(second.episodeNo).toBe(2);
    expect(first.seriesTitle).toBe("회차 테스트 시리즈");

    const detail = await getSeries(series.id, userId);
    expect(detail?.episodeList.map((episode) => episode.episodeNo)).toEqual([1, 2]);
    expect(detail?.episodes).toBe(2);
  }, 90000);

  it("남의 시리즈에는 회차를 추가할 수 없다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const owner = await createCreatorTestUser("시리즈 주인");
    const intruder = await createCreatorTestUser("다른 사람");
    const series = await createSeries(owner, { title: "남의 시리즈" });
    createdSeriesIds.add(series.id);

    await expect(createWork(intruder, { title: "무단 회차", seriesId: series.id })).rejects.toThrow(/내 시리즈/);
  }, 90000);

  it("시리즈 변경/해제 시 episodeNo 를 재계산하거나 비운다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const userId = await createCreatorTestUser();
    const seriesA = await createSeries(userId, { title: "시리즈 A" });
    const seriesB = await createSeries(userId, { title: "시리즈 B" });
    createdSeriesIds.add(seriesA.id);
    createdSeriesIds.add(seriesB.id);

    const work = await createWork(userId, { title: "이동하는 회차", seriesId: seriesA.id });
    createdWorkIds.add(work.id);
    expect(work.episodeNo).toBe(1);

    const moved = await updateWork(userId, work.id, { seriesId: seriesB.id });
    expect(moved.seriesId).toBe(seriesB.id);
    expect(moved.episodeNo).toBe(1); // 시리즈 B 기준 첫 회차

    const detached = await updateWork(userId, work.id, { seriesId: null });
    expect(detached.seriesId).toBeNull();
    expect(detached.episodeNo).toBeNull();
  }, 90000);

  it("시리즈를 삭제해도 회차 작품은 분리만 되고 남는다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const userId = await createCreatorTestUser();
    const series = await createSeries(userId, { title: "삭제될 시리즈" });
    createdSeriesIds.add(series.id);
    const work = await createWork(userId, { title: "남을 작품", seriesId: series.id });
    createdWorkIds.add(work.id);

    const result = await deleteSeries(userId, series.id, false);
    expect(result.deleted).toBe(true);

    const works = await listWorks({ userId, viewerId: userId });
    const survivor = works.find((item) => item.id === work.id);
    expect(survivor).toBeTruthy();
    expect(survivor?.seriesId).toBeNull();
    expect(survivor?.episodeNo).toBeNull();
  }, 90000);

  it("팔로우 토글과 팔로잉 피드가 동작한다", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const follower = await createCreatorTestUser("팔로워", "feed-follower-");
    const creator = await createCreatorTestUser("창작자", "feed-creator-");

    const on = await toggleFollow(follower, creator);
    expect(on.following).toBe(true);
    expect(on.followers).toBe(1);

    const work = await createWork(creator, { title: "팔로잉 피드 작품" });
    createdWorkIds.add(work.id);
    const feed = await listWorks({ followedBy: follower, viewerId: follower });
    expect(feed.some((item) => item.id === work.id)).toBe(true);

    const off = await toggleFollow(follower, creator);
    expect(off.following).toBe(false);
    expect(off.followers).toBe(0);
    const emptyFeed = await listWorks({ followedBy: follower, viewerId: follower });
    expect(emptyFeed.some((item) => item.id === work.id)).toBe(false);

    await expect(toggleFollow(follower, follower)).rejects.toThrow(/자기 자신/);
  }, 90000);
});

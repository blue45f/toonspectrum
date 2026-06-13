import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import {
  addComment,
  bumpAssetDownloads,
  bumpViews,
  createSeries,
  createWork,
  deleteSeries,
  deleteSharedAsset,
  deleteWork,
  generateImageAsset,
  getChallenge,
  getCreatorPublicProfile,
  getSeries,
  getWork,
  listChallenges,
  listComments,
  listSeries,
  listSharedAssets,
  listWorks,
  parseCreatorSort,
  parseSeriesSort,
  publishAsset,
  toggleFollow,
  toggleLike,
  updateSeries,
  updateWork,
} from "../../../../../lib/server/creator";

interface ListQuery {
  titleId?: string | null;
  userId?: string | null;
  sort?: string | null;
  tag?: string | null;
  seriesId?: string | null;
  challengeId?: string | null;
}

@Injectable()
export class CreatorService {
  async listWorks(q: ListQuery, viewerId?: string) {
    return listWorks({
      titleId: q.titleId ?? undefined,
      userId: q.userId ?? undefined,
      sort: parseCreatorSort(q.sort),
      tag: q.tag ?? undefined,
      seriesId: q.seriesId ?? undefined,
      challengeId: q.challengeId ?? undefined,
      viewerId: viewerId ?? undefined,
    });
  }

  async getWork(id: string, viewerId?: string) {
    const work = await getWork(id, viewerId);
    if (!work) throw new NotFoundException("작품을 찾을 수 없습니다.");
    // 조회수 증가는 best-effort(소유자/뷰어 구분 없이 1 증가).
    await bumpViews(id);
    return work;
  }

  async createWork(userId: string, body: unknown) {
    try {
      // 페이지/문서가 클 수 있으나 다른 모듈과 동일하게 별도 크기 제한은 두지 않는다.
      return await createWork(userId, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 저장할 수 없습니다.");
    }
  }

  async updateWork(userId: string, id: string, body: unknown) {
    try {
      return await updateWork(userId, id, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 수정할 수 없습니다.");
    }
  }

  async deleteWork(userId: string, id: string, isAdmin: boolean) {
    try {
      return await deleteWork(userId, id, isAdmin);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 삭제할 수 없습니다.");
    }
  }

  async toggleLike(userId: string, workId: string) {
    try {
      return await toggleLike(userId, workId);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "좋아요를 처리할 수 없습니다.");
    }
  }

  async listComments(workId: string) {
    return listComments(workId);
  }

  async addComment(userId: string, workId: string, body: unknown) {
    const text = (body as { text?: unknown } | null | undefined)?.text;
    try {
      return await addComment(userId, workId, text);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "댓글을 작성할 수 없습니다.");
    }
  }

  async listSharedAssets(q: { mine?: string | null; limit?: string | null; offset?: string | null }, viewerId?: string) {
    return listSharedAssets({
      mineUserId: q.mine === "1" ? viewerId : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
      viewerId,
    });
  }

  async publishAsset(userId: string, body: unknown) {
    try {
      return await publishAsset(userId, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "에셋을 공유할 수 없습니다.");
    }
  }

  async generateAsset(body: unknown) {
    try {
      return await generateImageAsset((body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "이미지를 생성할 수 없습니다.");
    }
  }

  async deleteSharedAsset(userId: string, id: string, isAdmin: boolean) {
    try {
      return await deleteSharedAsset(userId, id, isAdmin);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "에셋을 삭제할 수 없습니다.");
    }
  }

  async useSharedAsset(id: string) {
    await bumpAssetDownloads(id);
    return { ok: true };
  }

  // ── 연재 시리즈 ──────────────────────────────────────────────────
  async listSeries(q: { userId?: string | null; sort?: string | null }, viewerId?: string) {
    return listSeries({
      userId: q.userId ?? undefined,
      sort: parseSeriesSort(q.sort),
      viewerId: viewerId ?? undefined,
    });
  }

  async getSeries(id: string, viewerId?: string) {
    const series = await getSeries(id, viewerId);
    if (!series) throw new NotFoundException("시리즈를 찾을 수 없습니다.");
    return series;
  }

  async createSeries(userId: string, body: unknown) {
    try {
      return await createSeries(userId, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "시리즈를 만들 수 없습니다.");
    }
  }

  async updateSeries(userId: string, id: string, body: unknown) {
    try {
      return await updateSeries(userId, id, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "시리즈를 수정할 수 없습니다.");
    }
  }

  async deleteSeries(userId: string, id: string, isAdmin: boolean) {
    try {
      return await deleteSeries(userId, id, isAdmin);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "시리즈를 삭제할 수 없습니다.");
    }
  }

  // ── 창작 챌린지 ──────────────────────────────────────────────────
  async listChallenges() {
    return listChallenges();
  }

  async getChallenge(key: string, viewerId?: string) {
    const challenge = await getChallenge(key, viewerId);
    if (!challenge) throw new NotFoundException("챌린지를 찾을 수 없습니다.");
    return challenge;
  }

  // ── 팔로우/공개 프로필 ───────────────────────────────────────────
  async toggleFollow(followerId: string, creatorId: string) {
    try {
      return await toggleFollow(followerId, creatorId);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "팔로우를 처리할 수 없습니다.");
    }
  }

  async getCreatorProfile(userId: string, viewerId?: string) {
    const profile = await getCreatorPublicProfile(userId, viewerId);
    if (!profile) throw new NotFoundException("회원을 찾을 수 없습니다.");
    return profile;
  }

  // 팔로잉 피드 — 팔로우한 창작자의 최신 작품.
  async listFollowingFeed(viewerId: string) {
    return listWorks({ followedBy: viewerId, viewerId, sort: "recent" });
  }
}

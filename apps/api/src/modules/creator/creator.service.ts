import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { rateLimit } from "../../../../../lib/rate-limit";
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
  getWorkRevision,
  listChallenges,
  listComments,
  listSeries,
  listSharedAssets,
  listWorkRevisions,
  listWorks,
  parseCreatorSort,
  parseSeriesSort,
  publishAsset,
  restoreWorkRevision,
  toggleFollow,
  toggleLike,
  updateSeries,
  updateWork,
} from "../../../../../lib/server/creator";
import {
  CreatorWorkRevisionConflictError,
  CreatorWorkRevisionNotFoundError,
} from "../../../../../lib/server/creator-work-revisions";

import type { CreateCreatorWorkDto, UpdateCreatorWorkDto } from "./creator.dto";

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
    // 소유자가 편집/미리보기로 새로고침하는 횟수는 공개 조회수에 포함하지 않는다.
    if (!work.isOwner) await bumpViews(id);
    return work;
  }

  async createWork(userId: string, body: CreateCreatorWorkDto) {
    try {
      // 페이지/문서가 클 수 있으나 다른 모듈과 동일하게 별도 크기 제한은 두지 않는다.
      return await createWork(userId, body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 저장할 수 없습니다.");
    }
  }

  async updateWork(userId: string, id: string, body: UpdateCreatorWorkDto) {
    try {
      return await updateWork(userId, id, body);
    } catch (error) {
      if (error instanceof CreatorWorkRevisionConflictError) {
        throw new ConflictException({
          code: "creator_work_revision_conflict",
          message: "다른 저장이 먼저 반영되었습니다. 작품을 다시 불러온 뒤 변경 내용을 확인해 주세요.",
          currentRevision: error.currentRevision,
        });
      }
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 수정할 수 없습니다.");
    }
  }

  async listWorkRevisions(userId: string, id: string, limit: number) {
    try {
      return await listWorkRevisions(userId, id, limit);
    } catch (error) {
      if (error instanceof CreatorWorkRevisionNotFoundError) {
        throw new NotFoundException("작품 revision을 찾을 수 없습니다.");
      }
      throw new BadRequestException("작품 revision을 불러올 수 없습니다.");
    }
  }

  async getWorkRevision(userId: string, id: string, revision: number) {
    try {
      return await getWorkRevision(userId, id, revision);
    } catch (error) {
      if (error instanceof CreatorWorkRevisionNotFoundError) {
        throw new NotFoundException("작품 revision을 찾을 수 없습니다.");
      }
      throw new BadRequestException("작품 revision을 불러올 수 없습니다.");
    }
  }

  async restoreWorkRevision(userId: string, id: string, revision: number, baseRevision: number) {
    try {
      return await restoreWorkRevision(userId, id, revision, baseRevision);
    } catch (error) {
      if (error instanceof CreatorWorkRevisionConflictError) {
        throw new ConflictException({
          code: "creator_work_revision_conflict",
          message: "다른 저장이 먼저 반영되었습니다. 작품을 다시 불러온 뒤 복원을 다시 시도해 주세요.",
          currentRevision: error.currentRevision,
        });
      }
      if (error instanceof CreatorWorkRevisionNotFoundError) {
        throw new NotFoundException("작품 revision을 찾을 수 없습니다.");
      }
      throw new BadRequestException("작품 revision을 복원할 수 없습니다.");
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

  async generateAsset(userId: string, body: unknown) {
    if (process.env.CREATOR_IMAGE_AI_ENABLED !== "true") {
      throw new ServiceUnavailableException("서버 이미지 생성은 현재 비활성화되어 있어요. 내 API 키 연동을 이용해 주세요.");
    }
    if (!rateLimit(`creator-image-ai:${userId}`, 5, 60 * 60_000)) {
      throw new HttpException("이미지 생성 한도에 도달했어요. 잠시 후 다시 시도해 주세요.", HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      return await generateImageAsset((body ?? {}) as Record<string, unknown>);
    } catch (error) {
      if (error instanceof HttpException) throw error;
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

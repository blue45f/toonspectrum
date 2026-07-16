import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
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
  getWorkRevisionComparison,
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

import {
  CreatorCollaborationCrdtSequenceConflictError,
  CreatorCollaborationConflictError,
  CreatorCollaborationForbiddenError,
  CreatorCollaborationInvalidTargetError,
  CreatorCollaborationNotFoundError,
  CreatorCollaborationRepository,
  CreatorCollaborationRevisionConflictError,
} from "./creator-collaboration.repository";
import {
  CreatorSharedDocumentMetaResponseSchema,
  CreatorSharedDocumentResponseSchema,
  CreatorSharedDocumentSaveResponseSchema,
  CreatorSharedWorksResponseSchema,
  CreatorWorkRevisionComparisonResponseSchema,
  UpdateCreatorSharedDocumentSchema,
} from "./creator.dto";

import type { CreatorCollaborationRole } from "./creator-collaboration.policy";
import type {
  CreatorSharedDocumentPatch,
} from "./creator-collaboration.repository";
import type {
  CreateCreatorWorkDto,
  UpdateCreatorSharedDocumentDto,
  UpdateCreatorWorkDto,
} from "./creator.dto";

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
  private readonly logger = new Logger(CreatorService.name);

  constructor(
    @Inject(CreatorCollaborationRepository)
    private readonly creatorCollaborationRepository: CreatorCollaborationRepository
  ) {}

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

  async getWorkRevisionComparison(userId: string, id: string, revision: number) {
    try {
      return CreatorWorkRevisionComparisonResponseSchema.parse(
        await getWorkRevisionComparison(userId, id, revision)
      );
    } catch (error) {
      if (error instanceof CreatorWorkRevisionNotFoundError) {
        throw new NotFoundException("작품 revision을 찾을 수 없습니다.");
      }
      throw new BadRequestException("작품 revision 비교 정보를 불러올 수 없습니다.");
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

  async getWorkTeam(userId: string, workId: string) {
    return this.runCreatorCollaborationOperation("get_team", workId, () =>
      this.creatorCollaborationRepository.getTeam(userId, workId)
    );
  }

  async listWorkTeamInvitations(userId: string, limit: number) {
    return this.runCreatorCollaborationOperation("list_invitations", "inbox", () =>
      this.creatorCollaborationRepository.listInvitations(userId, limit)
    );
  }

  async getWorkTeamActivity(userId: string, workId: string, limit: number) {
    return this.runCreatorCollaborationOperation("get_activity", workId, () =>
      this.creatorCollaborationRepository.getActivity(userId, workId, limit)
    );
  }

  async listSharedWorks(userId: string, limit: number, cursor?: string) {
    return this.runCreatorCollaborationOperation("list_shared_works", "shared", async () =>
      CreatorSharedWorksResponseSchema.parse(
        await this.creatorCollaborationRepository.listSharedWorks(userId, limit, cursor)
      )
    );
  }

  async getSharedWorkDocument(userId: string, workId: string) {
    return this.runCreatorCollaborationOperation("get_shared_document", workId, async () =>
      CreatorSharedDocumentResponseSchema.parse(
        await this.creatorCollaborationRepository.getSharedDocument(userId, workId)
      )
    );
  }

  async getSharedWorkDocumentMeta(userId: string, workId: string) {
    return this.runCreatorCollaborationOperation("get_shared_document_meta", workId, async () =>
      CreatorSharedDocumentMetaResponseSchema.parse(
        await this.creatorCollaborationRepository.getSharedDocumentMeta(userId, workId)
      )
    );
  }

  async saveSharedWorkDocument(
    userId: string,
    workId: string,
    body: UpdateCreatorSharedDocumentDto
  ) {
    const validated = UpdateCreatorSharedDocumentSchema.parse(body);
    const {
      baseRevision,
      crdtServerSequence,
      title,
      description,
      cover,
      tags,
      titleId,
      pages,
      doc,
      status,
    } = validated;
    const patch: CreatorSharedDocumentPatch = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (cover !== undefined) patch.cover = cover;
    if (tags !== undefined) patch.tags = tags;
    if (titleId !== undefined) patch.titleId = titleId;
    if (pages !== undefined) patch.pages = pages;
    if (doc !== undefined) patch.doc = doc;
    if (status !== undefined) patch.status = status;

    return this.runCreatorCollaborationOperation("save_shared_document", workId, async () =>
      CreatorSharedDocumentSaveResponseSchema.parse(
        await this.creatorCollaborationRepository.saveSharedDocument(
          userId,
          workId,
          baseRevision,
          BigInt(crdtServerSequence),
          patch
        )
      )
    );
  }

  async inviteWorkTeamMember(
    userId: string,
    workId: string,
    targetUserId: string,
    role: CreatorCollaborationRole
  ) {
    if (!rateLimit(`creator-team-invite:${userId}:${workId}`, 30, 60 * 60_000)) {
      throw new HttpException(
        {
          code: "creator_team_invite_rate_limited",
          message: "팀 초대 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    return this.runCreatorCollaborationOperation("invite_member", workId, () =>
      this.creatorCollaborationRepository.invite(userId, workId, targetUserId, role)
    );
  }

  async updateWorkTeamMemberRole(
    userId: string,
    workId: string,
    targetUserId: string,
    role: CreatorCollaborationRole
  ) {
    return this.runCreatorCollaborationOperation("update_member_role", workId, () =>
      this.creatorCollaborationRepository.updateMemberRole(userId, workId, targetUserId, role)
    );
  }

  async removeWorkTeamMember(userId: string, workId: string, targetUserId: string) {
    return this.runCreatorCollaborationOperation("remove_member", workId, () =>
      this.creatorCollaborationRepository.removeMember(userId, workId, targetUserId)
    );
  }

  async respondToWorkTeamInvitation(
    userId: string,
    workId: string,
    action: "accept" | "decline",
    invitationId: string
  ) {
    return this.runCreatorCollaborationOperation("respond_invitation", workId, () =>
      this.creatorCollaborationRepository.respondToInvitation(userId, workId, action, invitationId)
    );
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

  private async runCreatorCollaborationOperation<T>(
    operationName: string,
    workId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CreatorCollaborationNotFoundError) {
        throw new NotFoundException(
          error.code === "work_not_found"
            ? "작품을 찾을 수 없습니다."
            : error.code === "member_not_found"
              ? "팀원을 찾을 수 없습니다."
              : "대기 중인 초대를 찾을 수 없습니다."
        );
      }
      if (error instanceof CreatorCollaborationForbiddenError) {
        const messages: Record<typeof error.code, string> = {
          team_access_denied: "이 작품의 팀 목록을 볼 권한이 없습니다.",
          member_management_denied: "팀원을 관리할 권한이 없습니다.",
          document_access_denied: "이 작품의 원본 문서를 볼 권한이 없습니다.",
          document_edit_denied: "이 작품의 원본 문서를 저장할 권한이 없습니다.",
          document_owner_fields_denied: "게시 상태와 연결 작품은 작품 소유자만 변경할 수 있습니다.",
        };
        throw new ForbiddenException(messages[error.code]);
      }
      if (error instanceof CreatorCollaborationRevisionConflictError) {
        throw new ConflictException({
          code: "creator_work_revision_conflict",
          message: "다른 팀원이 먼저 저장했습니다. 최신 문서를 불러온 뒤 변경 내용을 다시 확인해 주세요.",
          currentRevision: error.currentRevision,
        });
      }
      if (error instanceof CreatorCollaborationCrdtSequenceConflictError) {
        throw new ConflictException({
          code: "creator_crdt_sequence_conflict",
          message:
            "동기화 확인 후 다른 팀 편집이 먼저 저장됐습니다. 최신 원고를 맞춘 뒤 다시 저장해 주세요.",
          currentCrdtServerSequence: error.currentServerSequence.toString(),
        });
      }
      if (error instanceof CreatorCollaborationConflictError) {
        const messages: Record<typeof error.code, string> = {
          member_already_active: "이미 참여 중인 팀원입니다.",
          invitation_already_pending: "이미 응답을 기다리는 초대가 있습니다.",
          invitation_not_pending: "이미 처리되었거나 더 이상 응답할 수 없는 초대입니다.",
          invitation_changed: "초대 내용이 변경되었습니다. 최신 팀 정보를 불러온 뒤 다시 선택해 주세요.",
          member_limit_reached: "팀 정원이 가득 찼습니다. 기존 팀원을 정리한 뒤 다시 시도해 주세요.",
          reinvite_cooldown: "최근 처리된 초대입니다. 잠시 후 다시 시도해 주세요.",
        };
        throw new ConflictException({ code: error.code, message: messages[error.code] });
      }
      if (error instanceof CreatorCollaborationInvalidTargetError) {
        throw new BadRequestException(
          error.code === "invalid_cursor"
            ? "공유 작품 페이지 커서가 올바르지 않습니다."
            : error.code === "owner_or_self_target"
            ? "작품 소유자 또는 본인은 초대할 수 없습니다."
            : error.code === "target_user_unavailable"
              ? "초대할 수 있는 활성 회원을 찾지 못했습니다."
              : "팀 요청 내용이 올바르지 않습니다."
        );
      }
      const errorType =
        error instanceof Error ? error.name.replace(/[^A-Za-z0-9_$.-]/g, "?").slice(0, 80) : typeof error;
      const sanitizedTrace =
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((line) => /^\s+at\s/.test(line))
              .slice(0, 12)
              .join("\n")
          : undefined;
      this.logger.error(
        `Creator collaboration ${operationName} failed for work=${JSON.stringify(workId.slice(0, 160))}; cause=${errorType}`,
        sanitizedTrace
      );
      throw new ServiceUnavailableException("팀 작업 공간을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
  }
}

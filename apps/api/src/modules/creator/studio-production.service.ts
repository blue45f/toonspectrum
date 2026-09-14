import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";

import {
  CreateStudioReviewLinkSchema,
  CreateStudioReviewFeedbackSchema,
  StudioPersonalKitDocumentSchema,
  StudioProductionWorkspaceDocumentSchema,
} from "./studio-production.dto";
import {
  STUDIO_PRODUCTION_REPOSITORY,
  StudioProductionForbiddenError,
  StudioProductionInvalidPageError,
  StudioProductionNotFoundError,
  StudioProductionQuotaError,
  StudioProductionRevisionConflictError,
  StudioReviewLinkUnavailableError,
} from "./studio-production.repository";

import type {
  CreateStudioReviewLinkInput,
  StudioPersonalKitDocument,
  StudioProductionWorkspaceDocument,
  StudioReviewFeedbackInput,
} from "./studio-production.dto";
import type {
  StudioCreatedReviewLink,
  StudioExternalReviewFeedback,
  StudioExternalReviewSnapshot,
  StudioPersonalKitSnapshot,
  StudioProductionRepository,
  StudioProductionWorkspaceSnapshot,
  StudioReviewLinkSummary,
} from "./studio-production.repository";

@Injectable()
export class StudioProductionService {
  constructor(
    @Inject(STUDIO_PRODUCTION_REPOSITORY)
    private readonly repository: StudioProductionRepository
  ) {}

  getWorkspace(
    actorUserId: string,
    workId: string,
  ): Promise<StudioProductionWorkspaceSnapshot> {
    return this.run(() => this.repository.getWorkspace(actorUserId, workId));
  }

  saveWorkspace(
    actorUserId: string,
    workId: string,
    baseRevision: number,
    document: StudioProductionWorkspaceDocument,
  ): Promise<StudioProductionWorkspaceSnapshot> {
    const parsed = StudioProductionWorkspaceDocumentSchema.parse(document);
    return this.run(() => this.repository.saveWorkspace(
      actorUserId,
      workId,
      baseRevision,
      parsed,
    ));
  }
  getPersonalKit(userId: string): Promise<StudioPersonalKitSnapshot> {
    return this.run(() => this.repository.getPersonalKit(userId));
  }

  savePersonalKit(
    userId: string,
    baseRevision: number,
    document: StudioPersonalKitDocument,
  ): Promise<StudioPersonalKitSnapshot> {
    const parsed = StudioPersonalKitDocumentSchema.parse(document);
    return this.run(() => this.repository.savePersonalKit(userId, baseRevision, parsed));
  }

  listReviewLinks(
    actorUserId: string,
    workId: string,
  ): Promise<readonly StudioReviewLinkSummary[]> {
    return this.run(() => this.repository.listReviewLinks(actorUserId, workId));
  }

  createReviewLink(
    actorUserId: string,
    workId: string,
    input: CreateStudioReviewLinkInput,
  ): Promise<StudioCreatedReviewLink> {
    const parsed = CreateStudioReviewLinkSchema.parse(input);
    return this.run(() => this.repository.createReviewLink(actorUserId, workId, parsed));
  }

  revokeReviewLink(
    actorUserId: string,
    workId: string,
    linkId: string,
  ): Promise<StudioReviewLinkSummary> {
    return this.run(() => this.repository.revokeReviewLink(actorUserId, workId, linkId));
  }
  getExternalReview(token: string): Promise<StudioExternalReviewSnapshot> {
    return this.run(() => this.repository.getExternalReview(token));
  }

  addExternalReviewFeedback(
    token: string,
    input: StudioReviewFeedbackInput,
    reviewerUserId?: string,
  ): Promise<StudioExternalReviewFeedback> {
    const parsed = CreateStudioReviewFeedbackSchema.parse(input);
    return this.run(() => this.repository.addExternalReviewFeedback(
      token,
      parsed,
      reviewerUserId,
    ));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof StudioProductionNotFoundError) {
        const message = error.target === "work"
          ? "작품을 찾을 수 없습니다."
          : error.target === "review-link"
            ? "검토 링크를 찾을 수 없습니다."
            : "사용자 계정을 찾을 수 없습니다.";
        throw new NotFoundException(message);
      }
      if (error instanceof StudioProductionInvalidPageError) {
        throw new BadRequestException(
          "선택한 검토 페이지가 현재 작품에 없거나 더 이상 존재하지 않습니다."
        );
      }
      if (error instanceof StudioProductionForbiddenError) {
        let message: string;
        switch (error.operation) {
          case "view":
            message = "이 작품의 제작 운영 정보를 볼 권한이 없습니다.";
            break;
          case "edit":
            message = "이 작품의 제작 운영 정보를 편집할 권한이 없습니다.";
            break;
          case "manage-links":
            message = "이 작품의 외부 검토 링크를 관리할 권한이 없습니다.";
            break;
          case "manage-roles":
            message = "제작 역할과 팀 범위를 변경할 권한이 없습니다.";
            break;
          case "approve":
            message = "승인 단계 또는 승인 필수 검수를 변경할 권한이 없습니다.";
            break;
          case "publish":
            message = "게시 준비 단계를 변경할 권한이 없습니다.";
            break;
          case "comment":
            message = "이 링크에는 검토 의견 작성 권한이 없습니다.";
            break;
        }
        throw new ForbiddenException(message);
      }
      if (error instanceof StudioProductionRevisionConflictError) {
        throw new ConflictException({
          message: "다른 장치나 팀원이 먼저 수정했습니다. 최신 제작 운영 데이터를 다시 불러와 주세요.",
          currentRevision: error.currentRevision,
        });
      }
      if (error instanceof StudioReviewLinkUnavailableError) {
        if (error.reason === "invalid") {
          throw new NotFoundException("검토 링크를 찾을 수 없습니다.");
        }
        throw new GoneException(
          error.reason === "expired"
            ? "검토 링크의 유효 기간이 끝났습니다."
            : "검토 링크가 폐기되었습니다."
        );
      }
      if (error instanceof StudioProductionQuotaError) {
        throw new PayloadTooLargeException(
          error.quota === "review-links"
            ? "한 작품에 동시에 활성화할 수 있는 검토 링크 수를 초과했습니다."
            : "이 검토 링크에 저장할 수 있는 의견 수를 초과했습니다."
        );
      }
      throw error;
    }
  }
}

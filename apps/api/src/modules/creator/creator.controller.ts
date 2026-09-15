import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { isAdminUser } from "../../server/app-config";

import {
  CreateCreatorWorkDto,
  CreatorAssetListQueryDto,
  CreatorAssetModerationQueryDto,
  CreatorAssetParamsDto,
  CreatorDraftCollaborationRoomParamsDto,
  CreatorExternalPublicationParamsDto,
  CreatorSharedWorksListQueryDto,
  CreatorTeamListQueryDto,
  CreatorTeamMemberParamsDto,
  CreatorTeamWorkParamsDto,
  CreatorWorkListQueryDto,
  CreatorWorkParamsDto,
  CreatorWorkRevisionListParamsDto,
  CreatorWorkRevisionListQueryDto,
  CreatorWorkRevisionParamsDto,
  InviteCreatorTeamMemberDto,
  ModerateCreatorAssetDto,
  PromoteCreatorDraftCollaborationRoomDto,
  PublishCreatorAssetDto,
  ProvisionCreatorDraftCollaborationRoomDto,
  ReportCreatorAssetDto,
  ReportCreatorWorkDto,
  RespondCreatorTeamInvitationDto,
  RestoreCreatorWorkRevisionDto,
  SaveCreatorExternalPublicationDto,
  UpdateCreatorSharedDocumentDto,
  UpdateCreatorTeamMemberDto,
  UpdateCreatorWorkDto,
} from "./creator.dto";
import { CreatorService } from "./creator.service";


function enforceUserOrError(userId: string | null | undefined) {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller()
export class CreatorController {
  // `tsx watch` does not emit Nest's design:paramtypes metadata, so use an
  // explicit token to keep development and compiled production behavior equal.
  constructor(@Inject(CreatorService) private readonly creatorService: CreatorService) {}

  @Get("/creator/works")
  @Header("Cache-Control", "no-store, max-age=0")
  async listWorks(
    @Query(new ZodValidationPipe(CreatorWorkListQueryDto)) query: CreatorWorkListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.creatorService.listWorks(query, userId || undefined);
  }

  @Get("/creator/works/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  async getWork(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    return this.creatorService.getWork(id, userId || undefined);
  }

  @Post("/creator/works")
  async createWork(@Body() body: CreateCreatorWorkDto, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.createWork(uid, body);
  }

  @Post("/creator/draft-collaboration/rooms")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async provisionDraftCollaborationRoom(
    @Body(new ZodValidationPipe(ProvisionCreatorDraftCollaborationRoomDto))
    body: ProvisionCreatorDraftCollaborationRoomDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.provisionDraftCollaborationRoom(uid, body);
  }

  @Post("/creator/draft-collaboration/rooms/:roomId/promote")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async promoteDraftCollaborationRoom(
    @Param(new ZodValidationPipe(CreatorDraftCollaborationRoomParamsDto))
    params: CreatorDraftCollaborationRoomParamsDto,
    @Body(new ZodValidationPipe(PromoteCreatorDraftCollaborationRoomDto))
    body: PromoteCreatorDraftCollaborationRoomDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.promoteDraftCollaborationRoom(uid, params.roomId, body);
  }

  @Patch("/creator/works/:id")
  async updateWork(
    @Param("id") id: string,
    @Body() body: UpdateCreatorWorkDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.updateWork(uid, id, body);
  }

  @Get("/creator/works/:id/revisions")
  @Header("Cache-Control", "no-store, max-age=0")
  async listWorkRevisions(
    @Param() params: CreatorWorkRevisionListParamsDto,
    @Query() query: CreatorWorkRevisionListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.listWorkRevisions(uid, params.id, query.limit);
  }

  @Get("/creator/works/:id/revisions/:revision")
  @Header("Cache-Control", "no-store, max-age=0")
  async getWorkRevision(
    @Param() params: CreatorWorkRevisionParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.getWorkRevision(uid, params.id, params.revision);
  }

  @Get("/creator/works/:id/revisions/:revision/comparison")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getWorkRevisionComparison(
    @Param(new ZodValidationPipe(CreatorWorkRevisionParamsDto))
    params: CreatorWorkRevisionParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.getWorkRevisionComparison(uid, params.id, params.revision);
  }

  @Post("/creator/works/:id/revisions/:revision/restore")
  async restoreWorkRevision(
    @Param() params: CreatorWorkRevisionParamsDto,
    @Body() body: RestoreCreatorWorkRevisionDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.restoreWorkRevision(
      uid,
      params.id,
      params.revision,
      body.baseRevision
    );
  }

  @Get("/creator/works/:id/team")
  @Header("Cache-Control", "no-store, max-age=0")
  async getWorkTeam(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.getWorkTeam(uid, params.id);
  }

  @Get("/creator/team/invitations")
  @Header("Cache-Control", "no-store, max-age=0")
  async listWorkTeamInvitations(
    @Query(new ZodValidationPipe(CreatorTeamListQueryDto)) query: CreatorTeamListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.listWorkTeamInvitations(uid, query.limit);
  }

  @Get("/creator/team/works")
  @Header("Cache-Control", "no-store, max-age=0")
  async listSharedWorks(
    @Query(new ZodValidationPipe(CreatorSharedWorksListQueryDto))
    query: CreatorSharedWorksListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.listSharedWorks(uid, query.limit, query.cursor);
  }

  @Get("/creator/works/:id/team/document")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getSharedWorkDocument(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.getSharedWorkDocument(uid, params.id);
  }

  @Get("/creator/works/:id/team/document/meta")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getSharedWorkDocumentMeta(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.getSharedWorkDocumentMeta(uid, params.id);
  }

  @Patch("/creator/works/:id/team/document")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async saveSharedWorkDocument(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Body(new ZodValidationPipe(UpdateCreatorSharedDocumentDto))
    body: UpdateCreatorSharedDocumentDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.saveSharedWorkDocument(uid, params.id, body);
  }

  @Get("/creator/works/:id/team/activity")
  @Header("Cache-Control", "no-store, max-age=0")
  async getWorkTeamActivity(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Query(new ZodValidationPipe(CreatorTeamListQueryDto)) query: CreatorTeamListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.getWorkTeamActivity(uid, params.id, query.limit);
  }

  @Post("/creator/works/:id/team")
  async inviteWorkTeamMember(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Body(new ZodValidationPipe(InviteCreatorTeamMemberDto)) body: InviteCreatorTeamMemberDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.inviteWorkTeamMember(uid, params.id, body.userId, body.role);
  }

  @Patch("/creator/works/:id/team/members/:userId")
  async updateWorkTeamMemberRole(
    @Param(new ZodValidationPipe(CreatorTeamMemberParamsDto))
    params: CreatorTeamMemberParamsDto,
    @Body(new ZodValidationPipe(UpdateCreatorTeamMemberDto))
    body: UpdateCreatorTeamMemberDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.updateWorkTeamMemberRole(
      uid,
      params.id,
      params.userId,
      body.role
    );
  }

  @Delete("/creator/works/:id/team/members/:userId")
  async removeWorkTeamMember(
    @Param(new ZodValidationPipe(CreatorTeamMemberParamsDto))
    params: CreatorTeamMemberParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.removeWorkTeamMember(uid, params.id, params.userId);
  }

  @Post("/creator/works/:id/team/invitations/respond")
  async respondToWorkTeamInvitation(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto)) params: CreatorTeamWorkParamsDto,
    @Body(new ZodValidationPipe(RespondCreatorTeamInvitationDto))
    body: RespondCreatorTeamInvitationDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.respondToWorkTeamInvitation(
      uid,
      params.id,
      body.action,
      body.invitationId
    );
  }

  @Delete("/creator/works/:id")
  async deleteWork(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    const admin = await isAdminUser(uid);
    return this.creatorService.deleteWork(uid, id, admin);
  }

  @Post("/creator/works/:id/like")
  async toggleLike(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.toggleLike(uid, id);
  }


  @Post("/creator/works/:id/bookmark")
  async toggleBookmark(
    @Param(new ZodValidationPipe(CreatorWorkParamsDto)) params: CreatorWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.toggleBookmark(uid, params.id);
  }

  @Get("/creator/works/:id/releases")
  @Header("Cache-Control", "no-store, max-age=0")
  async listWorkReleases(
    @Param(new ZodValidationPipe(CreatorWorkParamsDto)) params: CreatorWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.creatorService.listWorkReleases(params.id, userId || undefined);
  }

  @Post("/creator/works/:id/releases")
  async createWorkRelease(
    @Param(new ZodValidationPipe(CreatorWorkParamsDto)) params: CreatorWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.createWorkRelease(uid, params.id);
  }

  @Get("/creator/works/:id/external-publications")
  @Header("Cache-Control", "no-store, max-age=0")
  async listExternalPublications(
    @Param(new ZodValidationPipe(CreatorWorkParamsDto)) params: CreatorWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.creatorService.listExternalPublications(params.id, userId || undefined);
  }

  @Post("/creator/works/:id/external-publications")
  async saveExternalPublication(
    @Param(new ZodValidationPipe(CreatorWorkParamsDto)) params: CreatorWorkParamsDto,
    @Body(new ZodValidationPipe(SaveCreatorExternalPublicationDto))
    body: SaveCreatorExternalPublicationDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.saveExternalPublication(uid, params.id, body);
  }

  @Delete("/creator/works/:id/external-publications/:publicationId")
  async removeExternalPublication(
    @Param(new ZodValidationPipe(CreatorExternalPublicationParamsDto))
    params: CreatorExternalPublicationParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.removeExternalPublication(
      uid,
      params.id,
      params.publicationId
    );
  }

  @Post("/creator/works/:id/report")
  async reportWork(
    @Param(new ZodValidationPipe(CreatorWorkParamsDto)) params: CreatorWorkParamsDto,
    @Body(new ZodValidationPipe(ReportCreatorWorkDto)) body: ReportCreatorWorkDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.reportWork(uid, params.id, body);
  }

  @Get("/creator/works/:id/comments")
  @Header("Cache-Control", "no-store, max-age=0")
  async listComments(
    @Param("id") id: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.creatorService.listComments(id, userId || undefined);
  }

  @Post("/creator/works/:id/comments")
  async addComment(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string,
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.addComment(uid, id, body);
  }

  @Patch("/creator/works/:id/comments/:commentId")
  async updateComment(
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string,
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.updateComment(uid, id, commentId, body);
  }

  @Delete("/creator/works/:id/comments/:commentId")
  async deleteComment(
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Headers("x-user-id") userId?: string,
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.deleteComment(
      uid,
      id,
      commentId,
      await isAdminUser(uid),
    );
  }

  @Post("/creator/works/:id/comments/:commentId/like")
  async toggleCommentLike(
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Headers("x-user-id") userId?: string,
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.toggleCommentLike(uid, id, commentId);
  }

  // ── 공유 에셋(회원이 올려 모두가 재사용) ──────────────────────────────
  @Get("/creator/assets")
  @Header("Cache-Control", "no-store, max-age=0")
  async listSharedAssets(
    @Query(new ZodValidationPipe(CreatorAssetListQueryDto)) query: CreatorAssetListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.creatorService.listSharedAssets(query, userId || undefined);
  }

  @Get("/creator/assets/catalog")
  @Header("Cache-Control", "no-store, max-age=0")
  async listSharedAssetCatalog(
    @Query(new ZodValidationPipe(CreatorAssetListQueryDto)) query: CreatorAssetListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.creatorService.listSharedAssetCatalog(query, userId || undefined);
  }

  @Get("/creator/assets/:id/content")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getSharedAssetContent(
    @Param(new ZodValidationPipe(CreatorAssetParamsDto)) params: CreatorAssetParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const viewerId = userId || undefined;
    const reviewerAccess = viewerId ? await isAdminUser(viewerId) : false;
    return this.creatorService.getSharedAssetContent(params.id, viewerId, reviewerAccess);
  }

  @Get("/creator/assets/moderation")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async listAssetModerationQueue(
    @Query(new ZodValidationPipe(CreatorAssetModerationQueryDto)) query: CreatorAssetModerationQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    if (!(await isAdminUser(uid))) throw new ForbiddenException("관리자만 에셋 신고를 검수할 수 있습니다.");
    return this.creatorService.listAssetModerationQueue(query);
  }

  @Post("/creator/assets")
  async publishAsset(
    @Body(new ZodValidationPipe(PublishCreatorAssetDto)) body: PublishCreatorAssetDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.publishAsset(uid, body);
  }

  @Post("/creator/assets/generate")
  async generateAsset(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.generateAsset(uid, body);
  }

  @Delete("/creator/assets/:id")
  async deleteSharedAsset(
    @Param(new ZodValidationPipe(CreatorAssetParamsDto)) params: CreatorAssetParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    const admin = await isAdminUser(uid);
    return this.creatorService.deleteSharedAsset(uid, params.id, admin);
  }

  @Post("/creator/assets/:id/report")
  async reportSharedAsset(
    @Param(new ZodValidationPipe(CreatorAssetParamsDto)) params: CreatorAssetParamsDto,
    @Body(new ZodValidationPipe(ReportCreatorAssetDto)) body: ReportCreatorAssetDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.reportSharedAsset(uid, params.id, body);
  }

  @Patch("/creator/assets/:id/moderation")
  async moderateSharedAsset(
    @Param(new ZodValidationPipe(CreatorAssetParamsDto)) params: CreatorAssetParamsDto,
    @Body(new ZodValidationPipe(ModerateCreatorAssetDto)) body: ModerateCreatorAssetDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    if (!(await isAdminUser(uid))) throw new ForbiddenException("관리자만 에셋 신고를 검수할 수 있습니다.");
    return this.creatorService.moderateSharedAsset(uid, params.id, body);
  }

  @Post("/creator/assets/:id/use")
  async useSharedAsset(
    @Param(new ZodValidationPipe(CreatorAssetParamsDto)) params: CreatorAssetParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.useSharedAsset(uid, params.id);
  }

  // ── 연재 시리즈(코미코 베스트도전 스타일) ─────────────────────────────
  @Get("/creator/series")
  @Header("Cache-Control", "no-store, max-age=0")
  async listSeries(
    @Query() query: { userId?: string | null; sort?: string | null },
    @Headers("x-user-id") userId?: string
  ) {
    return this.creatorService.listSeries(query, userId || undefined);
  }

  @Post("/creator/series")
  async createSeries(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.createSeries(uid, body);
  }

  @Get("/creator/series/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  async getSeries(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    return this.creatorService.getSeries(id, userId || undefined);
  }

  @Patch("/creator/series/:id")
  async updateSeries(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.updateSeries(uid, id, body);
  }

  @Delete("/creator/series/:id")
  async deleteSeries(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    const admin = await isAdminUser(uid);
    return this.creatorService.deleteSeries(uid, id, admin);
  }

  // ── 창작 챌린지(주간 주제 이벤트) ─────────────────────────────────────
  @Get("/creator/challenges")
  @Header("Cache-Control", "no-store, max-age=0")
  async listChallenges() {
    return this.creatorService.listChallenges();
  }

  @Get("/creator/challenges/:key")
  @Header("Cache-Control", "no-store, max-age=0")
  async getChallenge(@Param("key") key: string, @Headers("x-user-id") userId?: string) {
    return this.creatorService.getChallenge(key, userId || undefined);
  }

  // ── 창작자 팔로우/공개 프로필 ─────────────────────────────────────────
  @Get("/creator/users/:id/profile")
  @Header("Cache-Control", "no-store, max-age=0")
  async getCreatorProfile(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    return this.creatorService.getCreatorProfile(id, userId || undefined);
  }

  @Post("/creator/users/:id/follow")
  async toggleFollow(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.toggleFollow(uid, id);
  }

  // 팔로잉 피드 — 로그인 필요(팔로우한 창작자의 최신 작품).
  @Get("/creator/feed/following")
  @Header("Cache-Control", "no-store, max-age=0")
  async listFollowingFeed(@Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.listFollowingFeed(uid);
  }
}

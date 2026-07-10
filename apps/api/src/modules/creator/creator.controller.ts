import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import {
  CreateCreatorWorkDto,
  CreatorWorkRevisionListParamsDto,
  CreatorWorkRevisionListQueryDto,
  CreatorWorkRevisionParamsDto,
  RestoreCreatorWorkRevisionDto,
  UpdateCreatorWorkDto,
} from "./creator.dto";
import { CreatorService } from "./creator.service";

interface ListQuery {
  titleId?: string | null;
  userId?: string | null;
  sort?: string | null;
  tag?: string | null;
  seriesId?: string | null;
  challengeId?: string | null;
}

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
  async listWorks(@Query() query: ListQuery, @Headers("x-user-id") userId?: string) {
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

  @Delete("/creator/works/:id")
  async deleteWork(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    // 관리자 판정은 추후 보강 — 현재는 작성자 전용 삭제(isAdmin=false).
    return this.creatorService.deleteWork(uid, id, false);
  }

  @Post("/creator/works/:id/like")
  async toggleLike(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.toggleLike(uid, id);
  }

  @Get("/creator/works/:id/comments")
  @Header("Cache-Control", "no-store, max-age=0")
  async listComments(@Param("id") id: string) {
    return this.creatorService.listComments(id);
  }

  @Post("/creator/works/:id/comments")
  async addComment(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.addComment(uid, id, body);
  }

  // ── 공유 에셋(회원이 올려 모두가 재사용) ──────────────────────────────
  @Get("/creator/assets")
  @Header("Cache-Control", "no-store, max-age=0")
  async listSharedAssets(
    @Query() query: { mine?: string | null; limit?: string | null; offset?: string | null },
    @Headers("x-user-id") userId?: string
  ) {
    return this.creatorService.listSharedAssets(query, userId || undefined);
  }

  @Post("/creator/assets")
  async publishAsset(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.publishAsset(uid, body);
  }

  @Post("/creator/assets/generate")
  async generateAsset(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.generateAsset(uid, body);
  }

  @Delete("/creator/assets/:id")
  async deleteSharedAsset(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.deleteSharedAsset(uid, id, false);
  }

  @Post("/creator/assets/:id/use")
  async useSharedAsset(@Param("id") id: string) {
    return this.creatorService.useSharedAsset(id);
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
    // 관리자 판정은 추후 보강 — 현재는 소유자 전용 삭제(isAdmin=false).
    return this.creatorService.deleteSeries(uid, id, false);
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

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CreatorService } from "./creator.service";

interface ListQuery {
  titleId?: string | null;
  userId?: string | null;
  sort?: string | null;
  tag?: string | null;
}

function enforceUserOrError(userId: string | null | undefined) {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller()
export class CreatorController {
  private readonly creatorService = new CreatorService();

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
  async createWork(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.createWork(uid, body);
  }

  @Patch("/creator/works/:id")
  async updateWork(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.creatorService.updateWork(uid, id, body);
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
}

import {
  Body,
  Controller,
  Inject,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { CreatorSupportService } from "./creator-support.service";

@Controller()
export class CreatorSupportController {
  constructor(@Inject(CreatorSupportService) private readonly service: CreatorSupportService) {}

  @Get("creator-support/projects")
  @Header("Cache-Control", "no-store, max-age=0")
  async listProjects(@Query("category") category?: string) {
    return this.service.listPublicProjects(category);
  }

  @Get("creator-support/projects/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  async getProject(@Param("id") id: string) {
    return this.service.getPublicProject(id);
  }

  @Get("creator-support/me/application")
  @Header("Cache-Control", "no-store, max-age=0")
  async getMyApplication(@Headers("x-user-id") userId?: string) {
    return this.service.getMyApplication(userId ?? "");
  }
  @Post("creator-support/applications")
  @Header("Cache-Control", "no-store, max-age=0")
  async submitApplication(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.submitApplication(userId ?? "", body);
  }

  @Post("creator-support/projects/:id/offers")
  @Header("Cache-Control", "no-store, max-age=0")
  async submitOffer(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.submitOffer(userId ?? "", id, body);
  }

  @Get("creator-support/me/offers")
  @Header("Cache-Control", "no-store, max-age=0")
  async listMyOffers(@Headers("x-user-id") userId?: string) {
    return this.service.listMyOffers(userId ?? "");
  }

  @Get("admin/creator-support/applications")
  @Header("Cache-Control", "no-store, max-age=0")
  async listForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Query("status") status?: string,
  ) {
    return this.service.listForAdmin(userId ?? "", status);
  }
  @Post("admin/creator-support/applications/:id/review")
  @Header("Cache-Control", "no-store, max-age=0")
  async reviewForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.reviewForAdmin(userId ?? "", id, body);
  }
}

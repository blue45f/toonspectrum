import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Query,
} from "@nestjs/common";

import { AdminTrafficService } from "./admin-traffic.service";

function requireUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller("admin/traffic")
export class AdminTrafficController {
  constructor(
    @Inject(AdminTrafficService)
    private readonly adminTrafficService: AdminTrafficService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getOverview(
    @Headers("x-user-id") userId: string | undefined,
    @Query("days") days: string | undefined,
  ) {
    return this.adminTrafficService.getOverview(requireUserId(userId), days);
  }

  @Get("pulse")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getPulse(@Headers("x-user-id") userId: string | undefined) {
    return this.adminTrafficService.getPulse(requireUserId(userId));
  }
}

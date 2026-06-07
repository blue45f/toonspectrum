import {
  Body,
  ForbiddenException,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Headers,
  Controller,
} from "@nestjs/common";
import { AdminService } from "./admin.service";

interface AppConfigPayload {
  monetizationEnabled?: unknown;
}

interface PlanPayload {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  description?: unknown;
  intervalDays?: unknown;
  currency?: unknown;
  priceCents?: unknown;
  perks?: unknown;
  isActive?: unknown;
}

interface CampaignQuery {
  creatorId?: string | null;
  isActive?: string | null;
  title?: string | null;
}

function enforceUserOrError(userId?: string) {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

function normalizeDays(value?: string) {
  const parsed = Number(value ?? 30);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 30;
}

type RevenueStatus = "pending" | "approved" | "paid" | "rejected" | "revoked";

interface RevenueQuery {
  days?: string;
  status?: RevenueStatus | "all";
}

interface RevenueStatusPayload {
  status?: unknown;
  note?: unknown;
}

interface RevenueSettlePayload {
  settledAt?: unknown;
  note?: unknown;
}

@Controller("admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("me")
  @Header("Cache-Control", "no-store, max-age=0")
  async getMe(@Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getAdminMe(uid);
  }

  @Get("config")
  @Header("Cache-Control", "no-store, max-age=0")
  async getConfig(@Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getConfig(uid);
  }

  @Post("config")
  async setConfig(@Headers("x-user-id") userId: string | undefined, @Body() body: AppConfigPayload) {
    const uid = enforceUserOrError(userId);
    return this.adminService.setConfig(uid, body);
  }

  // 게시물 노출 on/off (type: review | fan_post | feedback_post)
  @Post("content/:type/:id/visibility")
  async setContentVisibility(
    @Headers("x-user-id") userId: string | undefined,
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() body: { hidden?: unknown }
  ) {
    const uid = enforceUserOrError(userId);
    return this.adminService.setContentVisibility(uid, type, id, !!body.hidden);
  }

  @Get("dashboard")
  @Header("Cache-Control", "no-store, max-age=0")
  async getDashboard(
    @Headers("x-user-id") userId?: string,
    @Query("days") daysValue?: string,
  ) {
    const uid = enforceUserOrError(userId);
    const days = normalizeDays(daysValue);
    return this.adminService.getDashboard(uid, days);
  }

  @Get("plans")
  @Header("Cache-Control", "no-store, max-age=0")
  async getPlans(@Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getPlans(uid);
  }

  @Post("plans")
  async upsertPlan(@Headers("x-user-id") userId: string | undefined, @Body() body: PlanPayload) {
    const uid = enforceUserOrError(userId);
    return this.adminService.upsertPlan(uid, body);
  }

  @Get("revenue")
  @Header("Cache-Control", "no-store, max-age=0")
  async getRevenue(@Headers("x-user-id") userId: string | undefined, @Query() query: RevenueQuery) {
    const uid = enforceUserOrError(userId);
    const days = normalizeDays(query.days);
    return this.adminService.getRevenue(uid, days, { status: query.status });
  }

  @Post("revenue/:id/status")
  async setRevenueStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string | undefined,
    @Body() body: RevenueStatusPayload,
  ) {
    const uid = enforceUserOrError(userId);
    const eventId = id ?? "";
    return this.adminService.setRevenueStatus(uid, eventId, body);
  }

  @Post("revenue/:id/settle")
  async settleRevenue(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string | undefined,
    @Body() body: RevenueSettlePayload,
  ) {
    const uid = enforceUserOrError(userId);
    const eventId = id ?? "";
    return this.adminService.settleRevenueEvent(uid, eventId, body);
  }

  @Get("campaigns")
  @Header("Cache-Control", "no-store, max-age=0")
  async getCampaigns(@Headers("x-user-id") userId: string | undefined, @Query() query: CampaignQuery) {
    const uid = enforceUserOrError(userId);
    return this.adminService.getCampaigns(uid, query);
  }

  @Post("campaigns")
  async upsertCampaign(@Headers("x-user-id") userId: string | undefined, @Body() body: CampaignPayload) {
    const uid = enforceUserOrError(userId);
    return this.adminService.upsertCampaign(uid, body);
  }

  @Delete("campaigns/:id")
  async deleteCampaign(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) {
    const uid = enforceUserOrError(userId);
    return this.adminService.deleteCampaign(uid, id);
  }
}

interface CampaignPayload {
  id?: unknown;
  creatorId?: unknown;
  titleId?: unknown;
  planId?: unknown;
  title?: unknown;
  description?: unknown;
  targetAmountCents?: unknown;
  raisedAmountCents?: unknown;
  isActive?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
}

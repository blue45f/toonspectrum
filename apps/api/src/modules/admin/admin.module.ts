import { Module } from "@nestjs/common";

import { AdminCampaignsService } from "./admin-campaigns.service";
import { AdminMembersService } from "./admin-members.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminRevenueService } from "./admin-revenue.service";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminCampaignsService,
    AdminMembersService,
    AdminMetricsService,
    AdminModerationService,
    AdminRevenueService,
  ],
})
export class AdminModule {}

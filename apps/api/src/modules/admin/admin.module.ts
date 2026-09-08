import { Module } from "@nestjs/common";

import { AdminAnnouncementsService } from "./admin-announcements.service";
import { AdminCampaignsService } from "./admin-campaigns.service";
import { AdminMembersService } from "./admin-members.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminRevenueService } from "./admin-revenue.service";
import { AdminTrafficController } from "./admin-traffic.controller";
import { AdminTrafficService } from "./admin-traffic.service";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  controllers: [AdminController, AdminTrafficController],
  providers: [
    AdminService,
    AdminAnnouncementsService,
    AdminCampaignsService,
    AdminMembersService,
    AdminMetricsService,
    AdminModerationService,
    AdminRevenueService,
    AdminTrafficService,
  ],
})
export class AdminModule {}

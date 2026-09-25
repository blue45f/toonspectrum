import { Module } from "@nestjs/common";

import { TrafficAnalyticsController } from "./traffic-analytics.controller";
import { TrafficAnalyticsService } from "./traffic-analytics.service";
import { trafficAnalyticsRepositoryProvider } from "./traffic-analytics-repository.provider";
import { TRAFFIC_ANALYTICS_REPOSITORY } from "./traffic-analytics.repository";

@Module({
  controllers: [TrafficAnalyticsController],
  providers: [trafficAnalyticsRepositoryProvider, TrafficAnalyticsService],
  exports: [TRAFFIC_ANALYTICS_REPOSITORY],
})
export class TrafficAnalyticsModule {}

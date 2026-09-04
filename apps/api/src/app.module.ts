import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { BackendCapabilitiesModule } from "./infrastructure/backend-capabilities/backend-capabilities.module";
import {
  SAFE_HTTP_LOG_REDACT_PATHS,
  SAFE_HTTP_LOG_SERIALIZERS,
} from "./logging/http-log-serializers";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CommunityModule } from "./modules/community/community.module";
import { CreatorModule } from "./modules/creator/creator.module";
import { CreatorMarketplaceModule } from "./modules/creator-marketplace/creator-marketplace.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { FortuneModule } from "./modules/fortune/fortune.module";
import { HealthModule } from "./modules/health/health.module";
import { LegalModule } from "./modules/legal/legal.module";
import { MeModule } from "./modules/me/me.module";
import { StudioAiModule } from "./modules/studio-ai/studio-ai.module";
import { createStudioRealtimeTicketDynamicModule } from "./modules/studio-realtime-ticket/studio-realtime-ticket.integration";
import { TrafficAnalyticsModule } from "./modules/traffic-analytics/traffic-analytics.module";

const studioRealtimeTicketModule =
  createStudioRealtimeTicketDynamicModule(process.env);

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // pino-pretty 는 개발에서만 — 프로덕션은 JSON 라인(파싱/수집 친화).
        transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
        // 운영 프록시가 주입하는 OIDC/서명 헤더까지 전체를 제외한다.
        // wrapSerializers=false로 raw req/res를 허용 목록 직렬화기에 바로 전달한다.
        wrapSerializers: false,
        serializers: SAFE_HTTP_LOG_SERIALIZERS,
        // 직렬화 경계가 변경되더라도 헤더 bag 자체는 2차로 차단한다.
        redact: [...SAFE_HTTP_LOG_REDACT_PATHS],
      },
    }),
    BackendCapabilitiesModule,
    AuthModule,
    MeModule,
    CommunityModule,
    CatalogModule,
    AdminModule,
    TrafficAnalyticsModule,
    FeedbackModule,
    CreatorMarketplaceModule,
    CreatorModule,
    ...(studioRealtimeTicketModule
      ? [studioRealtimeTicketModule]
      : []),
    HealthModule,
    LegalModule,
    FortuneModule,
    StudioAiModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}

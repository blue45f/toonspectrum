import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CommunityModule } from "./modules/community/community.module";
import { CreatorModule } from "./modules/creator/creator.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { LegalModule } from "./modules/legal/legal.module";
import { MeModule } from "./modules/me/me.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // pino-pretty 는 개발에서만 — 프로덕션은 JSON 라인(파싱/수집 친화).
        transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
        // 인증/세션 헤더는 로그에서 가린다(자격증명 유출 방지).
        redact: ["req.headers.authorization", "req.headers.cookie"],
      },
    }),
    AuthModule,
    MeModule,
    CommunityModule,
    CatalogModule,
    AdminModule,
    FeedbackModule,
    CreatorModule,
    LegalModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}

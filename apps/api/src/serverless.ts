import "./load-env"; // 첫 import — lib/db가 DATABASE_URL 읽기 전 주입(서버리스에선 .env 없고 플랫폼 env 사용)
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";

import { AppModule } from "./app.module";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { sessionAuth } from "./session-middleware";

import type { Express } from "express";

// Vercel 서버리스용 — 콜드 컨테이너당 1회 부팅 후 캐시(웜 인스턴스 재사용).
// 기본 platform-express 어댑터로 생성 → init() → 내부 Express 인스턴스를 핸들러로 반환.
// (수동 ExpressAdapter 구성은 NestJS11 registerParserMiddleware 에서 깨진다.)
let appPromise: Promise<Express> | null = null;

async function create(): Promise<Express> {
  // 기본 본문 파서(100kb) 대신 직접 등록(main.ts와 동일) — 스튜디오/커뮤니티 첨부가 data-URL
  // 이미지를 JSON으로 보내므로 서버리스에서도 한도를 키운다(미러 누락 시 프로덕션만 413).
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"], bodyParser: false });
  app.use(json({ limit: "16mb" }));
  app.use(urlencoded({ extended: true, limit: "16mb" }));
  app.use(sessionAuth); // x-user-id 서명 토큰 검증 → 실제 userId로 치환(미인증이면 제거)
  app.setGlobalPrefix("api");
  // 표준 Zod 검증 파이프(main.ts와 동일).
  app.useGlobalPipes(new ZodValidationPipe());
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

export function getServerlessApp(): Promise<Express> {
  if (!appPromise) appPromise = create();
  return appPromise;
}

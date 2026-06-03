import "./load-env"; // 첫 import — lib/db가 DATABASE_URL 읽기 전 주입(서버리스에선 .env 없고 플랫폼 env 사용)
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { Express } from "express";
import { AppModule } from "./app.module";

// Vercel 서버리스용 — 콜드 컨테이너당 1회 부팅 후 캐시(웜 인스턴스 재사용).
// 기본 platform-express 어댑터로 생성 → init() → 내부 Express 인스턴스를 핸들러로 반환.
// (수동 ExpressAdapter 구성은 NestJS11 registerParserMiddleware 에서 깨진다.)
let appPromise: Promise<Express> | null = null;

async function create(): Promise<Express> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, stopAtFirstError: true })
  );
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

export function getServerlessApp(): Promise<Express> {
  if (!appPromise) appPromise = create();
  return appPromise;
}

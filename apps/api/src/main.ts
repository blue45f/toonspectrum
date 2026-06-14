import "./load-env"; // 반드시 첫 import — lib/db가 DATABASE_URL을 읽기 전에 .env.local 주입
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";

import { AppModule } from "./app.module";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { validateEnv } from "./config/env";
import { sessionAuth } from "./session-middleware";

async function bootstrap() {
  // env 검증(NON-FATAL) — load-env 이후라 .env.local 주입이 반영된다. 실패해도 부팅은 계속.
  validateEnv();
  // 기본 본문 파서(100kb) 대신 직접 등록 — 창작 스튜디오가 data-URL 이미지(페이지/문서)를 전송하므로 한도를 키운다.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: "16mb" }));
  app.use(urlencoded({ extended: true, limit: "16mb" }));
  app.use(sessionAuth); // x-user-id 서명 토큰 검증 → 실제 userId로 치환(미인증이면 제거)
  app.setGlobalPrefix("api");
  // 표준 Zod 검증 파이프. createZodDto DTO 만 검증하고 그 외(@Body() body: unknown)는 통과.
  app.useGlobalPipes(new ZodValidationPipe());

  // PaaS(Render/Railway/Fly 등)는 PORT를 주입한다. 로컬은 NEST_API_PORT, 둘 다 없으면 4001.
  const port = Number(process.env.PORT ?? process.env.NEST_API_PORT ?? "4001");
  await app.listen(port, "0.0.0.0"); // 외부 트래픽 수신을 위해 모든 인터페이스에 바인딩
  console.log(`Nest backend started on port ${port}`);
}

void bootstrap();

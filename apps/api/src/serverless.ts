import "./load-env"; // 첫 import — apps/api/src/db가 DATABASE_URL 읽기 전 주입(서버리스에선 .env 없고 플랫폼 env 사용)
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { configureApiBodyParserBoundary } from "./config/api-body-parser-boundary";
import { rewriteQueryPathToUrl } from "./config/api-path-rewrite";
import { configureCors } from "./config/cors";
import { validateEnv } from "./config/env";
import {
  createApiRuntimeRoleGuard,
  resolveApiRuntimeRole,
} from "./config/runtime-role";
import { createApiSecurityHeadersMiddleware } from "./config/security-headers";
import { createCsrfProtectionMiddleware } from "./csrf-middleware";
import { BACKEND_CAPABILITY_GATEWAY_PATH } from "./infrastructure/backend-capabilities/backend-capability-gateway-contract";
import { sessionAuth } from "./session-middleware";

// Vercel 서버리스용 — 콜드 컨테이너당 1회 부팅 후 캐시(웜 인스턴스 재사용).
// 기본 platform-express 어댑터로 생성 → init() → 내부 Express 인스턴스를 핸들러로 반환.
// (수동 ExpressAdapter 구성은 NestJS11 registerParserMiddleware 에서 깨진다.)
let appPromise: Promise<Express> | null = null;

type ServerlessRuntimeEnvironment = Partial<
  Record<"API_RUNTIME_ROLE", string | undefined>
>;

/**
 * Vercel cannot own the long-lived Socket.IO lifecycle. A role typo or an accidentally shared
 * deployment environment must reject the cold start instead of publishing a misleading,
 * health-only serverless surface.
 */
export function assertVercelServerlessRuntimeRole(
  environment: ServerlessRuntimeEnvironment = process.env,
): void {
  if (resolveApiRuntimeRole(environment) !== "full") {
    throw new Error(
      "Vercel serverless bootstrap requires API_RUNTIME_ROLE=full",
    );
  }
}

async function create(): Promise<Express> {
  assertVercelServerlessRuntimeRole(process.env);
  // env 검증(NON-FATAL) — 콜드 부팅당 1회. 실패해도 throw 하지 않고 경고만(main.ts와 동일).
  validateEnv();
  // 기본 본문 파서(100kb) 대신 직접 등록(main.ts와 동일) — 스튜디오/커뮤니티 첨부가 data-URL
  // 이미지를 JSON으로 보내므로 서버리스에서도 한도를 키운다(미러 누락 시 프로덕션만 413).
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger)); // 전역 로거를 nestjs-pino 로 교체(main.ts와 동일)
  app.use(createApiSecurityHeadersMiddleware(process.env));
  configureCors(app); // Vercel OPTIONS를 Nest가 204로 끝내고 Origin별 허용 헤더를 반환
  app.use((req: Request, _res: Response, next: NextFunction) => {
    rewriteQueryPathToUrl(req);
    next();
  });
  app.use(createApiRuntimeRoleGuard(process.env));
  app.use(sessionAuth); // x-user-id 서명 토큰 검증 → 실제 userId로 치환(미인증이면 제거)
  app.use(createCsrfProtectionMiddleware(process.env));
  configureApiBodyParserBoundary(app, null);
  app.setGlobalPrefix("api", {
    exclude: [{ path: BACKEND_CAPABILITY_GATEWAY_PATH, method: RequestMethod.ALL }],
  });
  // 표준 Zod 검증 파이프(main.ts와 동일).
  app.useGlobalPipes(new ZodValidationPipe());
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

export function getServerlessApp(): Promise<Express> {
  if (!appPromise) appPromise = create();
  return appPromise;
}

export { rewriteQueryPathToUrl };

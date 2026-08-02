import "./load-env"; // 반드시 첫 import — lib/db가 DATABASE_URL을 읽기 전에 .env.local 주입
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Logger } from "nestjs-pino";

import { CapabilityWorkerAppModule } from "./capability-worker-app.module";
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
import { resolveBackendCapabilityPolicy } from "./infrastructure/backend-capabilities/backend-capability-policy";
import { BACKEND_CAPABILITY_WORKER_HEALTH_PATH } from "./infrastructure/backend-capabilities/backend-capability-worker-health.controller";
import {
  createStudioLivePostgresIoAdapter,
  type StudioLivePostgresIoAdapter,
} from "./realtime/studio-postgres-io.adapter";
import { sessionAuth } from "./session-middleware";

async function bootstrap() {
  // env 검증(NON-FATAL) — load-env 이후라 .env.local 주입이 반영된다. 실패해도 부팅은 계속.
  validateEnv();
  const runtimeRole = resolveApiRuntimeRole(process.env);
  const capabilityWorkerPolicy = runtimeRole === "capability-worker"
    ? resolveBackendCapabilityPolicy(process.env)
    : null;
  // 기본 본문 파서(100kb) 대신 직접 등록 — 창작 스튜디오가 data-URL 이미지(페이지/문서)를 전송하므로 한도를 키운다.
  // bufferLogs: nestjs-pino 로거가 준비되기 전 로그를 버퍼링했다가 useLogger 이후 flush 한다.
  const rootModule =
    runtimeRole === "capability-worker"
      ? CapabilityWorkerAppModule
      : (await import("./app.module")).AppModule;
  const app = await NestFactory.create(rootModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(Logger)); // 전역 로거를 nestjs-pino 로 교체(예외 필터의 5xx 로깅도 이걸 사용)
  app.enableShutdownHooks();
  app.use(createApiSecurityHeadersMiddleware(process.env));
  if (runtimeRole !== "capability-worker") {
    configureCors(app); // 구성된 웹 Origin의 preflight를 로컬·서버리스에서 동일하게 처리
  }
  // Vercel/compatibility callers may tunnel the canonical API path through `?path=`. Rewrite it
  // before every role, authentication and CSRF boundary so those guards authorize the route that
  // Nest will actually dispatch, never the harmless-looking pre-rewrite path.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    rewriteQueryPathToUrl(req);
    next();
  });
  app.use(createApiRuntimeRoleGuard(process.env));
  if (runtimeRole === "capability-worker") {
    configureApiBodyParserBoundary(app, capabilityWorkerPolicy);
  } else {
    app.use(sessionAuth); // x-user-id 서명 토큰 검증 → 실제 userId로 치환(미인증이면 제거)
    app.use(createCsrfProtectionMiddleware(process.env));
    configureApiBodyParserBoundary(app, null);
  }
  app.setGlobalPrefix("api", {
    exclude: [
      { path: BACKEND_CAPABILITY_GATEWAY_PATH, method: RequestMethod.ALL },
      {
        path: BACKEND_CAPABILITY_WORKER_HEALTH_PATH,
        method: RequestMethod.GET,
      },
    ],
  });
  // 표준 Zod 검증 파이프. createZodDto DTO 만 검증하고 그 외(@Body() body: unknown)는 통과.
  app.useGlobalPipes(new ZodValidationPipe());

  let studioLiveAdapter: StudioLivePostgresIoAdapter | null = null;
  try {
    // 명시적으로 postgres 모드를 선택한 장기 실행 API에서만 클러스터 adapter를 장착한다.
    // Vercel serverless 경로(serverless.ts)는 WebSocket 수명주기가 다르므로 이 factory를 호출하지 않는다.
    studioLiveAdapter =
      runtimeRole === "capability-worker"
        ? null
        : await createStudioLivePostgresIoAdapter(app, process.env, {
            logger: app.get(Logger),
          });
    if (studioLiveAdapter) app.useWebSocketAdapter(studioLiveAdapter);

    // PaaS(Render/Railway/Fly 등)는 PORT를 주입한다. 로컬은 NEST_API_PORT, 둘 다 없으면 4001.
    const port = Number(process.env.PORT ?? process.env.NEST_API_PORT ?? "4001");
    await app.listen(port, "0.0.0.0"); // 외부 트래픽 수신을 위해 모든 인터페이스에 바인딩
    console.log(`Nest backend started on port ${port}`);
  } catch (error) {
    // app.close()가 이미 adapter.close()를 호출했더라도 disposePool()은 멱등이다. listen 이전
    // 실패에서도 preflight용 전용 풀을 남기지 않는다.
    try {
      await app.close();
    } finally {
      await studioLiveAdapter?.disposePool();
    }
    throw error;
  }
}

void bootstrap();

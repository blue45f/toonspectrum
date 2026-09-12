import "../load-env";
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { configureApiBodyParserBoundary } from "../config/api-body-parser-boundary";
import { rewriteQueryPathToUrl } from "../config/api-path-rewrite";
import { createCatalogInitializationMiddleware } from "../config/catalog-initialization";
import { configureCors } from "../config/cors";
import { validateEnv } from "../config/env";
import { createApiRuntimeRoleGuard } from "../config/runtime-role";
import { createApiSecurityHeadersMiddleware } from "../config/security-headers";
import { createCsrfProtectionMiddleware } from "../csrf-middleware";
import { BACKEND_CAPABILITY_GATEWAY_PATH } from "../infrastructure/backend-capabilities/backend-capability-gateway-contract";
import { sessionAuth } from "../session-middleware";

import type { INestApplication, Type } from "@nestjs/common";
import type { Express, NextFunction, Request, Response } from "express";

type BootstrapOptions = {
  catalogInitializer?: (app: INestApplication) => () => Promise<void>;
};

/** One middleware order for ALL serverless partitions. No partition can skip auth or CSRF. */
export async function createServerlessApplication(
  rootModule: Type<unknown>,
  options: BootstrapOptions = {},
): Promise<Express> {
  validateEnv();
  const app = await NestFactory.create(rootModule, {
    bufferLogs: true,
    bodyParser: false,
    abortOnError: false,
  });
  try {
    const initializeCatalog = options.catalogInitializer?.(app);
    app.useLogger(app.get(Logger));
    app.use(createApiSecurityHeadersMiddleware(process.env));
    configureCors(app);
    app.use((req: Request, _res: Response, next: NextFunction) => {
      rewriteQueryPathToUrl(req);
      next();
    });
    app.use(createApiRuntimeRoleGuard(process.env));
    app.use(sessionAuth);
    app.use(createCsrfProtectionMiddleware(process.env));
    configureApiBodyParserBoundary(app, null);
    if (initializeCatalog) {
      app.use(createCatalogInitializationMiddleware(initializeCatalog));
    }
    app.setGlobalPrefix("api", {
      exclude: [{ path: BACKEND_CAPABILITY_GATEWAY_PATH, method: RequestMethod.ALL }],
    });
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    return app.getHttpAdapter().getInstance() as Express;
  } catch (error) {
    // Do not retain a half-initialized Nest app/timers when a cold boot fails.
    await app.close().catch(() => undefined);
    throw error;
  }
}

import "./load-env";
import "reflect-metadata";
import { Logger as BootstrapLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { configureCors } from "./config/cors";
import { createApiRuntimeRoleGuard } from "./config/runtime-role";
import { createApiSecurityHeadersMiddleware } from "./config/security-headers";
import {
  createStudioLiveNativeServer,
  type StudioLiveNativeRuntime,
} from "./realtime/studio-live-native-server";
import {
  createStudioLivePostgresIoAdapter,
  resolveStudioLiveClusterAdapterConfig,
  type StudioLivePostgresIoAdapter,
} from "./realtime/studio-postgres-io.adapter";

type Environment = Partial<Record<string, string | undefined>>;

export function assertStudioLiveVercelConfiguration(environment: Environment): void {
  if (environment.STUDIO_LIVE_VERCEL_ENABLED !== "true") {
    throw new Error("Studio live native Vercel entry requires STUDIO_LIVE_VERCEL_ENABLED=true");
  }
  if (resolveStudioLiveClusterAdapterConfig(environment).mode !== "postgres") {
    throw new Error("Studio live native Vercel entry requires the PostgreSQL cluster adapter");
  }
}

export async function initializeStudioLiveVercelRuntime(
  environment: Environment = process.env,
): Promise<StudioLiveNativeRuntime> {
  assertStudioLiveVercelConfiguration(environment);
  // Import the canonical gateway/auth/ACL/CRDT/lock graph only after explicit opt-in validation.
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
    abortOnError: false,
  });
  let adapter: StudioLivePostgresIoAdapter | null = null;
  let closing: Promise<void> | null = null;
  function close(): Promise<void> {
    closing ??= (async () => {
      try {
        await app.close();
      } finally {
        await adapter?.disposePool();
      }
    })();
    return closing;
  }
  try {
    app.useLogger(app.get(Logger));
    app.use(createApiSecurityHeadersMiddleware(environment));
    configureCors(app);
    // This dedicated function exposes only Socket.IO. General authenticated HTTP stays in index.js.
    app.use(createApiRuntimeRoleGuard({ API_RUNTIME_ROLE: "studio-live" }));
    adapter = await createStudioLivePostgresIoAdapter(app, environment, {
      logger: app.get(Logger),
    });
    if (!adapter) throw new Error("Studio live native Vercel entry cannot use memory fanout");
    app.useWebSocketAdapter(adapter);
    await app.init();
    return { server: app.getHttpServer(), close };
  } catch (error) {
    await close();
    throw error;
  }
}

export function createStudioLiveVercelServer(): StudioLiveNativeRuntime {
  const logger = new BootstrapLogger("StudioLiveVercel");
  return createStudioLiveNativeServer(
    () => initializeStudioLiveVercelRuntime(),
    // Do not expose database/session details from a failed cold start in an HTTP response or log.
    () => logger.error("Studio live native gateway initialization or shutdown failed"),
  );
}

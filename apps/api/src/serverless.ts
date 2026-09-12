import "./load-env";

import { resolveApiRuntimeRole } from "./config/runtime-role";
import { serverlessRouteGroup } from "./runtime/serverless-route-group";

import type { Express } from "express";
import type { ServerlessRouteGroup } from "./runtime/serverless-route-group";
import type { LazyServerlessCatalogService } from "./modules/catalog/lazy-serverless-catalog.service";

type ServerlessRuntimeEnvironment = Partial<Record<"API_RUNTIME_ROLE", string | undefined>>;

export function assertVercelServerlessRuntimeRole(
  environment: ServerlessRuntimeEnvironment = process.env,
): void {
  if (resolveApiRuntimeRole(environment) !== "full") {
    throw new Error("Vercel serverless bootstrap requires API_RUNTIME_ROLE=full");
  }
}

const applications = new Map<ServerlessRouteGroup, Promise<Express>>();

async function create(group: ServerlessRouteGroup): Promise<Express> {
  assertVercelServerlessRuntimeRole();
  const { createServerlessApplication } = await import("./runtime/serverless-bootstrap");
  if (group === "auth") {
    const { AuthApiModule } = await import("./runtime/auth-api.module");
    return createServerlessApplication(AuthApiModule);
  }
  if (group === "studio") {
    const { StudioApiModule } = await import("./runtime/studio-api.module");
    return createServerlessApplication(StudioApiModule);
  }
  const rootModule = group === "general"
    ? (await import("./runtime/general-api.module")).GeneralApiModule
    : (await import("./app.module")).AppModule;
  const { CatalogService } = await import("./modules/catalog/catalog.service");
  return createServerlessApplication(rootModule, {
    catalogInitializer: (app) => {
      const catalog = app.get<LazyServerlessCatalogService>(CatalogService);
      catalog.deferInitializationUntilRequest();
      return () => catalog.ensureInitialized();
    },
  });
}

/** The default argument preserves existing full-API callers and native smoke tests. */
export function getServerlessApp(pathname = "/"): Promise<Express> {
  const group = serverlessRouteGroup(pathname, process.env.API_SERVERLESS_MODULES !== "0");
  let pending = applications.get(group);
  if (!pending) {
    const job = create(group).catch((error: unknown) => {
      if (applications.get(group) === job) applications.delete(group);
      throw error;
    });
    applications.set(group, job);
    pending = job;
  }
  return pending;
}

export { rewriteQueryPathToUrl } from "./config/api-path-rewrite";

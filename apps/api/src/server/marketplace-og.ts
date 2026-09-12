import "../load-env";
import "reflect-metadata";

import type { CreatorMarketplaceService } from "../modules/creator-marketplace/creator-marketplace.service";

const RESOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/iu;
let servicePromise: Promise<CreatorMarketplaceService> | null = null;

async function loadMarketplaceService(): Promise<CreatorMarketplaceService> {
  const [{ NestFactory }, { CreatorMarketplaceModule }, { CreatorMarketplaceService: Service }] = await Promise.all([
    import("@nestjs/core"),
    import("../modules/creator-marketplace/creator-marketplace.module"),
    import("../modules/creator-marketplace/creator-marketplace.service"),
  ]);
  // This is a DI context, not an HTTP server. No self-fetch or full API/catalog bootstrap.
  const context = await NestFactory.createApplicationContext(CreatorMarketplaceModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    return context.get(Service);
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

export async function readMarketplaceOgResource(id: string) {
  if (!RESOURCE_ID.test(id)) return null;
  if (!servicePromise) {
    servicePromise = loadMarketplaceService().catch((error: unknown) => {
      servicePromise = null;
      throw error;
    });
  }
  // Reuse the public getById policy on EVERY request. No owner context and no data cache:
  // hidden/delisted/deleted releases must stop exposing their metadata immediately.
  const service = await servicePromise;
  return service.getById(id);
}

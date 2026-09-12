import { Injectable } from "@nestjs/common";

import { CatalogService } from "./catalog.service";

/** Preserve the CatalogService token and all existing endpoint implementations. */
@Injectable()
export class LazyServerlessCatalogService extends CatalogService {
  private initialization: Promise<void> | null = null;
  private initializationClosed = false;
  private deferInitialLoad = false;

  // Only the serverless adapter opts in, before app.init(). A native HTTP server
  // running on Vercel still keeps the ordinary eager lifecycle.
  deferInitializationUntilRequest(): void {
    this.deferInitialLoad = process.env.WEBDEX_CATALOG_FORCE_DB !== "1"
      && process.env.CATALOG_EAGER_INIT !== "1";
  }

  override async onModuleInit(): Promise<void> {
    if (!this.deferInitialLoad) await this.ensureInitialized();
  }

  ensureInitialized(): Promise<void> {
    if (this.initializationClosed) return Promise.reject(new Error("Catalog service is closed"));
    if (!this.initialization) {
      // Assign before invoking the initializer: concurrent cold requests share one job.
      this.initialization = Promise.resolve().then(() => super.onModuleInit()).catch((error: unknown) => {
        this.initialization = null;
        throw error;
      });
    }
    return this.initialization;
  }

  override onModuleDestroy(): void {
    this.initializationClosed = true;
    // The base lifecycle also prevents a late initializer from restarting its timer.
    super.onModuleDestroy();
  }
}

// apps/api/src/modules/fortune/fortune.module.ts

import { Module } from "@nestjs/common";

import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import { UpstashCoordinationModule } from "../../infrastructure/upstash-coordination/upstash-coordination.module";
import { FortuneEnrichmentController } from "./fortune-enrichment.controller";
import { FortuneEnrichmentService } from "./fortune-enrichment.service";
import { fortuneEnrichmentConfig, FORTUNE_ENRICHMENT_CONFIG, FORTUNE_ENRICHMENT_RUNTIME } from "./fortune-enrichment.provider";
import { FortuneProvenanceController } from "./fortune-provenance.controller";
import { FortuneController } from "./fortune.controller";
import { FortuneService } from "./fortune.service";

import { FORTUNE_SNAPSHOT_PORT } from "./fortune-snapshot";
import type { FortuneSnapshotPort } from "./fortune-snapshot";
import { PostgresFortuneSnapshotRepository } from "./fortune-snapshot.repository";
import { FortuneRefreshWorker } from "./fortune-refresh.worker";

const enrichmentConfig = fortuneEnrichmentConfig(process.env);
const coordination = enrichmentConfig.kasiEnabled || enrichmentConfig.specialDaysEnabled || enrichmentConfig.horoscopeEnabled
  ? UpstashCoordinationModule.fromEnvironment(process.env) : null;

@Module({
  imports: [MembershipWalletModule, ...(coordination ? [coordination] : [])],
  controllers: [FortuneController, FortuneProvenanceController, FortuneEnrichmentController],
  providers: [FortuneService, FortuneEnrichmentService,
    { provide: FORTUNE_SNAPSHOT_PORT, useFactory: async () => {
      if (!enrichmentConfig.snapshotsEnabled) return null;
      const { dbPool } = await import("../../db/index");
      return new PostgresFortuneSnapshotRepository((text, values) => {
        const query = { text, values, query_timeout: 2000 };
        return dbPool.query(query);
      });
    } },
    { provide: FortuneRefreshWorker, inject: [FortuneEnrichmentService, FORTUNE_ENRICHMENT_RUNTIME, FORTUNE_SNAPSHOT_PORT],
      useFactory: (service: FortuneEnrichmentService, runtime: { now: () => Date; fetch: typeof globalThis.fetch }, snapshots: FortuneSnapshotPort | null) => new FortuneRefreshWorker(enrichmentConfig, runtime, service, snapshots) },
    { provide: FORTUNE_ENRICHMENT_CONFIG, useValue: enrichmentConfig },
    { provide: FORTUNE_ENRICHMENT_RUNTIME, useFactory: () => ({ fetch: globalThis.fetch.bind(globalThis), now: () => new Date() }) },
  ],
  exports: [FortuneService]
})
export class FortuneModule {}

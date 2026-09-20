// apps/api/src/modules/fortune/fortune.module.ts

import { Module } from "@nestjs/common";

import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import { UpstashCoordinationModule } from "../../infrastructure/upstash-coordination/upstash-coordination.module";
import { FortuneEnrichmentController } from "./fortune-enrichment.controller";
import { FortuneEnrichmentService } from "./fortune-enrichment.service";
import { fortuneEnrichmentConfig, FORTUNE_ENRICHMENT_CONFIG, FORTUNE_ENRICHMENT_RUNTIME } from "./fortune-enrichment.provider";
import { FortuneController } from "./fortune.controller";
import { FortuneService } from "./fortune.service";

const enrichmentConfig = fortuneEnrichmentConfig(process.env);
const coordination = enrichmentConfig.kasiEnabled || enrichmentConfig.horoscopeEnabled
  ? UpstashCoordinationModule.fromEnvironment(process.env) : null;

@Module({
  imports: [MembershipWalletModule, ...(coordination ? [coordination] : [])],
  controllers: [FortuneController, FortuneEnrichmentController],
  providers: [FortuneService, FortuneEnrichmentService,
    { provide: FORTUNE_ENRICHMENT_CONFIG, useValue: enrichmentConfig },
    { provide: FORTUNE_ENRICHMENT_RUNTIME, useFactory: () => ({ fetch: globalThis.fetch.bind(globalThis), now: () => new Date() }) },
  ],
  exports: [FortuneService]
})
export class FortuneModule {}

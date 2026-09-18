import { Module } from "@nestjs/common";

import { CreatorEcosystemController } from "./creator-ecosystem.controller";
import { CreatorEcosystemService } from "./creator-ecosystem.service";

@Module({
  controllers: [CreatorEcosystemController],
  providers: [CreatorEcosystemService],
})
export class CreatorEcosystemModule {}

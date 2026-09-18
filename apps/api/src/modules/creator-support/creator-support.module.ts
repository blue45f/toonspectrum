import { Module } from "@nestjs/common";

import { CreatorSupportController } from "./creator-support.controller";
import { CreatorSupportService } from "./creator-support.service";

@Module({
  controllers: [CreatorSupportController],
  providers: [CreatorSupportService],
})
export class CreatorSupportModule {}

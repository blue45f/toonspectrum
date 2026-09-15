import { Module } from "@nestjs/common";

import { PersonalCloudController } from "./personal-cloud.controller";
import { PersonalCloudRepository } from "./personal-cloud.repository";
import { PersonalCloudService } from "./personal-cloud.service";

@Module({
  controllers: [PersonalCloudController],
  providers: [PersonalCloudRepository, PersonalCloudService],
})
export class PersonalCloudModule {}

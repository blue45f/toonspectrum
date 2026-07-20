import { Module } from "@nestjs/common";

import {
  ME_COLLECTION_REPOSITORY,
  meCollectionRepositoryProvider,
  type MeCollectionRepository,
} from "./me-collection.repository";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

const meServiceProvider = {
  provide: MeService,
  inject: [ME_COLLECTION_REPOSITORY],
  useFactory: (collectionRepository: MeCollectionRepository): MeService =>
    new MeService(collectionRepository),
};

@Module({
  controllers: [MeController],
  providers: [meCollectionRepositoryProvider, meServiceProvider],
})
export class MeModule {}

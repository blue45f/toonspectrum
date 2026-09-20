import { Module } from "@nestjs/common";
import { PrivateObjectStorageModule } from "../../infrastructure/private-object-storage/private-object-storage.module";
import { CreatorModule } from "../creator/creator.module";

import { StudioExternalFileBindingRepository } from "./studio-external-file-binding.repository";
import { StudioProjectGraphController } from "./studio-project-graph.controller";
import { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import { StudioProjectGraphService } from "./studio-project-graph.service";
import { StudioReviewPreviewController } from "./studio-review-preview.controller";
import { StudioReviewPreviewService } from "./studio-review-preview.service";
import { StudioReviewPreviewProducerController } from "./studio-review-preview-producer.controller";
import { StudioReviewPreviewProducerRepository } from "./studio-review-preview-producer.repository";
import { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";
import { StudioWorldPublicationController } from "./studio-world-publication.controller";
import { StudioWorldPublicationRepository } from "./studio-world-publication.repository";
import { StudioWorldPublicationService } from "./studio-world-publication.service";
import { StudioWorldAcousticController } from "./studio-world-acoustic.controller";
import { StudioWorldAcousticRepository } from "./studio-world-acoustic.repository";
import { StudioWorldAcousticService } from "./studio-world-acoustic.service";

const privateObjectStorageModule = PrivateObjectStorageModule.fromEnvironment(process.env);

@Module({
  imports: [CreatorModule, ...(privateObjectStorageModule ? [privateObjectStorageModule] : [])],
  controllers: [StudioProjectGraphController, StudioReviewPreviewController, StudioReviewPreviewProducerController, StudioWorldPublicationController, StudioWorldAcousticController],
  providers: [
    StudioExternalFileBindingRepository,
    StudioProjectGraphRepository,
    StudioProjectGraphService,
    StudioReviewPreviewService,
    StudioReviewPreviewProducerRepository,
    StudioReviewPreviewProducerService,
    StudioWorldPublicationRepository,
    StudioWorldPublicationService,
    StudioWorldAcousticRepository,
    StudioWorldAcousticService,
  ],
  exports: [StudioProjectGraphService],
})
export class StudioProjectGraphModule {}

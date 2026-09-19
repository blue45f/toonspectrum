import { Module } from "@nestjs/common";
import { PrivateObjectStorageModule } from "../../infrastructure/private-object-storage/private-object-storage.module";
import { CreatorModule } from "../creator/creator.module";

import { StudioProjectGraphController } from "./studio-project-graph.controller";
import { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import { StudioProjectGraphService } from "./studio-project-graph.service";
import { StudioExternalFileBindingRepository } from "./studio-external-file-binding.repository";
import { StudioReviewPreviewController } from "./studio-review-preview.controller";
import { StudioReviewPreviewService } from "./studio-review-preview.service";
import { StudioReviewPreviewProducerController } from "./studio-review-preview-producer.controller";
import { StudioReviewPreviewProducerRepository } from "./studio-review-preview-producer.repository";
import { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";

const privateObjectStorageModule = PrivateObjectStorageModule.fromEnvironment(process.env);

@Module({
  imports: [CreatorModule, ...(privateObjectStorageModule ? [privateObjectStorageModule] : [])],
  controllers: [StudioProjectGraphController, StudioReviewPreviewController, StudioReviewPreviewProducerController],
  providers: [StudioProjectGraphRepository, StudioExternalFileBindingRepository, StudioProjectGraphService, StudioReviewPreviewService,
    StudioReviewPreviewProducerRepository, StudioReviewPreviewProducerService],
  exports: [StudioProjectGraphService],
})
export class StudioProjectGraphModule {}

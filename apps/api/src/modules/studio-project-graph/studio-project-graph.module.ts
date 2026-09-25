import { StudioReviewDeliveryController } from "./review-delivery/review-delivery.controller";
import { STUDIO_REVIEW_DELIVERY_POOL, StudioReviewDeliveryRepository } from "./review-delivery/review-delivery.repository";
import { StudioReviewDeliveryService } from "./review-delivery/review-delivery.service";
import { PinnedReviewShareController } from "./pinned-share/pinned-share.controller";
import { PinnedReviewShareService } from "./pinned-share/pinned-share.service";
import { PinnedReviewShareRepository } from "./pinned-share/pinned-share.repository";
import { StudioReviewVoiceNoteController } from "./studio-review-voice-note.controller";
import { StudioReviewVoiceNoteRepository } from "./studio-review-voice-note.repository";
import { StudioReviewVoiceNoteService } from "./studio-review-voice-note.service";
import { StudioReviewPolicyController, StudioReviewPolicyService } from "./studio-review-policy.controller";
import { StudioReviewPolicyRepository } from "./studio-review-policy.repository";
import { StudioSessionEvidenceController, StudioSessionEvidenceService } from "./studio-session-evidence.controller";
import { StudioWorkSessionController, StudioWorkSessionService } from "./studio-work-session.controller";
import { StudioWorkSessionRepository } from "./studio-work-session.repository";
import { Module } from "@nestjs/common";
import { dbPool } from "../../db";
import { PrivateObjectStorageModule } from "../../platform/private-object-storage/private-object-storage.module";
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
import { StudioWorldConversationRepository } from "./studio-world-conversation.repository";
import { StudioWorldConversationService } from "./studio-world-conversation.service";
import { StudioWorldConversationController } from "./studio-world-conversation.controller";

const privateObjectStorageModule = PrivateObjectStorageModule.fromEnvironment(process.env);

@Module({
  imports: [CreatorModule, ...(privateObjectStorageModule ? [privateObjectStorageModule] : [])],
  controllers: [StudioReviewDeliveryController, StudioReviewVoiceNoteController, PinnedReviewShareController, StudioReviewPolicyController, StudioSessionEvidenceController, StudioWorkSessionController, StudioProjectGraphController, StudioReviewPreviewController, StudioReviewPreviewProducerController, StudioWorldPublicationController, StudioWorldAcousticController, StudioWorldConversationController],
  providers: [
    { provide: STUDIO_REVIEW_DELIVERY_POOL, useValue: dbPool }, StudioReviewDeliveryRepository, StudioReviewDeliveryService,
    StudioReviewVoiceNoteRepository, StudioReviewVoiceNoteService,
    PinnedReviewShareRepository, PinnedReviewShareService,
    StudioReviewPolicyRepository, StudioReviewPolicyService,
    StudioSessionEvidenceService,
    StudioWorkSessionRepository, StudioWorkSessionService,
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
    StudioWorldConversationRepository,
    StudioWorldConversationService,
  ],
  exports: [StudioProjectGraphService],
})
export class StudioProjectGraphModule {}

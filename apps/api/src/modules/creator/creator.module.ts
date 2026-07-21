import { Module } from "@nestjs/common";

import { creatorCollaborationRepositoryProvider } from "./creator-collaboration.repository";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";
import {
  StudioRasterAssetUploadGuard,
  StudioWorkAssetUploadGuard,
} from "./studio-asset-upload.guard";
import { studioCrdtClusterLoadRepositoryProvider } from "./studio-crdt-cluster-load.repository";
import { StudioCrdtRasterCheckpointCoordinator } from "./studio-crdt-raster-checkpoint.coordinator";
import { studioCrdtRasterCheckpointRepositoryProvider } from "./studio-crdt-raster-checkpoint.repository";
import { studioCrdtRepositoryProvider } from "./studio-crdt.repository";
import { StudioCrdtService } from "./studio-crdt.service";
import { StudioLiveAdapterCleanupService } from "./studio-live-adapter-cleanup.service";
import { StudioLiveCleanupNotificationDispatcher } from "./studio-live-cleanup-notification-dispatcher";
import { studioLiveFeaturePolicyProvider } from "./studio-live-feature-policy";
import { StudioLiveInterServerRelayTransport } from "./studio-live-inter-server-relay-transport";
import { StudioLiveJoinTransitionSequencer } from "./studio-live-join-transition-sequencer";
import { studioLiveLockRepositoryProvider } from "./studio-live-lock.repository";
import { StudioLiveRoomTransitionCoordinator } from "./studio-live-room-transition-coordinator";
import { StudioLiveSocketAuthService } from "./studio-live-socket-auth.service";
import { StudioLiveGateway } from "./studio-live.gateway";
import {
  studioLiveSessionAuthenticatorProvider,
  studioLiveSessionRevalidatorProvider,
} from "./studio-live.protocol";
import { StudioRasterAssetController } from "./studio-raster-asset.controller";
import { studioRasterAssetRepositoryProvider } from "./studio-raster-asset.repository";
import { StudioRasterAssetService } from "./studio-raster-asset.service";
import { studioRemoteReferenceImageDeliveryLimiterProvider } from "./studio-remote-reference-image-delivery";
import { StudioRemoteReferenceImageController } from "./studio-remote-reference-image.controller";
import {
  studioRemoteReferenceDnsResolverProvider,
  studioRemoteReferenceHttpRequesterProvider,
} from "./studio-remote-reference-image.network";
import { StudioRemoteReferenceImageService } from "./studio-remote-reference-image.service";
import { StudioTeamCommentLivePublisher } from "./studio-team-comment-live.publisher";
import { StudioTeamCommentController } from "./studio-team-comment.controller";
import { studioTeamCommentRepositoryProvider } from "./studio-team-comment.repository";
import { StudioTeamCommentService } from "./studio-team-comment.service";
import { StudioVoiceIcePolicyController } from "./studio-voice-ice-policy.controller";
import {
  StudioVoiceIcePolicyService,
  studioVoiceIceConfigurationProvider,
} from "./studio-voice-ice-policy.service";
import { StudioWorkAssetController } from "./studio-work-asset.controller";
import { studioWorkAssetRepositoryProvider } from "./studio-work-asset.repository";
import { StudioWorkAssetService } from "./studio-work-asset.service";

@Module({
  controllers: [
    CreatorController,
    StudioRasterAssetController,
    StudioRemoteReferenceImageController,
    StudioTeamCommentController,
    StudioVoiceIcePolicyController,
    StudioWorkAssetController,
  ],
  providers: [
    creatorCollaborationRepositoryProvider,
    studioCrdtClusterLoadRepositoryProvider,
    studioCrdtRasterCheckpointRepositoryProvider,
    studioCrdtRepositoryProvider,
    studioLiveFeaturePolicyProvider,
    studioLiveLockRepositoryProvider,
    studioRasterAssetRepositoryProvider,
    studioRemoteReferenceDnsResolverProvider,
    studioRemoteReferenceHttpRequesterProvider,
    studioRemoteReferenceImageDeliveryLimiterProvider,
    studioTeamCommentRepositoryProvider,
    studioVoiceIceConfigurationProvider,
    studioWorkAssetRepositoryProvider,
    CreatorService,
    StudioRasterAssetService,
    StudioRemoteReferenceImageService,
    StudioTeamCommentLivePublisher,
    StudioTeamCommentService,
    StudioVoiceIcePolicyService,
    StudioWorkAssetService,
    StudioRasterAssetUploadGuard,
    StudioWorkAssetUploadGuard,
    StudioCrdtService,
    StudioCrdtRasterCheckpointCoordinator,
    studioLiveSessionAuthenticatorProvider,
    studioLiveSessionRevalidatorProvider,
    StudioLiveAdapterCleanupService,
    StudioLiveCleanupNotificationDispatcher,
    StudioLiveInterServerRelayTransport,
    StudioLiveJoinTransitionSequencer,
    StudioLiveRoomTransitionCoordinator,
    StudioLiveSocketAuthService,
    StudioLiveGateway,
  ],
})
export class CreatorModule {}

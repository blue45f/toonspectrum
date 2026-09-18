import { Module } from "@nestjs/common";

import { StudioRealtimeRevocationModule } from "../../infrastructure/studio-realtime-revocation/studio-realtime-revocation.module";
import { PrivateObjectStorageModule } from "../../infrastructure/private-object-storage/private-object-storage.module";
import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import { MembershipOperationsModule } from "../membership-operations/membership-operations.module";

import { creatorAssetSchemaPreflightProvider } from "./creator-asset-schema-preflight";
import { CreatorCollaborationRepository } from "./creator-collaboration.repository";
import { creatorDraftCollaborationRepositoryProvider } from "./creator-draft-collaboration.repository";
import { CreatorController } from "./creator.controller";
import { creatorPublicationCollaborationRepositoryProvider } from "./creator-publication-collaboration.repository";
import { CreatorRoleWorkspaceController } from "./creator-role-workspace.controller";
import { CreatorRoleWorkspaceRepository } from "./creator-role-workspace.repository";
import { CreatorRoleWorkspaceService } from "./creator-role-workspace.service";
import { CreatorPublicationSchedulerService } from "./creator-publication-scheduler.service";
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
import { StudioLiveAuthTicketController } from "./studio-live-auth-ticket.controller";
import { StudioLiveAuthTicketService } from "./studio-live-auth-ticket.service";
import { StudioLiveCleanupNotificationDispatcher } from "./studio-live-cleanup-notification-dispatcher";
import { studioLiveFeaturePolicyProvider } from "./studio-live-feature-policy";
import { StudioLiveInterServerRelayTransport } from "./studio-live-inter-server-relay-transport";
import { StudioLiveJoinTransitionSequencer } from "./studio-live-join-transition-sequencer";
import { studioLiveLockSchemaPreflightProvider } from "./studio-live-lock-schema-preflight";
import { studioLiveLockRepositoryProvider } from "./studio-live-lock.repository";
import { StudioLiveRoomTransitionCoordinator } from "./studio-live-room-transition-coordinator";
import { StudioLiveSocketAuthService } from "./studio-live-socket-auth.service";
import { StudioLiveGateway } from "./studio-live.gateway";
import {
  studioLiveSessionAuthenticatorProvider,
  studioLiveSessionRevalidatorProvider,
} from "./studio-live.protocol";
import { StudioProductionController } from "./studio-production.controller";
import { studioProductionRepositoryProvider } from "./studio-production.repository";
import { StudioProductionService } from "./studio-production.service";
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

const privateObjectStorageModule =
  PrivateObjectStorageModule.fromEnvironment(process.env);

@Module({
  imports: [
    StudioRealtimeRevocationModule,
    MembershipWalletModule,
    MembershipOperationsModule,
    ...(privateObjectStorageModule ? [privateObjectStorageModule] : []),
  ],
  controllers: [
    CreatorController,
    CreatorRoleWorkspaceController,
    StudioLiveAuthTicketController,
    StudioRasterAssetController,
    StudioRemoteReferenceImageController,
    StudioProductionController,
    StudioTeamCommentController,
    StudioVoiceIcePolicyController,
    StudioWorkAssetController,
  ],
  providers: [
    creatorAssetSchemaPreflightProvider,
    creatorPublicationCollaborationRepositoryProvider,
    creatorDraftCollaborationRepositoryProvider,
    studioCrdtClusterLoadRepositoryProvider,
    studioCrdtRasterCheckpointRepositoryProvider,
    studioCrdtRepositoryProvider,
    studioLiveFeaturePolicyProvider,
    studioLiveLockSchemaPreflightProvider,
    studioLiveLockRepositoryProvider,
    studioRasterAssetRepositoryProvider,
    studioRemoteReferenceDnsResolverProvider,
    studioRemoteReferenceHttpRequesterProvider,
    studioRemoteReferenceImageDeliveryLimiterProvider,
    studioProductionRepositoryProvider,
    studioTeamCommentRepositoryProvider,
    studioVoiceIceConfigurationProvider,
    studioWorkAssetRepositoryProvider,
    CreatorPublicationSchedulerService,
    CreatorRoleWorkspaceRepository,
    CreatorRoleWorkspaceService,
    CreatorService,
    StudioRasterAssetService,
    StudioRemoteReferenceImageService,
    StudioProductionService,
    StudioTeamCommentLivePublisher,
    StudioTeamCommentService,
    StudioVoiceIcePolicyService,
    StudioWorkAssetService,
    StudioRasterAssetUploadGuard,
    StudioWorkAssetUploadGuard,
    StudioCrdtService,
    StudioCrdtRasterCheckpointCoordinator,
    StudioLiveAuthTicketService,
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
  exports: [CreatorCollaborationRepository],
})
export class CreatorModule {}

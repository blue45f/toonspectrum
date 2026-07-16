import { Module } from "@nestjs/common";

import { creatorCollaborationRepositoryProvider } from "./creator-collaboration.repository";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";
import {
  StudioRasterAssetUploadGuard,
  StudioWorkAssetUploadGuard,
} from "./studio-asset-upload.guard";
import { studioCrdtRepositoryProvider } from "./studio-crdt.repository";
import { StudioCrdtService } from "./studio-crdt.service";
import { studioLiveLockRepositoryProvider } from "./studio-live-lock.repository";
import {
  StudioLiveGateway,
  studioLiveSessionAuthenticatorProvider,
  studioLiveSessionRevalidatorProvider,
} from "./studio-live.gateway";
import { StudioRasterAssetController } from "./studio-raster-asset.controller";
import { studioRasterAssetRepositoryProvider } from "./studio-raster-asset.repository";
import { StudioRasterAssetService } from "./studio-raster-asset.service";
import { StudioWorkAssetController } from "./studio-work-asset.controller";
import { studioWorkAssetRepositoryProvider } from "./studio-work-asset.repository";
import { StudioWorkAssetService } from "./studio-work-asset.service";

@Module({
  controllers: [
    CreatorController,
    StudioRasterAssetController,
    StudioWorkAssetController,
  ],
  providers: [
    creatorCollaborationRepositoryProvider,
    studioCrdtRepositoryProvider,
    studioLiveLockRepositoryProvider,
    studioRasterAssetRepositoryProvider,
    studioWorkAssetRepositoryProvider,
    CreatorService,
    StudioRasterAssetService,
    StudioWorkAssetService,
    StudioRasterAssetUploadGuard,
    StudioWorkAssetUploadGuard,
    StudioCrdtService,
    studioLiveSessionAuthenticatorProvider,
    studioLiveSessionRevalidatorProvider,
    StudioLiveGateway,
  ],
})
export class CreatorModule {}

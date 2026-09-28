import { Module } from "@nestjs/common";

import { StudioVirtualSpaceDecorationController } from "./studio-virtual-space-decoration.controller";
import { StudioVirtualSpaceDecorationService } from "./studio-virtual-space-decoration.service";
import { StudioVirtualSpaceFurnitureController } from "./studio-virtual-space-furniture.controller";
import { StudioVirtualSpaceFurnitureService } from "./studio-virtual-space-furniture.service";

@Module({
  controllers: [StudioVirtualSpaceDecorationController, StudioVirtualSpaceFurnitureController],
  providers: [StudioVirtualSpaceDecorationService, StudioVirtualSpaceFurnitureService],
})
export class StudioVirtualSpaceDecorationModule {}

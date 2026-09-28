import { Module } from "@nestjs/common";

import { StudioVirtualSpaceDecorationController } from "./studio-virtual-space-decoration.controller";
import { StudioVirtualSpaceDecorationService } from "./studio-virtual-space-decoration.service";

@Module({
  controllers: [StudioVirtualSpaceDecorationController],
  providers: [StudioVirtualSpaceDecorationService],
})
export class StudioVirtualSpaceDecorationModule {}

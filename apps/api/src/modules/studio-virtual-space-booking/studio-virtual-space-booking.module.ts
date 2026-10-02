import { Module } from "@nestjs/common";

import { StudioVirtualSpaceBookingController } from "./studio-virtual-space-booking.controller";
import { provideStudioVirtualSpaceBookingRepository } from "./studio-virtual-space-booking.repository";
import { StudioVirtualSpaceBookingService } from "./studio-virtual-space-booking.service";

@Module({
  controllers: [StudioVirtualSpaceBookingController],
  providers: [StudioVirtualSpaceBookingService, provideStudioVirtualSpaceBookingRepository()],
})
export class StudioVirtualSpaceBookingModule {}

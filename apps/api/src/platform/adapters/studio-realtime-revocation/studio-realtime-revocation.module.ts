import { Module } from "@nestjs/common";

import { StudioRealtimeRevocationService } from "./studio-realtime-revocation.client";
import {
  STUDIO_REALTIME_REVOCATION_CONFIGURATION,
  resolveStudioRealtimeRevocationConfiguration,
} from "./studio-realtime-revocation.configuration";

@Module({
  providers: [
    {
      provide: STUDIO_REALTIME_REVOCATION_CONFIGURATION,
      useFactory: () =>
        resolveStudioRealtimeRevocationConfiguration(process.env),
    },
    {
      provide: StudioRealtimeRevocationService,
      inject: [STUDIO_REALTIME_REVOCATION_CONFIGURATION],
      useFactory: (
        configuration: ReturnType<
          typeof resolveStudioRealtimeRevocationConfiguration
        >,
      ) => new StudioRealtimeRevocationService(configuration),
    },
  ],
  exports: [StudioRealtimeRevocationService],
})
export class StudioRealtimeRevocationModule {}

import { describe, expect, it } from "vitest";

import {
  DenyAllStudioRealtimeTicketAuthorization,
  STUDIO_REALTIME_TICKET_AUTHORIZATION,
} from "./studio-realtime-ticket.authorization";
import { StudioRealtimeTicketModule } from "./studio-realtime-ticket.module";
import { STUDIO_REALTIME_TICKET_SIGNERS } from "./studio-realtime-ticket.provider";

describe("StudioRealtimeTicketModule", () => {
  it("registers deny-all authorization and no signer when adapters are omitted", () => {
    const dynamicModule = StudioRealtimeTicketModule.forRootAsync();
    const providers = dynamicModule.providers ?? [];

    expect(providers).toEqual(
      expect.arrayContaining([
        DenyAllStudioRealtimeTicketAuthorization,
        expect.objectContaining({
          provide: STUDIO_REALTIME_TICKET_AUTHORIZATION,
        }),
        expect.objectContaining({
          provide: STUDIO_REALTIME_TICKET_SIGNERS,
        }),
      ]),
    );
  });
});

import { Module } from "@nestjs/common";

import {
  DenyAllStudioRealtimeTicketAuthorization,
  STUDIO_REALTIME_TICKET_AUTHORIZATION,
} from "./studio-realtime-ticket.authorization";
import { StudioRealtimeTicketController } from "./studio-realtime-ticket.controller";
import { STUDIO_REALTIME_TICKET_SIGNERS } from "./studio-realtime-ticket.provider";
import { StudioRealtimeTicketService } from "./studio-realtime-ticket.service";

import type {
  StudioRealtimeTicketAuthorizationPort,
} from "./studio-realtime-ticket.authorization";
import type {
  StudioRealtimeTicketSignerPort,
} from "./studio-realtime-ticket.provider";
import type {
  DynamicModule,
  FactoryProvider,
  ModuleMetadata,
} from "@nestjs/common";

type AsyncFactory<T> = Pick<FactoryProvider<T>, "inject" | "useFactory">;

export interface StudioRealtimeTicketModuleAsyncOptions {
  readonly imports?: ModuleMetadata["imports"];
  /**
   * The factory is the Config/DI boundary for provider-specific secrets.
   * It may return Cloudflare HMAC, Supabase, and Socket.IO signer adapters.
   */
  readonly signers?: AsyncFactory<readonly StudioRealtimeTicketSignerPort[]>;
  /**
   * Omission is safe: the module boots, but the default port denies every ticket.
   */
  readonly authorization?: AsyncFactory<StudioRealtimeTicketAuthorizationPort>;
}

@Module({})
export class StudioRealtimeTicketModule {
  static forRootAsync(
    options: StudioRealtimeTicketModuleAsyncOptions = {},
  ): DynamicModule {
    const authorizationProvider: FactoryProvider<StudioRealtimeTicketAuthorizationPort> =
      options.authorization
        ? {
            provide: STUDIO_REALTIME_TICKET_AUTHORIZATION,
            inject: options.authorization.inject,
            useFactory: options.authorization.useFactory,
          }
        : {
            provide: STUDIO_REALTIME_TICKET_AUTHORIZATION,
            inject: [DenyAllStudioRealtimeTicketAuthorization],
            useFactory: (
              denyAll: DenyAllStudioRealtimeTicketAuthorization,
            ): StudioRealtimeTicketAuthorizationPort => denyAll,
          };
    const signerProvider: FactoryProvider<
      readonly StudioRealtimeTicketSignerPort[]
    > = options.signers
      ? {
          provide: STUDIO_REALTIME_TICKET_SIGNERS,
          inject: options.signers.inject,
          useFactory: options.signers.useFactory,
        }
      : {
          provide: STUDIO_REALTIME_TICKET_SIGNERS,
          useFactory: () => [],
        };

    return {
      module: StudioRealtimeTicketModule,
      imports: options.imports,
      controllers: [StudioRealtimeTicketController],
      providers: [
        DenyAllStudioRealtimeTicketAuthorization,
        authorizationProvider,
        signerProvider,
        StudioRealtimeTicketService,
      ],
    };
  }
}

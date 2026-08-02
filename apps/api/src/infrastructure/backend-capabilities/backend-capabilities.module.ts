import { randomUUID } from "node:crypto";

import { Module, type DynamicModule } from "@nestjs/common";

import { SupabaseObjectStorageModule } from "../supabase-object-storage/supabase-object-storage.module";
import { UpstashCoordinationModule } from "../upstash-coordination/upstash-coordination.module";

import {
  BACKEND_CAPABILITY_COORDINATION_RUNTIME,
  BackendCapabilityCoordinationGate,
} from "./backend-capability-coordination-gate";
import {
  BACKEND_CAPABILITY_DURABLE_QUEUE_PORT,
  type BackendCapabilityDurableQueuePort,
} from "./backend-capability-durable-queue.port";
import { BackendCapabilityGatewayController } from "./backend-capability-gateway-controller";
import {
  BACKEND_CAPABILITY_GATEWAY_RUNTIME,
  BackendCapabilityGatewayDispatcher,
  type BackendCapabilityGatewayRuntime,
} from "./backend-capability-gateway-dispatcher";
import { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";
import {
  BACKEND_CAPABILITY_POLICY,
  BackendCapabilityRouter,
} from "./backend-capability-router";

const upstashCoordinationModule =
  UpstashCoordinationModule.fromEnvironment(process.env);
const supabaseObjectStorageModule =
  SupabaseObjectStorageModule.fromEnvironment(process.env);

const optionalInfrastructureModules = [
  ...(upstashCoordinationModule ? [upstashCoordinationModule] : []),
  ...(supabaseObjectStorageModule ? [supabaseObjectStorageModule] : []),
];
const optionalInfrastructureExports = [
  ...(upstashCoordinationModule ? [UpstashCoordinationModule] : []),
  ...(supabaseObjectStorageModule ? [SupabaseObjectStorageModule] : []),
];

@Module({
  imports: optionalInfrastructureModules,
  controllers: [BackendCapabilityGatewayController],
  providers: [
    {
      provide: BACKEND_CAPABILITY_POLICY,
      useFactory: () => resolveBackendCapabilityPolicy(process.env),
    },
    {
      provide: BACKEND_CAPABILITY_GATEWAY_RUNTIME,
      useFactory: (): BackendCapabilityGatewayRuntime => ({
        fetch: globalThis.fetch.bind(globalThis),
        now: Date.now,
        nonce: randomUUID,
      }),
    },
    {
      provide: BACKEND_CAPABILITY_COORDINATION_RUNTIME,
      useExisting: BACKEND_CAPABILITY_GATEWAY_RUNTIME,
    },
    BackendCapabilityRouter,
    BackendCapabilityCoordinationGate,
    BackendCapabilityGatewayDispatcher,
    BackendCapabilityGatewayExecutor,
  ],
  exports: [
    BackendCapabilityRouter,
    BackendCapabilityCoordinationGate,
    BackendCapabilityGatewayDispatcher,
    BackendCapabilityGatewayExecutor,
    ...optionalInfrastructureExports,
  ],
})
export class BackendCapabilitiesModule {
  /**
   * Provider-facade registration seam. The default application intentionally installs no durable
   * queue adapter. It may stay ready only while no queue role is enabled; enabling one without a
   * real adapter fails health readiness and requests reject instead of claiming a queue receipt.
   */
  static registerDurableQueue(
    durableQueue: BackendCapabilityDurableQueuePort
  ): DynamicModule {
    return {
      module: BackendCapabilitiesModule,
      providers: [
        {
          provide: BACKEND_CAPABILITY_DURABLE_QUEUE_PORT,
          useValue: durableQueue,
        },
      ],
      exports: [BACKEND_CAPABILITY_DURABLE_QUEUE_PORT],
    };
  }
}

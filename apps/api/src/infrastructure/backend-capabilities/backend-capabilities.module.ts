import { randomUUID } from "node:crypto";

import { Module, type DynamicModule } from "@nestjs/common";

import { SupabaseObjectStorageModule } from "../supabase-object-storage/supabase-object-storage.module";
import { UpstashCoordinationModule } from "../upstash-coordination/upstash-coordination.module";
import { UpstashQStashModule } from "../upstash-qstash/upstash-qstash.module";

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
const upstashQStashModule =
  UpstashQStashModule.fromEnvironment(process.env);

const optionalInfrastructureModules = [
  ...(upstashCoordinationModule ? [upstashCoordinationModule] : []),
  ...(supabaseObjectStorageModule ? [supabaseObjectStorageModule] : []),
  ...(upstashQStashModule ? [upstashQStashModule] : []),
];
const optionalInfrastructureExports = [
  ...(upstashCoordinationModule ? [UpstashCoordinationModule] : []),
  ...(supabaseObjectStorageModule ? [SupabaseObjectStorageModule] : []),
  ...(upstashQStashModule ? [UpstashQStashModule] : []),
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
   * Test/custom provider registration seam. Production may install the fail-closed QStash adapter
   * from environment. It may stay ready without a port only while no durable queue role is enabled.
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

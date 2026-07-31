import { randomUUID } from "node:crypto";

import { Module } from "@nestjs/common";

import { SupabaseObjectStorageModule } from "../supabase-object-storage/supabase-object-storage.module";
import { UpstashCoordinationModule } from "../upstash-coordination/upstash-coordination.module";

import {
  BACKEND_CAPABILITY_COORDINATION_RUNTIME,
  BackendCapabilityCoordinationGate,
} from "./backend-capability-coordination-gate";
import {
  BACKEND_CAPABILITY_GATEWAY_RUNTIME,
  BackendCapabilityGatewayDispatcher,
  type BackendCapabilityGatewayRuntime,
} from "./backend-capability-gateway-dispatcher";
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
  ],
  exports: [
    BackendCapabilityRouter,
    BackendCapabilityCoordinationGate,
    BackendCapabilityGatewayDispatcher,
    ...optionalInfrastructureExports,
  ],
})
export class BackendCapabilitiesModule {}

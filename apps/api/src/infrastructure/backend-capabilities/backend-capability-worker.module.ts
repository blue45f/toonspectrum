import { randomUUID } from "node:crypto";

import { Module, type DynamicModule, type Provider } from "@nestjs/common";

import { SupabaseObjectStorageModule } from "../supabase-object-storage/supabase-object-storage.module";

import { BackendCapabilityGatewayController } from "./backend-capability-gateway-controller";
import {
  BACKEND_CAPABILITY_GATEWAY_RUNTIME,
  type BackendCapabilityGatewayRuntime,
} from "./backend-capability-gateway-dispatcher";
import { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";
import { BACKEND_CAPABILITY_POLICY } from "./backend-capability-router";
import {
  BACKEND_CAPABILITY_WORKER_CONFIG,
  BACKEND_CAPABILITY_WORKER_RUNTIME,
  SupabaseThumbnailCapabilityWorker,
  type BackendCapabilityWorkerRuntime,
} from "./backend-capability-thumbnail-worker";
import {
  BackendCapabilityWorkerHealthController,
  BackendCapabilityWorkerLiveController,
} from "./backend-capability-worker-health.controller";
import { resolveBackendCapabilityWorkerConfig } from "./backend-capability-worker.config";
import { BACKEND_CAPABILITY_WORKER_PORT } from "./backend-capability-worker.port";

@Module({})
export class BackendCapabilityWorkerModule {
  /**
   * Minimal provider facade: no database, auth/session, marketplace, CRDT, Socket.IO, QStash or
   * Upstash coordination modules are imported. The source API owns selection, budget, lease and
   * durable receipts; this process owns only its signed health and exact execution contract.
   */
  static fromEnvironment(
    environment:
      | NodeJS.ProcessEnv
      | Readonly<Record<string, string | undefined>>,
  ): DynamicModule {
    const config = resolveBackendCapabilityWorkerConfig(environment);
    const storageModule = SupabaseObjectStorageModule.fromEnvironment(environment);
    const workerProviders: Provider[] = [];
    if (config && storageModule) {
      workerProviders.push(
        {
          provide: BACKEND_CAPABILITY_WORKER_CONFIG,
          useValue: config,
        },
        {
          provide: BACKEND_CAPABILITY_WORKER_RUNTIME,
          useFactory: (): BackendCapabilityWorkerRuntime => ({
            fetch: globalThis.fetch.bind(globalThis),
          }),
        },
        SupabaseThumbnailCapabilityWorker,
        {
          provide: BACKEND_CAPABILITY_WORKER_PORT,
          useExisting: SupabaseThumbnailCapabilityWorker,
        },
      );
    }

    return {
      module: BackendCapabilityWorkerModule,
      imports: storageModule ? [storageModule] : [],
      controllers: [
        BackendCapabilityGatewayController,
        BackendCapabilityWorkerHealthController,
        BackendCapabilityWorkerLiveController,
      ],
      providers: [
        {
          provide: BACKEND_CAPABILITY_POLICY,
          useFactory: () => resolveBackendCapabilityPolicy(environment),
        },
        {
          provide: BACKEND_CAPABILITY_GATEWAY_RUNTIME,
          useFactory: (): BackendCapabilityGatewayRuntime => ({
            fetch: globalThis.fetch.bind(globalThis),
            now: Date.now,
            nonce: randomUUID,
          }),
        },
        BackendCapabilityGatewayExecutor,
        ...workerProviders,
      ],
    };
  }
}

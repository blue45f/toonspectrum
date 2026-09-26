import { DynamicModule, Module } from "@nestjs/common";

import { BACKEND_CAPABILITY_DURABLE_QUEUE_PORT } from "../backend-capabilities/backend-capability-durable-queue.port";

import {
  UPSTASH_QSTASH_CONFIG,
  UPSTASH_QSTASH_RUNTIME,
  UpstashQStashDurableQueuePort,
  type UpstashQStashRuntime,
} from "./upstash-qstash.client";
import {
  resolveUpstashQStashConfig,
  validateUpstashQStashConfig,
  type UpstashQStashConfig,
} from "./upstash-qstash.config";
import { createDefaultUpstashQStashRuntime } from "./upstash-qstash.factory";

@Module({})
export class UpstashQStashModule {
  static register(
    config: UpstashQStashConfig,
    runtime: UpstashQStashRuntime = createDefaultUpstashQStashRuntime()
  ): DynamicModule {
    const validatedConfig = validateUpstashQStashConfig(config);
    return {
      module: UpstashQStashModule,
      providers: [
        { provide: UPSTASH_QSTASH_CONFIG, useValue: validatedConfig },
        { provide: UPSTASH_QSTASH_RUNTIME, useValue: runtime },
        UpstashQStashDurableQueuePort,
        {
          provide: BACKEND_CAPABILITY_DURABLE_QUEUE_PORT,
          useExisting: UpstashQStashDurableQueuePort,
        },
      ],
      exports: [BACKEND_CAPABILITY_DURABLE_QUEUE_PORT],
    };
  }

  static fromEnvironment(
    environment:
      | NodeJS.ProcessEnv
      | Readonly<Record<string, string | undefined>>
  ): DynamicModule | null {
    const config = resolveUpstashQStashConfig(environment);
    return config ? UpstashQStashModule.register(config) : null;
  }
}

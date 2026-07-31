import { DynamicModule, Module } from "@nestjs/common";

import {
  UPSTASH_COORDINATION_CONFIG,
  UPSTASH_COORDINATION_RUNTIME,
  UpstashRestCoordinationPort,
  type UpstashCoordinationRuntime,
} from "./upstash-coordination.client";
import {
  resolveUpstashCoordinationConfig,
  type UpstashCoordinationConfig,
} from "./upstash-coordination.config";
import {
  createDefaultUpstashCoordinationRuntime,
} from "./upstash-coordination.factory";
import { UPSTASH_COORDINATION_PORT } from "./upstash-coordination.port";

@Module({})
export class UpstashCoordinationModule {
  static register(
    config: UpstashCoordinationConfig,
    runtime: UpstashCoordinationRuntime =
      createDefaultUpstashCoordinationRuntime()
  ): DynamicModule {
    return {
      module: UpstashCoordinationModule,
      providers: [
        { provide: UPSTASH_COORDINATION_CONFIG, useValue: config },
        { provide: UPSTASH_COORDINATION_RUNTIME, useValue: runtime },
        UpstashRestCoordinationPort,
        {
          provide: UPSTASH_COORDINATION_PORT,
          useExisting: UpstashRestCoordinationPort,
        },
      ],
      exports: [UPSTASH_COORDINATION_PORT],
    };
  }

  /**
   * Integration seam for AppModule:
   * `const module = UpstashCoordinationModule.fromEnvironment(process.env)`, then conditionally
   * spread only the non-null module into `imports`.
   */
  static fromEnvironment(
    environment:
      | NodeJS.ProcessEnv
      | Readonly<Record<string, string | undefined>>
  ): DynamicModule | null {
    const config = resolveUpstashCoordinationConfig(environment);
    return config ? UpstashCoordinationModule.register(config) : null;
  }
}

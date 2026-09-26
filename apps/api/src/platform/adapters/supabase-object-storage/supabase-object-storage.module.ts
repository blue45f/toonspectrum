import { DynamicModule, Module } from "@nestjs/common";

import {
  SUPABASE_OBJECT_STORAGE_CONFIG,
  SUPABASE_OBJECT_STORAGE_RUNTIME,
  SupabaseRestObjectStoragePort,
  type SupabaseObjectStorageRuntime,
} from "./supabase-object-storage.client";
import {
  resolveSupabaseObjectStorageConfig,
  type SupabaseObjectStorageConfig,
} from "./supabase-object-storage.config";
import { createDefaultSupabaseObjectStorageRuntime } from "./supabase-object-storage.factory";
import { SUPABASE_OBJECT_STORAGE_PORT } from "./supabase-object-storage.port";

@Module({})
export class SupabaseObjectStorageModule {
  static register(
    config: SupabaseObjectStorageConfig,
    runtime: SupabaseObjectStorageRuntime =
      createDefaultSupabaseObjectStorageRuntime()
  ): DynamicModule {
    return {
      module: SupabaseObjectStorageModule,
      providers: [
        {
          provide: SUPABASE_OBJECT_STORAGE_CONFIG,
          useValue: config,
        },
        {
          provide: SUPABASE_OBJECT_STORAGE_RUNTIME,
          useValue: runtime,
        },
        SupabaseRestObjectStoragePort,
        {
          provide: SUPABASE_OBJECT_STORAGE_PORT,
          useExisting: SupabaseRestObjectStoragePort,
        },
      ],
      exports: [SUPABASE_OBJECT_STORAGE_PORT],
    };
  }

  /**
   * AppModule integration seam. Conditionally spread only a non-null module
   * into imports; a disabled boundary does not downgrade to local storage.
   */
  static fromEnvironment(
    environment:
      | NodeJS.ProcessEnv
      | Readonly<Record<string, string | undefined>>
  ): DynamicModule | null {
    const config =
      resolveSupabaseObjectStorageConfig(environment);
    return config
      ? SupabaseObjectStorageModule.register(config)
      : null;
  }
}

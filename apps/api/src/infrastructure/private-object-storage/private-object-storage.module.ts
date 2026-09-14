import { type DynamicModule, Module } from "@nestjs/common";

import {
  SupabaseRestObjectStoragePort,
  type SupabaseObjectStorageRuntime,
} from "../supabase-object-storage/supabase-object-storage.client";
import { createDefaultSupabaseObjectStorageRuntime } from "../supabase-object-storage/supabase-object-storage.factory";
import { SUPABASE_OBJECT_STORAGE_PORT } from "../supabase-object-storage/supabase-object-storage.port";
import {
  resolvePrivateObjectStoragePlan,
  type PrivateObjectStoragePlan,
} from "./private-object-storage.config";
import { PRIVATE_OBJECT_STORAGE_PORT, type PrivateObjectStoragePort } from "./private-object-storage.port";
import {
  PurposeRoutedPrivateObjectStoragePort,
  type PrivateObjectStorageProviderId,
} from "./purpose-routed-private-object-storage.port";
import {
  S3CompatiblePrivateObjectStoragePort,
  type S3CompatibleObjectStorageRuntime,
} from "./s3-compatible-object-storage.client";

export interface PrivateObjectStorageRuntimes {
  readonly supabase?: SupabaseObjectStorageRuntime;
  readonly s3?: S3CompatibleObjectStorageRuntime;
}

export function createDefaultS3CompatibleObjectStorageRuntime(): S3CompatibleObjectStorageRuntime {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    now: Date.now,
  };
}

export function createPrivateObjectStoragePort(
  plan: PrivateObjectStoragePlan,
  runtimes: PrivateObjectStorageRuntimes = {},
): PrivateObjectStoragePort {
  const providers = new Map<
    PrivateObjectStorageProviderId,
    PrivateObjectStoragePort
  >();

  if (plan.supabase) {
    providers.set(
      "supabase",
      new SupabaseRestObjectStoragePort(
        plan.supabase,
        runtimes.supabase ?? createDefaultSupabaseObjectStorageRuntime(),
      ),
    );
  }

  const s3Runtime =
    runtimes.s3 ?? createDefaultS3CompatibleObjectStorageRuntime();
  for (const providerId of ["cloudflare-r2", "backblaze-b2"] as const) {
    const config = plan.s3[providerId];
    if (!config) continue;
    providers.set(
      providerId,
      new S3CompatiblePrivateObjectStoragePort(config, s3Runtime),
    );
  }

  return new PurposeRoutedPrivateObjectStoragePort(
    plan.routing,
    providers,
  );
}

@Module({})
export class PrivateObjectStorageModule {
  static register(
    plan: PrivateObjectStoragePlan,
    runtimes: PrivateObjectStorageRuntimes = {},
  ): DynamicModule {
    return {
      module: PrivateObjectStorageModule,
      providers: [
        {
          provide: PRIVATE_OBJECT_STORAGE_PORT,
          useFactory: () => createPrivateObjectStoragePort(plan, runtimes),
        },
        // Compatibility alias while product services migrate from the historical
        // Supabase-specific token to the provider-neutral storage port.
        {
          provide: SUPABASE_OBJECT_STORAGE_PORT,
          useExisting: PRIVATE_OBJECT_STORAGE_PORT,
        },
      ],
      exports: [
        PRIVATE_OBJECT_STORAGE_PORT,
        SUPABASE_OBJECT_STORAGE_PORT,
      ],
    };
  }

  static fromEnvironment(
    environment:
      | NodeJS.ProcessEnv
      | Readonly<Record<string, string | undefined>>,
    runtimes: PrivateObjectStorageRuntimes = {},
  ): DynamicModule | null {
    const plan = resolvePrivateObjectStoragePlan(environment);
    return plan
      ? PrivateObjectStorageModule.register(plan, runtimes)
      : null;
  }
}

import type { SupabaseObjectStorageRuntime } from "./supabase-object-storage.client";

export function createDefaultSupabaseObjectStorageRuntime(): SupabaseObjectStorageRuntime {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    now: Date.now,
  };
}

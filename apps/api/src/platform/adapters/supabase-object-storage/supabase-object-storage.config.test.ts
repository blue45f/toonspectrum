import { describe, expect, it } from "vitest";

import {
  SupabaseObjectStorageConfigurationError,
  resolveSupabaseObjectStorageConfig,
} from "./supabase-object-storage.config";
import { SupabaseObjectStorageModule } from "./supabase-object-storage.module";

const enabledEnvironment = {
  SUPABASE_OBJECT_STORAGE_ENABLED: "true",
  SUPABASE_OBJECT_STORAGE_URL: "https://project.example/",
  SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY:
    "test-service-role-key-with-at-least-thirty-two-characters",
  SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET: "toon-source-assets",
  SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET: "toon-derived-assets",
  SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET: "toon-export-assets",
} as const;

describe("Supabase object storage configuration", () => {
  it("신규 서버 키를 기존 JWT보다 우선한다", () => {
    const key = ["sb", "secret", "test-only-private-storage-key"].join("_");
    expect(resolveSupabaseObjectStorageConfig({
      ...enabledEnvironment, SUPABASE_OBJECT_STORAGE_SECRET_KEY: key,
    })?.serviceRoleKey).toBe(key);
  });

  it.each(["", " private-storage-key-with-leading-space", ["sb", "publishable", "test-only-public-key-not-for-storage"].join("_")])(
    "잘못된 신규 키를 기존 키로 숨기지 않는다 (%#)", (key) => {
      expect(() => resolveSupabaseObjectStorageConfig({
        ...enabledEnvironment, SUPABASE_OBJECT_STORAGE_SECRET_KEY: key,
      })).toThrow(SupabaseObjectStorageConfigurationError);
    },
  );

  it("stays absent instead of installing a local downgrade when disabled", () => {
    expect(resolveSupabaseObjectStorageConfig({})).toBeNull();
    expect(
      resolveSupabaseObjectStorageConfig({
        SUPABASE_OBJECT_STORAGE_ENABLED: "false",
      })
    ).toBeNull();
    expect(SupabaseObjectStorageModule.fromEnvironment({})).toBeNull();
  });

  it("resolves three distinct purpose buckets without exposing env names downstream", () => {
    expect(
      resolveSupabaseObjectStorageConfig(enabledEnvironment)
    ).toEqual({
      projectUrl: "https://project.example",
      serviceRoleKey:
        enabledEnvironment.SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY,
      buckets: {
        source: "toon-source-assets",
        derived: "toon-derived-assets",
        export: "toon-export-assets",
      },
      timeoutMs: 15_000,
      maximumAssetBytes: 64 * 1_024 * 1_024,
      maximumControlMetadataBytes: 4 * 1_024,
      maximumResponseBytes: 64 * 1_024,
    });
  });

  it.each([
    {
      ...enabledEnvironment,
      SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY: undefined,
    },
    {
      ...enabledEnvironment,
      SUPABASE_OBJECT_STORAGE_URL: "http://project.example",
    },
    {
      ...enabledEnvironment,
      SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET:
        enabledEnvironment.SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET,
    },
    {
      ...enabledEnvironment,
      SUPABASE_OBJECT_STORAGE_ENABLED: "yes",
    },
  ])("fails closed for incomplete or unsafe explicit configuration", (environment) => {
    expect(() =>
      resolveSupabaseObjectStorageConfig(environment)
    ).toThrow(SupabaseObjectStorageConfigurationError);
  });
});

import { describe, expect, it } from "vitest";

import {
  PrivateObjectStorageConfigurationError,
  privateObjectStorageRoutingFingerprint,
  resolvePrivateObjectStoragePlan,
} from "./private-object-storage.config";

const supabaseEnvironment = {
  SUPABASE_OBJECT_STORAGE_ENABLED: "true",
  SUPABASE_OBJECT_STORAGE_URL: "https://project.example/",
  SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY:
    "test-service-role-key-with-at-least-thirty-two-characters",
  SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET: "legacy-source-assets",
  SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET: "legacy-derived-assets",
  SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET: "legacy-export-assets",
} as const;

const routing = {
  source: "cloudflare-r2",
  derived: "supabase",
  export: "backblaze-b2",
} as const;
const routedEnvironment = {
  ...supabaseEnvironment,
  PRIVATE_OBJECT_STORAGE_ENABLED: "true",
  PRIVATE_OBJECT_STORAGE_SOURCE_PROVIDER: routing.source,
  PRIVATE_OBJECT_STORAGE_DERIVED_PROVIDER: routing.derived,
  PRIVATE_OBJECT_STORAGE_EXPORT_PROVIDER: routing.export,
  PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT:
    privateObjectStorageRoutingFingerprint(routing),
  R2_OBJECT_STORAGE_ENABLED: "true",
  R2_OBJECT_STORAGE_ENDPOINT: "https://account.r2.example/",
  R2_OBJECT_STORAGE_REGION: "auto",
  R2_OBJECT_STORAGE_ACCESS_KEY_ID: "r2-access-key",
  R2_OBJECT_STORAGE_SECRET_ACCESS_KEY: "r2-secret-key-with-enough-length",
  R2_OBJECT_STORAGE_SOURCE_BUCKET: "r2-source-assets",
  R2_OBJECT_STORAGE_DERIVED_BUCKET: "r2-derived-assets",
  R2_OBJECT_STORAGE_EXPORT_BUCKET: "r2-export-assets",
  R2_OBJECT_STORAGE_PRIVATE_BUCKETS_CONFIRMED: "true",
  B2_OBJECT_STORAGE_ENABLED: "true",
  B2_OBJECT_STORAGE_ENDPOINT: "https://s3.us-west.example/",
  B2_OBJECT_STORAGE_REGION: "us-west-004",
  B2_OBJECT_STORAGE_ACCESS_KEY_ID: "b2-access-key",
  B2_OBJECT_STORAGE_SECRET_ACCESS_KEY: "b2-secret-key-with-enough-length",
  B2_OBJECT_STORAGE_SOURCE_BUCKET: "b2-source-assets",
  B2_OBJECT_STORAGE_DERIVED_BUCKET: "b2-derived-assets",
  B2_OBJECT_STORAGE_EXPORT_BUCKET: "b2-export-assets",
  B2_OBJECT_STORAGE_PRIVATE_BUCKETS_CONFIRMED: "true",
} as const;

describe("private object storage configuration", () => {
  it("preserves the legacy Supabase-only plan when routing is not configured", () => {
    expect(resolvePrivateObjectStoragePlan({})).toBeNull();
    expect(resolvePrivateObjectStoragePlan(supabaseEnvironment)).toMatchObject({
      compatibilityMode: "legacy-supabase",
      routing: {
        source: "supabase",
        derived: "supabase",
        export: "supabase",
      },
      supabase: {
        projectUrl: "https://project.example",
      },
      s3: {},
    });
  });

  it("resolves an explicit purpose-routed R2, Supabase, and B2 plan", () => {
    const plan = resolvePrivateObjectStoragePlan(routedEnvironment);

    expect(plan).toMatchObject({
      compatibilityMode: "purpose-routed",
      routing,
      supabase: {
        buckets: {
          source: "legacy-source-assets",
          derived: "legacy-derived-assets",
          export: "legacy-export-assets",
        },
      },
      s3: {
        "cloudflare-r2": {
          providerId: "cloudflare-r2",
          endpoint: "https://account.r2.example",
          region: "auto",
          buckets: {
            source: "r2-source-assets",
          },
        },
        "backblaze-b2": {
          providerId: "backblaze-b2",
          endpoint: "https://s3.us-west.example",
          region: "us-west-004",
          buckets: {
            export: "b2-export-assets",
          },
        },
      },
    });
  });
  it.each([
    {
      ...routedEnvironment,
      PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT: `sha256:${"0".repeat(64)}`,
    },
    {
      ...routedEnvironment,
      B2_OBJECT_STORAGE_ENABLED: "false",
    },
    {
      ...routedEnvironment,
      R2_OBJECT_STORAGE_ENDPOINT: "http://account.r2.example",
    },
    {
      ...routedEnvironment,
      R2_OBJECT_STORAGE_DERIVED_BUCKET:
        routedEnvironment.R2_OBJECT_STORAGE_SOURCE_BUCKET,
    },
    {
      ...routedEnvironment,
      R2_OBJECT_STORAGE_PRIVATE_BUCKETS_CONFIRMED: "false",
    },
  ])("fails closed for unsafe routed storage configuration", (environment) => {
    expect(() => resolvePrivateObjectStoragePlan(environment)).toThrow(
      PrivateObjectStorageConfigurationError,
    );
  });

  it("makes routing changes explicit through a stable fingerprint", () => {
    expect(privateObjectStorageRoutingFingerprint(routing)).toMatch(
      /^sha256:[a-f0-9]{64}$/u,
    );
    expect(
      privateObjectStorageRoutingFingerprint({
        ...routing,
        export: "cloudflare-r2",
      }),
    ).not.toBe(privateObjectStorageRoutingFingerprint(routing));
  });
});

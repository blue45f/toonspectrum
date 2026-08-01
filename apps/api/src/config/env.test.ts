import { describe, expect, it, vi } from "vitest";

import { validateEnv } from "./env";

describe("production domain environment validation", () => {
  it("accepts the canonical Toon Studio host and OAuth/web origins", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      CANONICAL_HOST: "www.toonstudio.cloud",
      OAUTH_REDIRECT_BASE_URL: "https://www.toonstudio.cloud",
      WEB_APP_BASE_URL: "https://www.toonstudio.cloud",
      API_CORS_ALLOWED_ORIGINS:
        "https://www.toonstudio.cloud,https://toonstudio.cloud",
    }, logger)).toMatchObject({
      CANONICAL_HOST: "www.toonstudio.cloud",
      OAUTH_REDIRECT_BASE_URL: "https://www.toonstudio.cloud",
      WEB_APP_BASE_URL: "https://www.toonstudio.cloud",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns non-fatally when CANONICAL_HOST contains a scheme or path", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      CANONICAL_HOST: "https://www.toonstudio.cloud/path",
    }, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("fails closed for missing or weak production session HMAC secrets", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(() =>
      validateEnv({ NODE_ENV: "production" }, logger),
    ).toThrow(/AUTH_SESSION_SECRET/u);
    expect(() =>
      validateEnv(
        {
          NODE_ENV: "production",
          AUTH_SESSION_SECRET: "too-short",
        },
        logger,
      ),
    ).toThrow(/32 UTF-8 bytes/u);
    expect(JSON.stringify(logger)).not.toContain("too-short");
  });

  it("requires a strong state secret only when production OAuth state is used", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const sessionSecret =
      "production-session-secret-with-at-least-32-bytes";

    expect(
      validateEnv(
        {
          NODE_ENV: "production",
          AUTH_SESSION_SECRET: sessionSecret,
          GOOGLE_OAUTH_CLIENT_ID: "public-google-client-id",
        },
        logger,
      ),
    ).toMatchObject({
      AUTH_SESSION_SECRET: sessionSecret,
    });
    expect(() =>
      validateEnv(
        {
          NODE_ENV: "production",
          AUTH_SESSION_SECRET: sessionSecret,
          GOOGLE_OAUTH_CLIENT_SECRET: "configured-code-flow-secret",
        },
        logger,
      ),
    ).toThrow(/AUTH_STATE_SECRET/u);
    expect(
      validateEnv(
        {
          NODE_ENV: "production",
          AUTH_SESSION_SECRET: sessionSecret,
          AUTH_STATE_SECRET:
            "production-state-secret-with-at-least-32-bytes",
          GOOGLE_OAUTH_CLIENT_SECRET: "configured-code-flow-secret",
        },
        logger,
      ),
    ).toMatchObject({
      AUTH_SESSION_SECRET: sessionSecret,
    });
  });
});

describe("authentication boundary environment validation", () => {
  it("accepts explicit auth proxy/rate-limit boundary values", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false",
          AUTH_TRUSTED_PROXY_ENABLED: "true",
          AUTH_TRUSTED_PROXY_IPS: "203.0.113.10,2001:db8::10",
          AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
          AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "8",
        },
        logger,
      ),
    ).toMatchObject({
      AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false",
      AUTH_TRUSTED_PROXY_ENABLED: "true",
      AUTH_TRUSTED_PROXY_IPS: "203.0.113.10,2001:db8::10",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "8",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns without fatal error for malformed auth boundary values", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "TRUE",
          AUTH_TRUSTED_PROXY_ENABLED: "enabled",
          AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forward-for",
          AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "0",
        },
        logger,
      ),
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe("Studio AI quota environment validation", () => {
  it("accepts positive distributed quota overrides", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    const result = validateEnv(
      {
        NODE_ENV: "test",
        STUDIO_AI_DAILY_REQUEST_LIMIT: "25",
        STUDIO_AI_DAILY_TOKEN_LIMIT: "75000",
      },
      logger
    );

    expect(result).toMatchObject({
      STUDIO_AI_DAILY_REQUEST_LIMIT: "25",
      STUDIO_AI_DAILY_TOKEN_LIMIT: "75000",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns non-fatally for zero or nonnumeric quota values", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          STUDIO_AI_DAILY_REQUEST_LIMIT: "0",
          STUDIO_AI_DAILY_TOKEN_LIMIT: "unlimited",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("Studio live cluster environment validation", () => {
  it("accepts explicit PostgreSQL adapter settings without logging the direct URL", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    const result = validateEnv(
      {
        NODE_ENV: "test",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@ep-direct.example.net/toonspectrum?sslmode=require",
        STUDIO_LIVE_POSTGRES_POOL_MAX: "4",
        STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED: "false",
      },
      logger
    );

    expect(result).toMatchObject({
      STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
      STUDIO_LIVE_POSTGRES_POOL_MAX: "4",
      STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED: "false",
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(
      JSON.stringify({
        errors: logger.error.mock.calls,
        warnings: logger.warn.mock.calls,
      })
    ).not.toContain("artist:secret");
  });

  it("warns non-fatally for an unsupported adapter mode or unbounded pool", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          STUDIO_LIVE_CLUSTER_ADAPTER: "redis",
          STUDIO_LIVE_POSTGRES_POOL_MAX: "1000",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("warns non-fatally for a non-canonical inline binary rollout switch", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED: "TRUE",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("Studio realtime ticket environment validation", () => {
  it("accepts a complete short-lived Cloudflare signer configuration", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    const result = validateEnv(
      {
        NODE_ENV: "test",
        STUDIO_REALTIME_TICKET_ENABLED: "true",
        STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID:
          "cloudflare-realtime-v1",
        STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER:
          "toonspectrum-api",
        STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE:
          "toonspectrum-realtime",
        STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET:
          "test-only-ticket-secret-with-at-least-32-bytes",
        STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS: "120",
        STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS: "14400",
      },
      logger,
    );

    expect(result).toMatchObject({
      STUDIO_REALTIME_TICKET_ENABLED: "true",
      STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID:
        "cloudflare-realtime-v1",
      STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS: "120",
      STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS: "14400",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns without reflecting a weak Cloudflare ticket secret", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const secret = "weak-ticket-secret";

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: secret,
        },
        logger,
      ),
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(secret);
  });
});

describe("Purpose-specific infrastructure environment validation", () => {
  it("accepts bounded private Supabase buckets and Upstash coordination", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    const result = validateEnv(
      {
        NODE_ENV: "test",
        SUPABASE_OBJECT_STORAGE_ENABLED: "true",
        SUPABASE_OBJECT_STORAGE_URL: "https://project.supabase.co",
        SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY:
          "test-only-service-role-key-with-at-least-32-bytes",
        SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET: "studio-source-assets-v1",
        SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET:
          "studio-derived-assets-v1",
        SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET: "studio-exports-v1",
        SUPABASE_OBJECT_STORAGE_TIMEOUT_MS: "15000",
        SUPABASE_OBJECT_STORAGE_MAXIMUM_ASSET_BYTES: "67108864",
        SUPABASE_OBJECT_STORAGE_MAXIMUM_CONTROL_METADATA_BYTES: "4096",
        SUPABASE_OBJECT_STORAGE_MAXIMUM_RESPONSE_BYTES: "65536",
        UPSTASH_COORDINATION_ENABLED: "true",
        UPSTASH_COORDINATION_REST_URL:
          "https://coordination.example.upstash.io",
        UPSTASH_COORDINATION_REST_TOKEN:
          "test-only-upstash-rest-token",
        UPSTASH_COORDINATION_KEY_HASH_SECRET:
          "test-only-key-hash-secret-with-at-least-32-bytes",
        UPSTASH_COORDINATION_NAMESPACE: "toonspectrum:production",
        UPSTASH_COORDINATION_TIMEOUT_MS: "2500",
        UPSTASH_COORDINATION_MAX_REQUEST_BYTES: "16384",
        UPSTASH_COORDINATION_MAX_RESPONSE_BYTES: "32768",
      },
      logger
    );

    expect(result).toMatchObject({
      SUPABASE_OBJECT_STORAGE_ENABLED: "true",
      SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET: "studio-source-assets-v1",
      UPSTASH_COORDINATION_ENABLED: "true",
      UPSTASH_COORDINATION_NAMESPACE: "toonspectrum:production",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns without reflecting storage or coordination secrets", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const storageSecret = "short-storage-secret";
    const coordinationSecret = "short-coordination-secret";

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          SUPABASE_OBJECT_STORAGE_URL: "http://project.supabase.co",
          SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY: storageSecret,
          UPSTASH_COORDINATION_REST_URL: "http://localhost:8079",
          UPSTASH_COORDINATION_KEY_HASH_SECRET: coordinationSecret,
          UPSTASH_COORDINATION_TIMEOUT_MS: "999999",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      storageSecret
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      coordinationSecret
    );
  });
});

describe("Catalog, asset admission, and KMAS environment validation", () => {
  it("accepts the complete bounded operational surface", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          CI: "true",
          TZ: "Asia/Seoul",
          WEBDEX_PG_POOL_MAX: "3",
          WEBDEX_PG_IDLE_MS: "10000",
          WEBDEX_CATALOG_FILE: "apps/api/data/catalog.json.gz",
          WEBDEX_CATALOG_GZ: "apps/api/data/catalog-legacy.json.gz",
          WEBDEX_CATALOG_FORCE_DB: "0",
          WEBDEX_SOURCE_IDS: "all",
          CATALOG_INGEST_MODE: "off",
          CATALOG_INGEST_INTERVAL_SECONDS: "1800",
          CATALOG_INGEST_TIMEOUT_MS: "600000",
          CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB: "64",
          CATALOG_CRAWL_SCRIPT: "scripts/crawl.mjs",
          CATALOG_INGEST_MIN_RETAIN_RATIO: "0.6",
          CATALOG_REFRESH_POLL_SECONDS: "0",
          CATALOG_SNAPSHOT_RETENTION: "5",
          COVER_IMAGE_POLICY: "proxy",
          STUDIO_RASTER_ASSET_ADMISSION:
            "verified-renderer-handoff-v1",
          STUDIO_WORK_ASSET_ADMISSION:
            "enable-immutable-readonly-work-assets-v1",
          GEMINI_API_KEY: "test-gemini-key",
          KMAS_PRV_KEY: "test-kmas-private-key",
          KMAS_BASE_URL: "https://www.kmas.or.kr",
          KMAS_MERGE_ON_ACCESS: "1",
          KMAS_MERGE_ON_ACCESS_LIMIT: "24",
          KMAS_MERGE_ON_ACCESS_TTL_MS: "300000",
          KMAS_LOOKUP_CONCURRENCY: "3",
          KMAS_LOOKUP_CACHE_TTL_MS: "86400000",
          KMAS_LIVE_SEARCH: "0",
          KMAS_CATALOG_SOURCE: "snapshot",
          KMAS_RESPONSE_ENRICH_LIMIT: "12",
          KMAS_RESPONSE_IMAGE_LIMIT: "80",
        },
        logger
      )
    ).toMatchObject({
      TZ: "Asia/Seoul",
      CATALOG_INGEST_MODE: "off",
      COVER_IMAGE_POLICY: "proxy",
      KMAS_CATALOG_SOURCE: "snapshot",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("rejects unsafe or out-of-budget operational values without reflecting secrets", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const kmasSecret = "private-kmas-value";

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          WEBDEX_CATALOG_FILE: " catalog.json.gz ",
          CATALOG_INGEST_INTERVAL_SECONDS: "5",
          CATALOG_INGEST_MIN_RETAIN_RATIO: "1.5",
          CATALOG_REFRESH_POLL_SECONDS: "-1",
          STUDIO_WORK_ASSET_ADMISSION: "skip-validation",
          KMAS_PRV_KEY: kmasSecret,
          KMAS_BASE_URL: "http://www.kmas.or.kr",
          KMAS_LOOKUP_CONCURRENCY: "64",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(kmasSecret);
  });
});

describe("Studio voice TURN environment validation", () => {
  it("accepts the explicit recurring-cost voice feature switch", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      STUDIO_LIVE_VOICE_ENABLED: "false",
    }, logger)).toMatchObject({ STUDIO_LIVE_VOICE_ENABLED: "false" });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("accepts TURN settings while keeping the shared secret out of diagnostics", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const secret = "voice-turn-secret-at-least-thirty-two-characters";

    const result = validateEnv(
      {
        NODE_ENV: "test",
        STUDIO_VOICE_STUN_URLS: "stun:voice.example.com:3478",
        STUDIO_VOICE_TURN_URLS:
          "turn:voice.example.com:3478?transport=udp,turns:voice.example.com:5349?transport=tcp",
        STUDIO_VOICE_TURN_SHARED_SECRET: secret,
        STUDIO_VOICE_TURN_REQUIRED: "true",
        STUDIO_VOICE_TURN_TTL_SECONDS: "900",
      },
      logger
    );

    expect(result).toMatchObject({
      STUDIO_VOICE_TURN_REQUIRED: "true",
      STUDIO_VOICE_TURN_TTL_SECONDS: "900",
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(JSON.stringify(logger)).not.toContain(secret);
  });

  it("warns non-fatally for a weak shared secret in the generic env audit", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      STUDIO_VOICE_TURN_SHARED_SECRET: "weak",
    }, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";

import {
  BackendCapabilityWorkerConfigurationError,
  resolveBackendCapabilityWorkerConfig,
} from "./backend-capability-worker.config";

describe("backend capability worker configuration", () => {
  it("stays disabled unless the worker boundary is explicit", () => {
    expect(resolveBackendCapabilityWorkerConfig({})).toBeNull();
    expect(
      resolveBackendCapabilityWorkerConfig({
        BACKEND_CAPABILITY_WORKER_ENABLED: "false",
      }),
    ).toBeNull();
  });

  it("uses bounded conservative defaults when enabled", () => {
    expect(
      resolveBackendCapabilityWorkerConfig({
        BACKEND_CAPABILITY_WORKER_ENABLED: "true",
      }),
    ).toEqual({
      maximumSourceBytes: 16_777_216,
      maximumSourcePixels: 16_777_216,
      maximumOutputPixels: 4_194_304,
      maximumOutputBytes: 16_777_216,
      signedUrlTtlSeconds: 60,
    });
  });

  it("rejects invalid or unbounded budgets instead of silently defaulting", () => {
    expect(() =>
      resolveBackendCapabilityWorkerConfig({
        BACKEND_CAPABILITY_WORKER_ENABLED: "true",
        BACKEND_THUMBNAIL_WORKER_MAXIMUM_OUTPUT_PIXELS: "0",
      }),
    ).toThrow(BackendCapabilityWorkerConfigurationError);
    expect(() =>
      resolveBackendCapabilityWorkerConfig({
        BACKEND_CAPABILITY_WORKER_ENABLED: "true",
        BACKEND_THUMBNAIL_WORKER_SIGNED_URL_TTL_SECONDS: "301",
      }),
    ).toThrow(BackendCapabilityWorkerConfigurationError);
  });
});

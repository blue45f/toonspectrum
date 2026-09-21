import { describe, expect, it } from "vitest";

import { isOptionalStudioPreviewApiError, isStudioStaticPreviewReadinessUnavailable } from "./studio-verify-preview-errors.mjs";

const preview = "http://127.0.0.1:54123/studio";

describe("static preview error boundaries", () => {
  it("recognizes an optional backend only at the spawned preview origin", () => {
    expect(isOptionalStudioPreviewApiError("502 http://127.0.0.1:54123/api/auth/session", preview)).toBe(true);
    expect(isOptionalStudioPreviewApiError("502 http://127.0.0.1:54123/api/health/ready", preview)).toBe(true);
    expect(isOptionalStudioPreviewApiError("403 @ http://127.0.0.1:54123/api/studio-ai/status", preview)).toBe(true);
    expect(isOptionalStudioPreviewApiError("403 @ http://127.0.0.1:54123/api/analytics/traffic/page-view", preview)).toBe(true);
  });

  it.each([
    "Failed to load resource: the server responded with a status of 502",
    "403 https://cdn.example/font.woff2",
    "502 http://127.0.0.1:54124/api/auth/session",
    "502 http://127.0.0.1:54124/api/health/ready",
    "502 http://127.0.0.1:54123/api/health/ready-broken",
    "502 http://127.0.0.1:54123/api/health/live",
    "502 https://www.toonstudio.cloud/api/health/ready",
    "502 http://127.0.0.1:54123/api/auth/session-broken",
    "500 http://127.0.0.1:54123/api/creator/works",
    "500 http://127.0.0.1:54123/api/analytics/traffic/export",
    "502 http://127.0.0.1:54123/assets/filter-worker.js",
    "500 https://www.toonstudio.cloud/api/auth/session",
  ])("retains the diagnostic: %s", (message) => {
    expect(isOptionalStudioPreviewApiError(message, preview)).toBe(false);
  });

  it("never grants the static-preview exception to a production origin", () => {
    expect(isOptionalStudioPreviewApiError(
      "500 https://www.toonstudio.cloud/api/auth/session",
      "https://www.toonstudio.cloud/studio",
    )).toBe(false);
    expect(isOptionalStudioPreviewApiError(
      "502 https://www.toonstudio.cloud/api/health/ready",
      "https://www.toonstudio.cloud/studio",
    )).toBe(false);
  });
});

describe("static-only readiness diagnostics", () => {
  it("recognizes only the exact spawned-origin 502 observation", () => {
    expect(isStudioStaticPreviewReadinessUnavailable("502 http://127.0.0.1:54123/api/health/ready", preview)).toBe(true);
    expect(isStudioStaticPreviewReadinessUnavailable("Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ http://127.0.0.1:54123/api/health/ready", preview)).toBe(true);
  });
  it.each([
    "500 http://127.0.0.1:54123/api/health/ready", "503 http://127.0.0.1:54123/api/health/ready",
    "502 http://127.0.0.1:54123/api/health/ready-broken", "502 http://127.0.0.1:54124/api/health/ready",
    "502 http://127.0.0.1:54123/assets/editor.js", "502 https://www.toonstudio.cloud/api/health/ready",
    "502 http://127.0.0.1:54123/api/health/ready?other=1", "render failure @ http://127.0.0.1:54123/api/health/ready",
  ])("does not hide other failure evidence: %s", (message) => {
    expect(isStudioStaticPreviewReadinessUnavailable(message, preview)).toBe(false);
  });
  it("never applies at a production or non-loopback preview origin", () => {
    expect(isStudioStaticPreviewReadinessUnavailable("502 https://www.toonstudio.cloud/api/health/ready", "https://www.toonstudio.cloud/studio")).toBe(false);
    expect(isStudioStaticPreviewReadinessUnavailable("502 http://localhost:54123/api/health/ready", "http://localhost:54123/studio")).toBe(false);
  });
});

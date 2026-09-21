import { describe, expect, it } from "vitest";

import { isStaticPreviewReadinessResponse, isStaticPreviewReadinessUnavailable } from "./studio-preview-readiness";

const origin = "http://127.0.0.1:5291", preview = `${origin}/studio/canvas`;
const message = `Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ ${origin}/api/health/ready`;
describe("static-only readiness diagnostics", () => {
  it("records the exact local 502 without claiming an operational API", () => {
    expect(isStaticPreviewReadinessUnavailable(message, preview)).toBe(true);
    expect(isStaticPreviewReadinessResponse(502, `${origin}/api/health/ready`, preview)).toBe(true);
  });
  it.each(["https://www.toonstudio.cloud/studio", "https://127.0.0.1:5291/studio", "http://localhost:5291/studio", "http://127.0.0.1/studio", "not a URL"])("rejects non-isolated origins %s", (url) => {
    expect(isStaticPreviewReadinessUnavailable(message, url)).toBe(false);
    expect(isStaticPreviewReadinessResponse(502, `${origin}/api/health/ready`, url)).toBe(false);
  });
  it.each(["/api/health/live", "/api/health/ready?other=true", "/api/health/ready/", "/assets/editor.js"])("preserves unrelated failures %s", (path) => {
    expect(isStaticPreviewReadinessUnavailable(message.replace("/api/health/ready", path), preview)).toBe(false);
    expect(isStaticPreviewReadinessResponse(502, `${origin}${path}`, preview)).toBe(false);
  });
  it.each([200, 401, 403, 404, 500, 503])("never classifies other status %i as the missing static API", (status) => {
    expect(isStaticPreviewReadinessResponse(status, `${origin}/api/health/ready`, preview)).toBe(false);
  });
});

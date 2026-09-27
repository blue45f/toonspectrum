import { describe, expect, it } from "vitest";

import { isStaticPreviewReadinessResponse, isStaticPreviewReadinessUnavailable } from "./studio-preview-readiness";

const origin = "http://127.0.0.1:5291", preview = `${origin}/studio/canvas`;
const message = `Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ ${origin}/api/health/ready`;
describe("static-only readiness diagnostics", () => {
  it.each(["/api/health/ready", "/api/health/capabilities", "/api/studio-realtime/tickets"])("records only the exact local 502 for %s without claiming an operational API", (path) => {
    expect(isStaticPreviewReadinessUnavailable(message.replace("/api/health/ready", path), preview)).toBe(true);
    expect(isStaticPreviewReadinessResponse(502, `${origin}${path}`, preview)).toBe(true);
  });
  it.each(["https://www.toonstudio.cloud/studio", "https://127.0.0.1:5291/studio", "http://localhost:5291/studio", "http://127.0.0.1/studio", "not a URL"])("rejects non-isolated origins %s", (url) => {
    expect(isStaticPreviewReadinessUnavailable(message, url)).toBe(false);
    expect(isStaticPreviewReadinessResponse(502, `${origin}/api/health/ready`, url)).toBe(false);
  });
  it.each(["/api/health/live", "/api/health/ready?other=true", "/api/health/ready/", "/api/health/capabilities?probe=1", "/api/studio-realtime/tickets/", "/api/studio-realtime/tickets?room=real", "/api/creator/works/save", "/api/studio-ai/generate", "/assets/editor.js"])("preserves unrelated failures %s", (path) => {
    expect(isStaticPreviewReadinessUnavailable(message.replace("/api/health/ready", path), preview)).toBe(false);
    expect(isStaticPreviewReadinessResponse(502, `${origin}${path}`, preview)).toBe(false);
  });
  it.each([200, 401, 403, 404, 500, 503])("never classifies other status %i as the missing static API", (status) => {
    for (const path of ["/api/health/ready", "/api/health/capabilities", "/api/studio-realtime/tickets"]) {
      expect(isStaticPreviewReadinessResponse(status, `${origin}${path}`, preview)).toBe(false);
    }
  });
  it("does not classify another local service as this verifier's API", () => {
    expect(isStaticPreviewReadinessResponse(502, "http://127.0.0.1:5292/api/studio-realtime/tickets", preview)).toBe(false);
    expect(isStaticPreviewReadinessUnavailable(message.replace(origin, "http://127.0.0.1:5292"), preview)).toBe(false);
  });
});

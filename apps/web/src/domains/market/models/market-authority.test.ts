import { describe, expect, it } from "vitest";

import {
  authoritativeMarketCacheKey,
  marketAuthorityErrorMessage,
  parseAuthoritativeMarketManifest,
} from "./market-authority";

const VALID_MANIFEST = {
  schemaVersion: 1,
  packageId: "community/template/authority-test",
  name: "권한 경계 템플릿",
  description: "서버 게시 검증 테스트",
  releaseNotes: "첫 공개",
  kind: "template",
  resourceVersion: "1.0.0",
  minimumStudioVersion: "1.0.0",
  tags: ["테스트"],
  license: "cc0-1.0",
  attributionText: "",
  containsAi: false,
  rightsConfirmed: true,
  provenance: { origin: "original", authoredByPublisher: true },
  compatibility: { engines: ["canvas2d"] },
  entries: [
    {
      id: "template/authority-test",
      kind: "template",
      name: "권한 경계 템플릿",
      delivery: {
        mode: "builtin-ref",
        runtimeRef: "studio-scene-template:authority-test",
        byteSize: 0,
        sha256: "0".repeat(64),
      },
    },
  ],
} as const;

describe("market authority", () => {
  it("requires a complete server-publishable manifest", () => {
    expect(parseAuthoritativeMarketManifest(" ").state).toBe("empty");
    expect(parseAuthoritativeMarketManifest("{ invalid").state).toBe("invalid");
    expect(parseAuthoritativeMarketManifest(JSON.stringify({
      ...VALID_MANIFEST,
      rightsConfirmed: false,
    })).state).toBe("invalid");

    const parsed = parseAuthoritativeMarketManifest(JSON.stringify(VALID_MANIFEST));
    expect(parsed.state).toBe("valid");
    if (parsed.state === "valid") {
      expect(parsed.manifest.packageId).toBe(VALID_MANIFEST.packageId);
      expect(parsed.manifest.resourceVersion).toBe("1.0.0");
    }
  });

  it("isolates authoritative cache entries from the legacy mixed cache generation", () => {
    const key = authoritativeMarketCacheKey(JSON.stringify({ limit: 12, sort: "newest" }));
    expect(key).toBe('authority:v2:{"limit":12,"sort":"newest"}');
  });

  it("keeps actionable server errors and falls back for opaque failures", () => {
    expect(marketAuthorityErrorMessage(new Error("게시 거절"), "fallback")).toBe("게시 거절");
    expect(marketAuthorityErrorMessage(null, "fallback")).toBe("fallback");
  });
});

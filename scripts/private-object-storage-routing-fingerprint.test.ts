import { describe, expect, it } from "vitest";

import {
  renderRoutingFingerprint,
  resolveRoutingFingerprintInput,
} from "./private-object-storage-routing-fingerprint.mts";

describe("private object storage routing fingerprint CLI", () => {
  it("resolves a complete routing from flags and emits the canonical assignment", () => {
    const routing = resolveRoutingFingerprintInput([
      "--source=cloudflare-r2",
      "--derived",
      "supabase",
      "--export=backblaze-b2",
    ], {});

    expect(routing).toEqual({
      source: "cloudflare-r2",
      derived: "supabase",
      export: "backblaze-b2",
    });
    expect(renderRoutingFingerprint(routing)).toMatch(
      /^PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT=sha256:[a-f0-9]{64}$/u,
    );
  });

  it("uses environment values and rejects incomplete or unknown providers", () => {
    const environment = {
      PRIVATE_OBJECT_STORAGE_SOURCE_PROVIDER: "cloudflare-r2",
      PRIVATE_OBJECT_STORAGE_DERIVED_PROVIDER: "cloudflare-r2",
      PRIVATE_OBJECT_STORAGE_EXPORT_PROVIDER: "backblaze-b2",
    } as const;
    expect(resolveRoutingFingerprintInput([], environment)).toEqual({
      source: "cloudflare-r2",
      derived: "cloudflare-r2",
      export: "backblaze-b2",
    });
    expect(() => resolveRoutingFingerprintInput([
      "--source=unknown",
      "--derived=supabase",
      "--export=backblaze-b2",
    ], {})).toThrow(/source provider/u);
  });
});

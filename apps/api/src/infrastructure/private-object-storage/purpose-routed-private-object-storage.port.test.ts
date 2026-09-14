import { describe, expect, it, vi } from "vitest";

import {
  PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
  type PrivateObjectPurpose,
  type PrivateObjectReference,
} from "./private-object-storage.contract";
import type { PrivateObjectStoragePort } from "./private-object-storage.port";
import {
  PurposeRoutedPrivateObjectStoragePort,
  type PrivateObjectStorageProviderId,
} from "./purpose-routed-private-object-storage.port";

const ALL_PURPOSES = ["source", "derived", "export"] as const;

function reference(
  purpose: PrivateObjectPurpose,
): PrivateObjectReference {
  const hash = purpose === "source"
    ? "a".repeat(64)
    : purpose === "derived"
      ? "b".repeat(64)
      : "c".repeat(64);
  return {
    contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
    purpose,
    digest: `sha256:${hash}`,
    objectPath: `sha256/${hash.slice(0, 2)}/${hash}`,
    byteLength: 3,
    contentType: "image/png",
  };
}

function createPort() {
  const port = {
    verifyPrivatePurposeBuckets: vi.fn(
      async (_options = {}, purposes = ALL_PURPOSES) => ({
        ready: true as const,
        privatePurposeBuckets: new Set(purposes).size,
      }),
    ),
    uploadImmutable: vi.fn(async (input) => reference(input.purpose)),
    createSignedReadUrl: vi.fn(async () => ({
      url: "https://download.example/signed",
      expiresAtEpochMs: 1_800_000_060_000,
    })),
    deleteGeneratedObject: vi.fn(async () => undefined),
  } satisfies PrivateObjectStoragePort;
  return port;
}

const routing = {
  source: "cloudflare-r2",
  derived: "supabase",
  export: "supabase",
} as const;
describe("purpose-routed private object storage", () => {
  it("groups readiness checks by provider without probing unused buckets", async () => {
    const r2 = createPort();
    const supabase = createPort();
    const client = new PurposeRoutedPrivateObjectStoragePort(
      routing,
      new Map<PrivateObjectStorageProviderId, PrivateObjectStoragePort>([
        ["cloudflare-r2", r2],
        ["supabase", supabase],
      ]),
    );

    await expect(client.verifyPrivatePurposeBuckets()).resolves.toEqual({
      ready: true,
      privatePurposeBuckets: 3,
    });
    expect(r2.verifyPrivatePurposeBuckets).toHaveBeenCalledWith(
      {},
      ["source"],
    );
    expect(supabase.verifyPrivatePurposeBuckets).toHaveBeenCalledWith(
      {},
      ["derived", "export"],
    );
  });

  it("routes object operations by purpose and preserves the provider-neutral contract", async () => {
    const r2 = createPort();
    const supabase = createPort();
    const client = new PurposeRoutedPrivateObjectStoragePort(
      routing,
      new Map<PrivateObjectStorageProviderId, PrivateObjectStoragePort>([
        ["cloudflare-r2", r2],
        ["supabase", supabase],
      ]),
    );
    const sourceUpload = {
      purpose: "source" as const,
      contentType: "image/png" as const,
      bytes: new Uint8Array([1, 2, 3]),
      controlMetadata: {
        documentId: "work:1",
        operationId: "upload:1",
      },
    };
    const derived = reference("derived");

    await expect(client.uploadImmutable(sourceUpload)).resolves.toEqual(
      reference("source"),
    );
    await client.createSignedReadUrl({
      object: derived,
      expiresInSeconds: 60,
    });
    await client.deleteGeneratedObject({ object: derived });

    expect(r2.uploadImmutable).toHaveBeenCalledWith(sourceUpload, {});
    expect(supabase.createSignedReadUrl).toHaveBeenCalledWith(
      { object: derived, expiresInSeconds: 60 },
      {},
    );
    expect(supabase.deleteGeneratedObject).toHaveBeenCalledWith(
      { object: derived },
      {},
    );
    expect(supabase.uploadImmutable).not.toHaveBeenCalled();
  });

  it("fails closed when a routed provider is not configured", () => {
    const r2 = createPort();
    expect(
      () => new PurposeRoutedPrivateObjectStoragePort(
        routing,
        new Map<PrivateObjectStorageProviderId, PrivateObjectStoragePort>([
          ["cloudflare-r2", r2],
        ]),
      ),
    ).toThrow(expect.objectContaining({
      code: "PROVIDER_NOT_CONFIGURED",
    }));
  });

  it("rejects empty readiness requests instead of reporting a false ready state", async () => {
    const r2 = createPort();
    const supabase = createPort();
    const client = new PurposeRoutedPrivateObjectStoragePort(
      routing,
      new Map<PrivateObjectStorageProviderId, PrivateObjectStoragePort>([
        ["cloudflare-r2", r2],
        ["supabase", supabase],
      ]),
    );

    await expect(
      client.verifyPrivatePurposeBuckets({}, []),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(r2.verifyPrivatePurposeBuckets).not.toHaveBeenCalled();
    expect(supabase.verifyPrivatePurposeBuckets).not.toHaveBeenCalled();
  });
});

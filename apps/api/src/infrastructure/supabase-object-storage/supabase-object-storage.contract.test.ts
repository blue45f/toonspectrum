import { describe, expect, it } from "vitest";

import {
  SupabaseObjectControlMetadataSchema,
  SupabaseObjectReferenceSchema,
  UploadSupabaseObjectSchema,
} from "./supabase-object-storage.contract";

describe("Supabase object storage contract", () => {
  it("accepts exact byte uploads with bounded, non-content control metadata", () => {
    expect(
      UploadSupabaseObjectSchema.safeParse({
        purpose: "source",
        contentType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
        controlMetadata: {
          documentId: "work:123",
          operationId: "upload:456",
          labels: { role: "line-art", revision: 7, canonical: true },
        },
      }).success
    ).toBe(true);
  });

  it("rejects arbitrary fields, MIME parameters, and unbounded labels", () => {
    expect(
      UploadSupabaseObjectSchema.safeParse({
        purpose: "source",
        contentType: "image/png; charset=utf-8",
        bytes: new Uint8Array([1]),
        controlMetadata: {
          documentId: "work:123",
          operationId: "upload:456",
        },
      }).success
    ).toBe(false);
    expect(
      SupabaseObjectControlMetadataSchema.safeParse({
        documentId: "work:123",
        operationId: "upload:456",
        labels: Object.fromEntries(
          Array.from({ length: 17 }, (_, index) => [
            `label${index}`,
            index,
          ])
        ),
      }).success
    ).toBe(false);
    expect(
      UploadSupabaseObjectSchema.safeParse({
        purpose: "source",
        contentType: "image/png",
        bytes: new Uint8Array([1]),
        controlMetadata: {
          documentId: "work:123",
          operationId: "upload:456",
        },
        public: true,
      }).success
    ).toBe(false);
  });

  it("accepts only canonical SHA-256-shaped references", () => {
    const hash = "a".repeat(64);
    expect(
      SupabaseObjectReferenceSchema.safeParse({
        contractVersion: "toonspectrum.supabase-object-storage.v1",
        purpose: "derived",
        digest: `sha256:${hash}`,
        objectPath: `sha256/aa/${hash}`,
        byteLength: 128,
        contentType: "image/webp",
      }).success
    ).toBe(true);
    expect(
      SupabaseObjectReferenceSchema.safeParse({
        contractVersion: "toonspectrum.supabase-object-storage.v1",
        purpose: "derived",
        digest: "md5:unsafe",
        objectPath: "custom/path.png",
        byteLength: 128,
        contentType: "image/webp",
      }).success
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
  PRIVATE_OBJECT_STORAGE_LEGACY_CONTRACT_VERSION,
  PrivateObjectReferenceSchema,
  isLocatedPrivateObjectReference,
  locatePrivateObjectReference,
  samePrivateObjectContent,
  unlocatePrivateObjectReference,
} from "./private-object-storage.contract";

const hash = "a".repeat(64);
const legacy = {
  contractVersion: PRIVATE_OBJECT_STORAGE_LEGACY_CONTRACT_VERSION,
  purpose: "source" as const,
  digest: `sha256:${hash}` as const,
  objectPath: `sha256/aa/${hash}` as const,
  byteLength: 128,
  contentType: "image/png",
};

describe("private object storage location contract", () => {
  it("운영에 저장된 v1·v2 참조의 식별자와 파일 경로를 브랜드 변경 후에도 보존한다", () => {
    const deployedV1 = {
      ...legacy,
      contractVersion: "toonspectrum.supabase-object-storage.v1",
    };
    const deployedV2 = {
      ...deployedV1,
      contractVersion: "toonspectrum.private-object-storage.v2",
      providerId: "cloudflare-r2",
    };
    const brandedV2 = {
      ...deployedV1,
      contractVersion: "toonstudio.private-object-storage.v2",
      providerId: "cloudflare-r2",
    };
    expect(PrivateObjectReferenceSchema.parse(deployedV1)).toEqual(deployedV1);
    expect(PrivateObjectReferenceSchema.parse(deployedV2)).toEqual(deployedV2);
    expect(PrivateObjectReferenceSchema.parse(brandedV2)).toEqual(brandedV2);
    expect(isLocatedPrivateObjectReference(PrivateObjectReferenceSchema.parse(brandedV2))).toBe(true);
    expect(unlocatePrivateObjectReference(PrivateObjectReferenceSchema.parse(deployedV2)))
      .toEqual(deployedV1);
  });

  it("accepts legacy references throughout the additive migration", () => {
    const parsed = PrivateObjectReferenceSchema.parse(legacy);
    expect(isLocatedPrivateObjectReference(parsed)).toBe(false);
    expect(unlocatePrivateObjectReference(parsed)).toEqual(legacy);
  });

  it("wraps immutable content with an exact durable provider locator", () => {
    const located = locatePrivateObjectReference("cloudflare-r2", legacy);

    expect(located).toEqual({
      ...legacy,
      contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
      providerId: "cloudflare-r2",
    });
    expect(isLocatedPrivateObjectReference(located)).toBe(true);
    expect(unlocatePrivateObjectReference(located)).toEqual(legacy);
    expect(samePrivateObjectContent(located, legacy)).toBe(true);
  });

  it("does not allow an existing locator to be silently rewritten", () => {
    const located = locatePrivateObjectReference("cloudflare-r2", legacy);

    expect(() => locatePrivateObjectReference("supabase", located)).toThrow(
      "private object provider locator mismatch",
    );
  });

  it("rejects unknown providers and hidden fields", () => {
    expect(
      PrivateObjectReferenceSchema.safeParse({
        ...legacy,
        contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
        providerId: "unknown-free-storage",
      }).success,
    ).toBe(false);
    expect(
      PrivateObjectReferenceSchema.safeParse({
        ...legacy,
        contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
        providerId: "backblaze-b2",
        bucket: "leaked-physical-bucket",
      }).success,
    ).toBe(false);
  });

  it("treats metadata changes as different immutable content", () => {
    const located = locatePrivateObjectReference("supabase", legacy);
    expect(
      samePrivateObjectContent(located, {
        ...legacy,
        contentType: "image/webp",
      }),
    ).toBe(false);
  });
});

import { z } from "zod";

import {
  SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
  SupabaseObjectContentTypeSchema,
  SupabaseObjectControlMetadataSchema,
  SupabaseObjectPurposeSchema,
  SupabaseObjectReferenceSchema,
  SupabaseSignedReadUrlSchema,
  UploadSupabaseObjectSchema,
  type SupabaseObjectReference,
} from "../supabase-object-storage/supabase-object-storage.contract";

/**
 * Physical objects keep the original immutable metadata contract. The v2
 * reference adds only a durable provider locator around the same bytes/path so
 * routing changes never reinterpret an existing object.
 */
export const PRIVATE_OBJECT_STORAGE_LEGACY_CONTRACT_VERSION =
  SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION;
export const PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION =
  "toonspectrum.private-object-storage.v2" as const;

export const PRIVATE_OBJECT_STORAGE_PROVIDER_IDS = [
  "supabase",
  "cloudflare-r2",
  "backblaze-b2",
] as const;

export const PrivateObjectStorageProviderIdSchema = z.enum(
  PRIVATE_OBJECT_STORAGE_PROVIDER_IDS,
);

export const PrivateObjectPurposeSchema = SupabaseObjectPurposeSchema;
export const PrivateObjectControlMetadataSchema =
  SupabaseObjectControlMetadataSchema;
export const PrivateObjectContentTypeSchema = SupabaseObjectContentTypeSchema;
export const UploadPrivateObjectSchema = UploadSupabaseObjectSchema;
export const PrivateSignedReadUrlSchema = SupabaseSignedReadUrlSchema;
export const LegacyPrivateObjectReferenceSchema =
  SupabaseObjectReferenceSchema;

export const LocatedPrivateObjectReferenceSchema = z
  .object({
    contractVersion: z.literal(PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION),
    providerId: PrivateObjectStorageProviderIdSchema,
    purpose: PrivateObjectPurposeSchema,
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    objectPath: z.string().regex(/^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/u),
    byteLength: z.number().int().min(1),
    contentType: PrivateObjectContentTypeSchema,
  })
  .strict();

export const PrivateObjectReferenceSchema = z.union([
  LocatedPrivateObjectReferenceSchema,
  LegacyPrivateObjectReferenceSchema,
]);

export const CreatePrivateSignedReadUrlSchema = z
  .object({
    object: PrivateObjectReferenceSchema,
    expiresInSeconds: z.number().int().min(30).max(86_400),
  })
  .strict();

export const DeletePrivateObjectSchema = z
  .object({ object: PrivateObjectReferenceSchema })
  .strict();

export type PrivateObjectStorageProviderId = z.infer<
  typeof PrivateObjectStorageProviderIdSchema
>;
export type PrivateObjectPurpose = z.infer<typeof PrivateObjectPurposeSchema>;
export type PrivateObjectControlMetadata = z.infer<
  typeof PrivateObjectControlMetadataSchema
>;
export type UploadPrivateObject = z.infer<typeof UploadPrivateObjectSchema>;
export type LegacyPrivateObjectReference = z.infer<
  typeof LegacyPrivateObjectReferenceSchema
>;
export type LocatedPrivateObjectReference = z.infer<
  typeof LocatedPrivateObjectReferenceSchema
>;
export type PrivateObjectReference = z.infer<
  typeof PrivateObjectReferenceSchema
>;
export type CreatePrivateSignedReadUrl = z.infer<
  typeof CreatePrivateSignedReadUrlSchema
>;
export type PrivateSignedReadUrl = z.infer<
  typeof PrivateSignedReadUrlSchema
>;
export type DeletePrivateObject = z.infer<
  typeof DeletePrivateObjectSchema
>;

export function isLocatedPrivateObjectReference(
  value: PrivateObjectReference,
): value is LocatedPrivateObjectReference {
  return value.contractVersion === PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION;
}

export function unlocatePrivateObjectReference(
  value: PrivateObjectReference,
): SupabaseObjectReference {
  const object = PrivateObjectReferenceSchema.parse(value);
  return LegacyPrivateObjectReferenceSchema.parse({
    contractVersion: PRIVATE_OBJECT_STORAGE_LEGACY_CONTRACT_VERSION,
    purpose: object.purpose,
    digest: object.digest,
    objectPath: object.objectPath,
    byteLength: object.byteLength,
    contentType: object.contentType,
  });
}

export function locatePrivateObjectReference(
  providerIdValue: PrivateObjectStorageProviderId,
  value: PrivateObjectReference,
): LocatedPrivateObjectReference {
  const providerId = PrivateObjectStorageProviderIdSchema.parse(providerIdValue);
  const object = PrivateObjectReferenceSchema.parse(value);
  if (isLocatedPrivateObjectReference(object) && object.providerId !== providerId) {
    throw new Error("private object provider locator mismatch");
  }
  return LocatedPrivateObjectReferenceSchema.parse({
    contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
    providerId,
    purpose: object.purpose,
    digest: object.digest,
    objectPath: object.objectPath,
    byteLength: object.byteLength,
    contentType: object.contentType,
  });
}

export function samePrivateObjectContent(
  leftValue: PrivateObjectReference,
  rightValue: PrivateObjectReference,
): boolean {
  const left = PrivateObjectReferenceSchema.parse(leftValue);
  const right = PrivateObjectReferenceSchema.parse(rightValue);
  return left.purpose === right.purpose
    && left.digest === right.digest
    && left.objectPath === right.objectPath
    && left.byteLength === right.byteLength
    && left.contentType === right.contentType;
}

export const PRIVATE_OBJECT_STORAGE_COMPATIBILITY_NOTE =
  "location-aware-v2-over-supabase-v1-physical-objects" as const;

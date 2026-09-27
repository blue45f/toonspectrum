import { z } from "zod";

export const SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION =
  "toonspectrum.supabase-object-storage.v1" as const;

export const SupabaseObjectPurposeSchema = z.enum([
  "source",
  "derived",
  "export",
]);

const SafeControlIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u);

const ControlMetadataValueSchema = z.union([
  z.string().min(1).max(256),
  z.number().finite().safe(),
  z.boolean(),
]);

export const SupabaseObjectControlMetadataSchema = z
  .object({
    documentId: SafeControlIdentifierSchema,
    operationId: SafeControlIdentifierSchema,
    labels: z
      .record(
        z
          .string()
          .min(1)
          .max(48)
          .regex(/^[A-Za-z][A-Za-z0-9._-]*$/u),
        ControlMetadataValueSchema
      )
      .refine((labels) => Object.keys(labels).length <= 16, {
        message: "Control metadata accepts at most sixteen labels.",
      })
      .optional(),
  })
  .strict();

export const SupabaseObjectContentTypeSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u
  );

export const UploadSupabaseObjectSchema = z
  .object({
    purpose: SupabaseObjectPurposeSchema,
    contentType: SupabaseObjectContentTypeSchema,
    bytes: z.instanceof(Uint8Array),
    controlMetadata: SupabaseObjectControlMetadataSchema,
  })
  .strict();

export const SupabaseObjectReferenceSchema = z
  .object({
    contractVersion: z.literal(
      SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION
    ),
    purpose: SupabaseObjectPurposeSchema,
    digest: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/u),
    objectPath: z
      .string()
      .regex(/^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/u),
    byteLength: z.number().int().min(1),
    contentType: SupabaseObjectContentTypeSchema,
  })
  .strict();

export const CreateSupabaseSignedReadUrlSchema = z
  .object({
    object: SupabaseObjectReferenceSchema,
    expiresInSeconds: z.number().int().min(30).max(86_400),
  })
  .strict();

export const SupabaseSignedReadUrlSchema = z
  .object({
    url: z.url({ protocol: /^https$/u }),
    expiresAtEpochMs: z.number().int().positive(),
  })
  .strict();

export const DeleteSupabaseObjectSchema = z
  .object({
    object: SupabaseObjectReferenceSchema,
  })
  .strict();

export type SupabaseObjectPurpose = z.infer<
  typeof SupabaseObjectPurposeSchema
>;
export type SupabaseObjectControlMetadata = z.infer<
  typeof SupabaseObjectControlMetadataSchema
>;
export type UploadSupabaseObject = z.infer<
  typeof UploadSupabaseObjectSchema
>;
export type SupabaseObjectReference = z.infer<
  typeof SupabaseObjectReferenceSchema
>;
export type CreateSupabaseSignedReadUrl = z.infer<
  typeof CreateSupabaseSignedReadUrlSchema
>;
export type SupabaseSignedReadUrl = z.infer<
  typeof SupabaseSignedReadUrlSchema
>;
export type DeleteSupabaseObject = z.infer<
  typeof DeleteSupabaseObjectSchema
>;

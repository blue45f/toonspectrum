export {
  SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION as PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
  SupabaseObjectPurposeSchema as PrivateObjectPurposeSchema,
  SupabaseObjectControlMetadataSchema as PrivateObjectControlMetadataSchema,
  SupabaseObjectContentTypeSchema as PrivateObjectContentTypeSchema,
  UploadSupabaseObjectSchema as UploadPrivateObjectSchema,
  SupabaseObjectReferenceSchema as PrivateObjectReferenceSchema,
  CreateSupabaseSignedReadUrlSchema as CreatePrivateSignedReadUrlSchema,
  SupabaseSignedReadUrlSchema as PrivateSignedReadUrlSchema,
  DeleteSupabaseObjectSchema as DeletePrivateObjectSchema,
} from "../supabase-object-storage/supabase-object-storage.contract";

export type {
  SupabaseObjectPurpose as PrivateObjectPurpose,
  SupabaseObjectControlMetadata as PrivateObjectControlMetadata,
  UploadSupabaseObject as UploadPrivateObject,
  SupabaseObjectReference as PrivateObjectReference,
  CreateSupabaseSignedReadUrl as CreatePrivateSignedReadUrl,
  SupabaseSignedReadUrl as PrivateSignedReadUrl,
  DeleteSupabaseObject as DeletePrivateObject,
} from "../supabase-object-storage/supabase-object-storage.contract";

/**
 * The wire value intentionally remains the existing v1 string while storage is
 * routed by purpose. Pre-existing database rows stay valid. A future
 * location-aware registry migration can introduce a new wire version without
 * rewriting object bytes or weakening the immutable digest/path contract.
 */
export const PRIVATE_OBJECT_STORAGE_COMPATIBILITY_NOTE =
  "provider-neutral-port-over-supabase-v1-wire-contract" as const;

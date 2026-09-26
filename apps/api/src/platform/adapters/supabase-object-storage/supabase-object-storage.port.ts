import type {
  CreateSupabaseSignedReadUrl,
  DeleteSupabaseObject,
  SupabaseObjectPurpose,
  SupabaseObjectReference,
  SupabaseSignedReadUrl,
  UploadSupabaseObject,
} from "./supabase-object-storage.contract";

export const SUPABASE_OBJECT_STORAGE_PORT = Symbol(
  "SUPABASE_OBJECT_STORAGE_PORT"
);

export interface SupabaseObjectStorageCallOptions {
  readonly signal?: AbortSignal;
}

export interface SupabaseObjectStorageReadiness {
  readonly ready: true;
  readonly privatePurposeBuckets: number;
}

/**
 * Server-side exact-fidelity object storage only.
 *
 * The port intentionally has no public URL, overwrite, update, transform,
 * resize, re-encode, copy, move, arbitrary path, or source-delete operation.
 */
export interface SupabaseObjectStoragePort {
  verifyPrivatePurposeBuckets(
    options?: SupabaseObjectStorageCallOptions,
    purposes?: readonly SupabaseObjectPurpose[],
  ): Promise<SupabaseObjectStorageReadiness>;
  uploadImmutable(
    input: UploadSupabaseObject,
    options?: SupabaseObjectStorageCallOptions
  ): Promise<SupabaseObjectReference>;
  createSignedReadUrl(
    input: CreateSupabaseSignedReadUrl,
    options?: SupabaseObjectStorageCallOptions
  ): Promise<SupabaseSignedReadUrl>;
  deleteGeneratedObject(
    input: DeleteSupabaseObject,
    options?: SupabaseObjectStorageCallOptions
  ): Promise<void>;
}

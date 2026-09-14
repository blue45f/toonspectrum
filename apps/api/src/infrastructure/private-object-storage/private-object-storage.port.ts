import type {
  CreatePrivateSignedReadUrl,
  DeletePrivateObject,
  PrivateObjectPurpose,
  PrivateObjectReference,
  PrivateSignedReadUrl,
  UploadPrivateObject,
} from "./private-object-storage.contract";

export const PRIVATE_OBJECT_STORAGE_PORT = Symbol(
  "PRIVATE_OBJECT_STORAGE_PORT",
);

export interface PrivateObjectStorageCallOptions {
  readonly signal?: AbortSignal;
}

export interface PrivateObjectStorageReadiness {
  readonly ready: true;
  readonly privatePurposeBuckets: number;
}

export interface PrivateObjectStoragePort {
  verifyPrivatePurposeBuckets(
    options?: PrivateObjectStorageCallOptions,
    purposes?: readonly PrivateObjectPurpose[],
  ): Promise<PrivateObjectStorageReadiness>;
  uploadImmutable(
    input: UploadPrivateObject,
    options?: PrivateObjectStorageCallOptions,
  ): Promise<PrivateObjectReference>;
  createSignedReadUrl(
    input: CreatePrivateSignedReadUrl,
    options?: PrivateObjectStorageCallOptions,
  ): Promise<PrivateSignedReadUrl>;
  deleteGeneratedObject(
    input: DeletePrivateObject,
    options?: PrivateObjectStorageCallOptions,
  ): Promise<void>;
}

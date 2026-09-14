export type PrivateObjectStorageFailureCode =
  | "ABORTED"
  | "INVALID_INPUT"
  | "ASSET_TOO_LARGE"
  | "CONTROL_METADATA_TOO_LARGE"
  | "TIMEOUT"
  | "REMOTE_UNAVAILABLE"
  | "REMOTE_REJECTED"
  | "INVALID_RESPONSE"
  | "BUCKET_POLICY_INVALID"
  | "SOURCE_DELETE_FORBIDDEN"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "QUOTA_POLICY_INVALID"
  | "QUOTA_SNAPSHOT_REQUIRED"
  | "QUOTA_EXHAUSTED"
  | "ROUTING_INVALID";

export class PrivateObjectStorageError extends Error {
  constructor(
    readonly code: PrivateObjectStorageFailureCode,
    boundary = "Private object storage",
  ) {
    super(`${boundary} failed: ${code}.`);
    this.name = "PrivateObjectStorageError";
  }
}

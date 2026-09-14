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

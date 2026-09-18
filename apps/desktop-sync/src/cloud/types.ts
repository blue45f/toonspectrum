export const DESKTOP_CLOUD_PROVIDER_IDS = [
  "google-drive",
  "dropbox",
  "onedrive",
] as const;

export type DesktopCloudProviderId =
  (typeof DESKTOP_CLOUD_PROVIDER_IDS)[number];

export interface DesktopCloudObject {
  readonly id: string;
  readonly relativePath: string;
  readonly size: number;
  readonly version: string;
  readonly modifiedAt: string | null;
}

export interface DesktopCloudProvider {
  readonly id: DesktopCloudProviderId;
  readonly rootLabel: string;
  listFiles(signal?: AbortSignal): Promise<readonly DesktopCloudObject[]>;
  downloadFile(
    file: DesktopCloudObject,
    signal?: AbortSignal,
  ): Promise<Uint8Array>;
  uploadFile(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly sourceSha256?: string;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<DesktopCloudObject>;
  deleteFile(input: {
    readonly file: DesktopCloudObject;
    readonly expectedVersion: string;
    readonly signal?: AbortSignal;
  }): Promise<void>;
}

export type DesktopCloudErrorCode =
  | "unauthorized"
  | "not-found"
  | "version-conflict"
  | "invalid-response"
  | "network"
  | "cancelled"
  | "unsupported"
  | "integrity";

export class DesktopCloudError extends Error {
  constructor(
    readonly provider: DesktopCloudProviderId,
    readonly code: DesktopCloudErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "DesktopCloudError";
  }
}

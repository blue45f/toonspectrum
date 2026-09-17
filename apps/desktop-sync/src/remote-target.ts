import {
  DESKTOP_CLOUD_PROVIDER_IDS,
  createDesktopCloudRemote,
  type DesktopCloudProviderId,
} from "./cloud/index.js";
import { FileSystemDesktopSyncRemote } from "./filesystem-remote.js";

import type { DesktopSyncRemote } from "./runtime.js";
import type { ScanSyncFolderOptions } from "./scanner.js";

export type DesktopSyncRemoteTarget =
  | {
      readonly kind: "filesystem";
      readonly root: string;
    }
  | {
      readonly kind: "cloud";
      readonly provider: DesktopCloudProviderId;
      readonly rootPath: string;
      readonly accessTokenEnvironmentVariable: string;
    };

export interface DesktopSyncRemoteDependencies {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: typeof fetch;
}

export const DEFAULT_CLOUD_ACCESS_TOKEN_ENVIRONMENT: Readonly<
  Record<DesktopCloudProviderId, string>
> = Object.freeze({
  "google-drive": "TOONSTUDIO_GOOGLE_DRIVE_ACCESS_TOKEN",
  dropbox: "TOONSTUDIO_DROPBOX_ACCESS_TOKEN",
  onedrive: "TOONSTUDIO_ONEDRIVE_ACCESS_TOKEN",
});

export function parseDesktopCloudProviderId(
  value: string,
): DesktopCloudProviderId {
  if (
    DESKTOP_CLOUD_PROVIDER_IDS.includes(
      value as DesktopCloudProviderId,
    )
  ) return value as DesktopCloudProviderId;
  throw new TypeError(
    `--cloud-provider must be one of ${DESKTOP_CLOUD_PROVIDER_IDS.join(", ")}`,
  );
}
export function desktopSyncRemoteLabel(
  target: DesktopSyncRemoteTarget,
): string {
  return target.kind === "filesystem"
    ? target.root
    : `${target.provider}:${target.rootPath}`;
}

export async function createDesktopSyncRemoteForTarget(
  target: DesktopSyncRemoteTarget,
  localRoot: string,
  scanOptions: ScanSyncFolderOptions,
  dependencies: DesktopSyncRemoteDependencies = {},
): Promise<DesktopSyncRemote> {
  if (target.kind === "filesystem") {
    const remote = await FileSystemDesktopSyncRemote.create(
      target.root,
      scanOptions,
    );
    await remote.assertDistinctFrom(localRoot);
    return remote;
  }
  const environment = dependencies.environment ?? process.env;
  const accessToken = environment[
    target.accessTokenEnvironmentVariable
  ]?.trim();
  if (!accessToken) {
    throw new TypeError(
      `cloud access token is missing from ${target.accessTokenEnvironmentVariable}`,
    );
  }
  return createDesktopCloudRemote({
    provider: target.provider,
    accessToken,
    rootPath: target.rootPath,
    fetchImpl: dependencies.fetchImpl,
  });
}

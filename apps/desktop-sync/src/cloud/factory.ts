import { DropboxDesktopCloudProvider } from "./dropbox.js";
import { GoogleDriveDesktopCloudProvider } from "./google-drive.js";
import { IndexedCloudDesktopSyncRemote } from "./indexed-remote.js";
import { OneDriveDesktopCloudProvider } from "./onedrive.js";

import type {
  DesktopCloudProvider,
  DesktopCloudProviderId,
} from "./types.js";

export interface CreateDesktopCloudRemoteOptions {
  readonly provider: DesktopCloudProviderId;
  readonly accessToken: string;
  readonly rootPath?: string;
  readonly fetchImpl?: typeof fetch;
}

export function createDesktopCloudProvider(
  options: CreateDesktopCloudRemoteOptions,
): DesktopCloudProvider {
  switch (options.provider) {
    case "google-drive":
      return new GoogleDriveDesktopCloudProvider(options);
    case "dropbox":
      return new DropboxDesktopCloudProvider(options);
    case "onedrive":
      return new OneDriveDesktopCloudProvider(options);
  }
}

export function createDesktopCloudRemote(
  options: CreateDesktopCloudRemoteOptions,
): IndexedCloudDesktopSyncRemote {
  return new IndexedCloudDesktopSyncRemote(
    createDesktopCloudProvider(options),
  );
}

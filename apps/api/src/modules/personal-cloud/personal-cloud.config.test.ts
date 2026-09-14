import { describe, expect, it } from "vitest";

import { personalCloudProviderConfig } from "./personal-cloud.config";

const common = {
  PERSONAL_CLOUD_OAUTH_REDIRECT_BASE_URL: "https://www.toonstudio.cloud",
  PERSONAL_CLOUD_OAUTH_STATE_SECRET: "s".repeat(48),
  PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY: "k".repeat(48),
};

describe("personal cloud provider configuration", () => {
  it("uses the existing Google OAuth app when a Drive-specific app is not supplied", () => {
    const config = personalCloudProviderConfig("google-drive", {
      ...common,
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    });
    expect(config.configured).toBe(true);
    expect(config.redirectUri).toBe("https://www.toonstudio.cloud/api/personal-cloud/oauth/google-drive/callback");
    expect(config.scopes).toContain("https://www.googleapis.com/auth/drive.file");
  });

  it("fails closed when encryption or provider credentials are incomplete", () => {
    const config = personalCloudProviderConfig("dropbox", {
      DROPBOX_OAUTH_CLIENT_ID: "dropbox-client",
      DROPBOX_OAUTH_CLIENT_SECRET: "dropbox-secret",
      PERSONAL_CLOUD_OAUTH_STATE_SECRET: "short",
    });
    expect(config.configured).toBe(false);
    expect(config.reason).toContain("state-secret");
    expect(config.reason).toContain("token-encryption-key");
  });

  it("uses least-privilege OneDrive app-folder scope", () => {
    const config = personalCloudProviderConfig("onedrive", {
      ...common,
      ONEDRIVE_OAUTH_CLIENT_ID: "onedrive-client",
      ONEDRIVE_OAUTH_CLIENT_SECRET: "onedrive-secret",
    });
    expect(config.configured).toBe(true);
    expect(config.scopes).toContain("Files.ReadWrite.AppFolder");
    expect(config.scopes).not.toContain("Files.ReadWrite.All");
  });
});

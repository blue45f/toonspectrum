import { describe, expect, it } from "vitest";

import { MemoryDesktopCredentialVault } from "./credential-vault.js";
import {
  CredentialDesktopUploadSessionStore,
  type DesktopUploadSessionIdentity,
  type DesktopUploadSessionRecord,
} from "./upload-session-store.js";

const identity: DesktopUploadSessionIdentity = {
  provider: "google-drive",
  remoteRoot: "ToonStudio/Sync",
  credentialProfile: "artist",
  relativePath: "episode/page.psd",
  sourceSha256: "a".repeat(64),
  size: 10,
  expectedObjectId: null,
  expectedVersion: null,
};

function record(
  overrides: Partial<DesktopUploadSessionRecord> = {},
): DesktopUploadSessionRecord {
  return {
    ...identity,
    schemaVersion: 1,
    kind: "google-resumable",
    handle: "https://upload.example/session",
    offset: 4,
    expiresAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("desktop upload session store", () => {
  it("persists opaque handles and exact source identity in the credential vault", async () => {
    const vault = new MemoryDesktopCredentialVault();
    const store = new CredentialDesktopUploadSessionStore(
      vault,
      () => Date.parse("2026-09-17T00:00:00.000Z"),
    );
    await store.save(record());
    await expect(store.load(identity)).resolves.toEqual(record());

    await expect(store.load({
      ...identity,
      sourceSha256: "b".repeat(64),
    })).resolves.toBeNull();
    await expect(store.load(identity)).resolves.toEqual(record());
  });

  it("deletes expired session handles instead of reusing them", async () => {
    const vault = new MemoryDesktopCredentialVault();
    const store = new CredentialDesktopUploadSessionStore(
      vault,
      () => Date.parse("2026-09-20T00:00:00.000Z"),
    );
    await store.save(record());
    await expect(store.load(identity)).resolves.toBeNull();
    await expect(store.load(identity)).resolves.toBeNull();
  });

  it("rejects malformed offsets before they reach a provider", async () => {
    const vault = new MemoryDesktopCredentialVault();
    const store = new CredentialDesktopUploadSessionStore(vault);
    await expect(store.save(record({ offset: 11 }))).rejects.toThrow(
      /invalid desktop upload session record/u,
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  MemoryDesktopUploadSessionStore,
  type DesktopUploadSessionIdentity,
  type DesktopUploadSessionRecord,
} from "../upload-session-store.js";

import { DropboxDesktopCloudProvider } from "./dropbox.js";
import { GoogleDriveDesktopCloudProvider } from "./google-drive.js";
import { sha256Bytes } from "./http.js";
import { OneDriveDesktopCloudProvider } from "./onedrive.js";

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function identity(
  provider: DesktopUploadSessionIdentity["provider"],
  remoteRoot: string,
  payload: Uint8Array,
): DesktopUploadSessionIdentity {
  return {
    provider,
    remoteRoot,
    credentialProfile: "default",
    relativePath: "page.psd",
    sourceSha256: sha256Bytes(payload),
    size: payload.byteLength,
    expectedObjectId: null,
    expectedVersion: null,
  };
}

function session(
  identityValue: DesktopUploadSessionIdentity,
  kind: DesktopUploadSessionRecord["kind"],
  handle: string,
): DesktopUploadSessionRecord {
  return {
    ...identityValue,
    schemaVersion: 1,
    kind,
    handle,
    offset: 4,
    expiresAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
  };
}

describe("resumable cloud uploads", () => {
  it("resumes a Google Drive session from server-confirmed offset", async () => {
    const payload = bytes("abcdefgh");
    const store = new MemoryDesktopUploadSessionStore();
    const key = identity("google-drive", "ToonStudio/Sync", payload);
    await store.save(session(key, "google-resumable", "https://upload.example/google"));
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (request, init = {}) => {
      expect(requestUrl(request)).toBe("https://upload.example/google");
      calls.push(init);
      if (calls.length === 1) {
        expect(new Headers(init.headers).get("Content-Range")).toBe("bytes */8");
        return new Response(null, {
          status: 308,
          headers: { Range: "bytes=0-3" },
        });
      }
      expect(new Headers(init.headers).get("Content-Range")).toBe("bytes 4-7/8");
      return jsonResponse({
        id: "google-page",
        name: "page.psd",
        mimeType: "application/octet-stream",
        size: "8",
        version: "2",
        modifiedTime: "2026-09-17T00:00:00.000Z",
      });
    });
    const provider = new GoogleDriveDesktopCloudProvider({
      accessToken: "token",
      fetchImpl,
      uploadSessionStore: store,
    });
    const uploaded = await provider.uploadFile({
      relativePath: "page.psd",
      bytes: payload,
      sourceSha256: key.sourceSha256,
      expected: null,
    });
    expect(uploaded).toMatchObject({ version: "2", size: 8 });
    expect(calls).toHaveLength(2);
    expect(calls.every((init) => (
      new Headers(init.headers).get("Authorization") === null
    ))).toBe(true);
    await expect(store.load(key)).resolves.toBeNull();
  });

  it("resumes a OneDrive upload URL after process restart", async () => {
    const payload = bytes("abcdefgh");
    const store = new MemoryDesktopUploadSessionStore();
    const key = identity("onedrive", "AppRoot/Sync", payload);
    await store.save(session(
      key,
      "onedrive-upload-url",
      "https://upload.example/onedrive",
    ));
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (request, init = {}) => {
      expect(requestUrl(request)).toBe("https://upload.example/onedrive");
      calls += 1;
      if (calls === 1) {
        expect(init.method).toBe("GET");
        return jsonResponse({
          nextExpectedRanges: ["4-"],
          expirationDateTime: "2026-09-20T00:00:00.000Z",
        });
      }
      expect(new Headers(init.headers).get("Content-Range")).toBe("bytes 4-7/8");
      return jsonResponse({
        id: "onedrive-page",
        name: "page.psd",
        eTag: "etag-2",
        lastModifiedDateTime: "2026-09-17T00:00:00.000Z",
        size: 8,
        file: {},
      }, { status: 201 });
    });
    const provider = new OneDriveDesktopCloudProvider({
      accessToken: "token",
      fetchImpl,
      uploadSessionStore: store,
    });
    const uploaded = await provider.uploadFile({
      relativePath: "page.psd",
      bytes: payload,
      sourceSha256: key.sourceSha256,
      expected: null,
    });
    expect(uploaded).toMatchObject({ version: "etag-2", size: 8 });
    expect(calls).toBe(2);
    await expect(store.load(key)).resolves.toBeNull();
  });

  it("resumes a Dropbox cursor without replaying accepted chunks", async () => {
    const payload = bytes("abcdefgh");
    const store = new MemoryDesktopUploadSessionStore();
    const key = identity("dropbox", "/ToonStudio/Sync", payload);
    await store.save(session(
      key,
      "dropbox-session",
      "dropbox-session-id",
    ));
    const calls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (request, init = {}) => {
      const url = requestUrl(request);
      calls.push(url);
      if (url.endsWith("/files/create_folder_v2")) {
        return jsonResponse({ metadata: { ".tag": "folder" } });
      }
      if (url.endsWith("/files/upload_session/finish")) {
        const argument = JSON.parse(
          new Headers(init.headers).get("Dropbox-API-Arg") ?? "{}",
        ) as { cursor?: { offset?: number; session_id?: string } };
        expect(argument.cursor).toEqual({
          offset: 4,
          session_id: "dropbox-session-id",
        });
        return jsonResponse({
          ".tag": "file",
          id: "id:page",
          path_display: "/ToonStudio/Sync/page.psd",
          rev: "rev-2",
          server_modified: "2026-09-17T00:00:00.000Z",
          size: 8,
        });
      }
      throw new Error(`unexpected Dropbox request: ${url}`);
    });
    const provider = new DropboxDesktopCloudProvider({
      accessToken: "token",
      fetchImpl,
      uploadSessionStore: store,
      simpleUploadThresholdBytes: 1,
    });
    const uploaded = await provider.uploadFile({
      relativePath: "page.psd",
      bytes: payload,
      sourceSha256: key.sourceSha256,
      expected: null,
    });
    expect(uploaded).toMatchObject({ version: "rev-2", size: 8 });
    expect(calls.filter((url) => url.endsWith("/files/create_folder_v2")))
      .toHaveLength(2);
    expect(calls.some((url) => url.endsWith("/files/upload_session/start")))
      .toBe(false);
    await expect(store.load(key)).resolves.toBeNull();
  });
});

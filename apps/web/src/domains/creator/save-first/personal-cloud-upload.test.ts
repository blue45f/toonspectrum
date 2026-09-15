import { describe, expect, it, vi } from "vitest";

import {
  uploadPersonalCloudProjectPackage,
} from "./personal-cloud-upload";
import { createStudioStorageBinding } from "./studio-save-profile";

import type { PersonalCloudAccessToken } from "./personal-cloud-client";
import type { StudioProjectPackageResult } from "./studio-project-package";

const credential: PersonalCloudAccessToken = Object.freeze({
  accessToken: "access-token",
  tokenType: "Bearer",
  expiresAt: "2099-01-01T00:00:00.000Z",
  scope: Object.freeze([]),
  accountLabel: "u***@example.com",
});

function packageResult(size = 32): StudioProjectPackageResult {
  const blob = new Blob([new Uint8Array(size)], {
    type: "application/vnd.toonstudio.project+zip",
  });
  return Object.freeze({
    blob,
    fileName: "작품.toonstudio",
    manifest: Object.freeze({
      format: "toonstudio-project",
      formatVersion: 1,
      projectId: "project-1",
      projectTitle: "작품",
      createdAt: "2026-09-15T00:00:00.000Z",
      exportedAt: "2026-09-15T01:00:00.000Z",
      sourceRevision: 3,
      accessMode: "owner-only",
      distributionState: "none",
      entryNames: Object.freeze([]),
    }),
  });
}
function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function header(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

describe("personal cloud project upload", () => {
  it("refuses to overwrite a newer Google Drive version", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      id: "google-file-1",
      name: "작품.toonstudio",
      version: "12",
      modifiedTime: "2026-09-15T02:00:00.000Z",
      md5Checksum: "remote",
      size: "32",
      webViewLink: "https://drive.google.com/file/d/google-file-1/view",
      trashed: false,
    }));
    const binding = createStudioStorageBinding({
      provider: "google-drive",
      role: "backup",
      remoteId: "google-file-1",
      remoteVersion: "11",
      connectionRequired: false,
    });
    await expect(uploadPersonalCloudProjectPackage("google-drive", {
      projectId: "project-1",
      result: packageResult(),
      binding,
      credential,
      fetchImpl,
    })).rejects.toMatchObject({
      code: "conflict",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("creates a Google Drive folder hierarchy and uploads a project", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      if (url.includes("/drive/v3/files?") && init?.method !== "POST") {
        return jsonResponse({ files: [] });
      }
      if (url.includes("/drive/v3/files?fields=id") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string };
        return jsonResponse({ id: `folder-${body.name}` });
      }
      if (url.includes("uploadType=resumable") && init?.method === "POST") {
        return new Response(null, {
          status: 200,
          headers: { Location: "https://upload.example/google-session" },
        });
      }
      if (url === "https://upload.example/google-session" && init?.method === "PUT") {
        return jsonResponse({
          id: "google-file-2",
          name: "작품.toonstudio",
          version: "1",
          modifiedTime: "2026-09-15T03:00:00.000Z",
          md5Checksum: "remote-md5",
          size: "32",
          webViewLink: "https://drive.google.com/file/d/google-file-2/view",
          trashed: false,
        });
      }
      throw new Error(`unexpected Google request: ${init?.method ?? "GET"} ${url}`);
    });
    const result = await uploadPersonalCloudProjectPackage("google-drive", {
      projectId: "project-1",
      result: packageResult(),
      binding: null,
      credential,
      fetchImpl,
    });

    expect(result).toMatchObject({
      provider: "google-drive",
      remoteId: "google-file-2",
      remoteVersion: "1",
      byteLength: 32,
    });
    const upload = fetchImpl.mock.calls.find(([request]) => (
      requestUrl(request) === "https://upload.example/google-session"
    ));
    expect(header(upload?.[1], "Content-Range")).toBe("bytes 0-31/32");
    expect(result.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("updates a Dropbox file with its exact remote revision", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      if (url.endsWith("/files/create_folder_v2")) {
        return jsonResponse({ error_summary: "path/conflict/folder" }, { status: 409 });
      }
      if (url.endsWith("/files/get_metadata")) {
        const body = JSON.parse(String(init?.body)) as { path?: string };
        if (body.path?.startsWith("/")) {
          return jsonResponse({
            ".tag": "folder",
            id: `id:${body.path}`,
            path_display: body.path,
          });
        }
        return jsonResponse({
          ".tag": "file",
          id: "id:dropbox-file",
          path_display: "/ToonStudio/Projects/project-1/작품.toonstudio",
          rev: "rev-1",
          content_hash: "dropbox-hash",
          server_modified: "2026-09-15T03:00:00.000Z",
          size: 32,
        });
      }
      if (url.endsWith("/files/upload")) {
        const argument = JSON.parse(header(init, "Dropbox-API-Arg") ?? "{}") as {
          mode?: { ".tag"?: string; update?: string };
        };
        expect(argument.mode).toEqual({ ".tag": "update", update: "rev-1" });
        return jsonResponse({
          ".tag": "file",
          id: "id:dropbox-file",
          path_display: "/ToonStudio/Projects/project-1/작품.toonstudio",
          rev: "rev-2",
          content_hash: "dropbox-hash-2",
          server_modified: "2026-09-15T04:00:00.000Z",
          size: 32,
        });
      }
      throw new Error(`unexpected Dropbox request: ${init?.method ?? "GET"} ${url}`);
    });
    const binding = createStudioStorageBinding({
      provider: "dropbox",
      role: "backup",
      remoteId: "id:dropbox-file",
      remoteVersion: "rev-1",
      connectionRequired: false,
    });

    const result = await uploadPersonalCloudProjectPackage("dropbox", {
      projectId: "project-1",
      result: packageResult(),
      binding,
      credential,
      fetchImpl,
    });

    expect(result).toMatchObject({
      provider: "dropbox",
      remoteId: "id:dropbox-file",
      remoteVersion: "rev-2",
      byteLength: 32,
    });
  });
  it("uploads a large OneDrive project in 320 KiB-aligned chunks", async () => {
    const size = 10 * 1024 * 1024 + 64;
    const uploadCalls: Array<RequestInit | undefined> = [];
    let folderCreateCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      if (url.includes("/special/approot")) {
        return jsonResponse({
          id: "app-root",
          name: "ToonStudio",
          eTag: "root",
          folder: {},
        });
      }
      if (url.includes("/children") && init?.method === "POST") {
        folderCreateCount += 1;
        return jsonResponse({
          id: folderCreateCount === 1 ? "projects-folder" : "project-folder",
          name: folderCreateCount === 1 ? "Projects" : "project-1",
          eTag: `folder-${folderCreateCount}`,
          folder: {},
        }, { status: 201 });
      }
      if (url.includes("/items/project-folder:/") && init?.method !== "POST") {
        return new Response(null, { status: 404 });
      }
      if (url.includes("createUploadSession") && init?.method === "POST") {
        return jsonResponse({
          uploadUrl: "https://upload.example/onedrive-session",
          expirationDateTime: "2099-01-01T00:00:00.000Z",
        });
      }
      if (url === "https://upload.example/onedrive-session" && init?.method === "PUT") {
        uploadCalls.push(init);
        if (uploadCalls.length === 1) {
          return jsonResponse({ nextExpectedRanges: ["10485760-"] }, { status: 202 });
        }
        return jsonResponse({
          id: "onedrive-file",
          name: "작품.toonstudio",
          eTag: "etag-1",
          lastModifiedDateTime: "2026-09-15T05:00:00.000Z",
          webUrl: "https://onedrive.live.com/example",
          size,
          file: { mimeType: "application/vnd.toonstudio.project+zip" },
        }, { status: 201 });
      }
      throw new Error(`unexpected OneDrive request: ${init?.method ?? "GET"} ${url}`);
    });

    const result = await uploadPersonalCloudProjectPackage("onedrive", {
      projectId: "project-1",
      result: packageResult(size),
      binding: null,
      credential,
      fetchImpl,
    });

    expect(result).toMatchObject({
      provider: "onedrive",
      remoteId: "onedrive-file",
      remoteVersion: "etag-1",
      byteLength: size,
    });
    expect(uploadCalls).toHaveLength(2);
    expect(header(uploadCalls[0], "Content-Range")).toBe(
      `bytes 0-${10 * 1024 * 1024 - 1}/${size}`,
    );
    expect(header(uploadCalls[1], "Content-Range")).toBe(
      `bytes ${10 * 1024 * 1024}-${size - 1}/${size}`,
    );
    expect(header(uploadCalls[0], "Authorization")).toBeNull();
  });
});

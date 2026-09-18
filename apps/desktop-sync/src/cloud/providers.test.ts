import { describe, expect, it, vi } from "vitest";

import { DropboxDesktopCloudProvider } from "./dropbox.js";
import { GoogleDriveDesktopCloudProvider } from "./google-drive.js";
import { OneDriveDesktopCloudProvider } from "./onedrive.js";

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

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestHeader(
  init: RequestInit | undefined,
  name: string,
): string | null {
  return new Headers(init?.headers).get(name);
}

function requestJson(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
describe("desktop cloud providers", () => {
  it("uses Dropbox recursive listing and revision CAS", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      calls.push({ url, init });
      if (url.endsWith("/files/create_folder_v2")) {
        return jsonResponse({ metadata: { ".tag": "folder" } });
      }
      if (url.endsWith("/files/list_folder")) {
        return jsonResponse({
          entries: [{
            ".tag": "file",
            id: "id:page",
            path_display: "/ToonStudio/Sync/page.psd",
            rev: "rev-1",
            server_modified: "2026-09-17T00:00:00.000Z",
            size: 4,
          }, {
            ".tag": "file",
            id: "id:trash-page",
            path_display: "/ToonStudio/Sync/.toonstudio-trash/batch/page.psd",
            rev: "trash-rev",
            server_modified: "2026-09-17T00:00:00.000Z",
            size: 4,
          }],
          has_more: false,
          cursor: "cursor-1",
        });
      }
      if (url.endsWith("/files/download")) {
        return new Response(bytes("page"));
      }
      if (url.endsWith("/files/upload")) {
        return jsonResponse({
          ".tag": "file",
          id: "id:page",
          path_display: "/ToonStudio/Sync/page.psd",
          rev: "rev-2",
          server_modified: "2026-09-17T00:01:00.000Z",
          size: 5,
        });
      }
      if (url.endsWith("/files/get_metadata")) {
        const body = requestJson(init);
        if (body.path === "/ToonStudio/Sync") {
          return jsonResponse({
            ".tag": "folder",
            id: "id:sync-root",
            path_display: "/ToonStudio/Sync",
          });
        }
        return jsonResponse({
          ".tag": "file",
          id: "id:page",
          path_display: "/ToonStudio/Sync/page.psd",
          rev: "rev-2",
          server_modified: "2026-09-17T00:01:00.000Z",
          size: 5,
        });
      }
      if (url.endsWith("/files/move_v2")) {
        const body = requestJson(init);
        return jsonResponse({
          metadata: {
            ".tag": "file",
            id: "id:page",
            path_display: String(body.to_path),
            rev: "rev-2",
            server_modified: "2026-09-17T00:01:00.000Z",
            size: 5,
          },
        });
      }
      throw new Error(`unexpected Dropbox request: ${url}`);
    });
    const provider = new DropboxDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl,
      now: () => Date.parse("2026-09-17T00:02:00.000Z"),
    });
    const listedFiles = await provider.listFiles();
    expect(listedFiles).toHaveLength(1);
    const [listed] = listedFiles;
    expect(listed).toMatchObject({
      id: "id:page",
      relativePath: "page.psd",
      version: "rev-1",
      size: 4,
    });
    await expect(provider.downloadFile(listed!)).resolves.toEqual(bytes("page"));

    const uploaded = await provider.uploadFile({
      relativePath: "page.psd",
      bytes: bytes("page2"),
      expected: listed!,
    });
    expect(uploaded.version).toBe("rev-2");
    const uploadCall = calls.find(({ url }) => url.endsWith("/files/upload"));
    const uploadArgument = JSON.parse(
      requestHeader(uploadCall?.init, "Dropbox-API-Arg") ?? "{}",
    ) as { mode?: { ".tag"?: string; update?: string } };
    expect(uploadArgument.mode).toEqual({
      ".tag": "update",
      update: "rev-1",
    });

    await provider.deleteFile({
      file: uploaded,
      expectedVersion: "rev-2",
    });
    const moveCall = calls.find(({ url }) => url.endsWith("/files/move_v2"));
    expect(requestJson(moveCall?.init)).toMatchObject({
      from_path: "id:page",
      to_path: expect.stringContaining(
        "/ToonStudio/Sync/.toonstudio-trash/20260917000200000-",
      ),
      autorename: false,
    });
    expect(calls.some(({ url }) => url.endsWith("/files/delete_v2"))).toBe(false);
  });
  it("restores a Dropbox file when its revision changes during soft delete", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let moveCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      calls.push({ url, init });
      if (url.endsWith("/files/create_folder_v2")) {
        return jsonResponse({ metadata: { ".tag": "folder" } });
      }
      if (url.endsWith("/files/get_metadata")) {
        return jsonResponse({
          ".tag": "file",
          id: "id:page",
          path_display: "/ToonStudio/Sync/page.psd",
          rev: "rev-2",
          server_modified: "2026-09-17T00:01:00.000Z",
          size: 5,
        });
      }
      if (url.endsWith("/files/move_v2")) {
        moveCount += 1;
        const body = requestJson(init);
        return jsonResponse({
          metadata: {
            ".tag": "file",
            id: "id:page",
            path_display: String(body.to_path),
            rev: "rev-3",
            server_modified: "2026-09-17T00:03:00.000Z",
            size: 6,
          },
        });
      }
      throw new Error(`unexpected Dropbox request: ${url}`);
    });
    const provider = new DropboxDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl,
      now: () => Date.parse("2026-09-17T00:02:00.000Z"),
    });

    await expect(provider.deleteFile({
      file: {
        id: "id:page",
        relativePath: "page.psd",
        size: 5,
        version: "rev-2",
        modifiedAt: "2026-09-17T00:01:00.000Z",
      },
      expectedVersion: "rev-2",
    })).rejects.toMatchObject({
      code: "version-conflict",
      message: expect.stringContaining("was restored"),
    });
    expect(moveCount).toBe(2);
    const moveCalls = calls.filter(({ url }) => url.endsWith("/files/move_v2"));
    expect(requestJson(moveCalls[1]?.init)).toMatchObject({
      from_path: "id:page",
      to_path: "/ToonStudio/Sync/page.psd",
      autorename: false,
    });
  });

  it("uses Google Drive ETag preconditions for download, update and delete", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let listCall = 0;
    let metadataVersion = "1";
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      calls.push({ url, init });
      if (url.includes("/drive/v3/files?") && init?.method !== "POST") {
        listCall += 1;
        if (listCall === 1) {
          return jsonResponse({ files: [{
            id: "folder-ToonStudio",
            name: "ToonStudio",
            mimeType: "application/vnd.google-apps.folder",
            size: "0",
            version: "1",
            modifiedTime: "2026-09-17T00:00:00.000Z",
          }] });
        }
        if (listCall === 2) {
          return jsonResponse({ files: [{
            id: "folder-Sync",
            name: "Sync",
            mimeType: "application/vnd.google-apps.folder",
            size: "0",
            version: "1",
            modifiedTime: "2026-09-17T00:00:00.000Z",
          }] });
        }
        return jsonResponse({
          files: [{
            id: "google-page",
            name: "page.psd",
            mimeType: "application/octet-stream",
            size: "4",
            version: "1",
            modifiedTime: "2026-09-17T00:00:00.000Z",
          }],
        });
      }
      if (url.includes("/drive/v3/files?fields=id,name,mimeType") && init?.method === "POST") {
        const body = requestJson(init);
        return jsonResponse({
          id: `folder-${String(body.name)}`,
          name: body.name,
          mimeType: "application/vnd.google-apps.folder",
        });
      }
      if (url.startsWith("https://www.googleapis.com/drive/v3/files/google-page?") && !url.includes("alt=media")) {
        return jsonResponse({
          id: "google-page",
          name: "page.psd",
          mimeType: "application/octet-stream",
          size: metadataVersion === "1" ? "4" : "5",
          version: metadataVersion,
          modifiedTime: "2026-09-17T00:01:00.000Z",
        }, { headers: { ETag: `"etag-${metadataVersion}"` } });
      }
      if (url.includes("/drive/v3/files/google-page?alt=media")) {
        expect(requestHeader(init, "If-Match")).toBe('"etag-1"');
        return new Response(bytes("page"));
      }
      if (url.includes("/upload/drive/v3/files/google-page") && init?.method === "PATCH") {
        expect(requestHeader(init, "If-Match")).toBe('"etag-1"');
        return new Response(null, {
          status: 200,
          headers: { Location: "https://upload.example/google-page" },
        });
      }
      if (url === "https://upload.example/google-page" && init?.method === "PUT") {
        metadataVersion = "2";
        return jsonResponse({
          id: "google-page",
          name: "page.psd",
          mimeType: "application/octet-stream",
          size: "5",
          version: "2",
          modifiedTime: "2026-09-17T00:02:00.000Z",
        });
      }
      if (url.endsWith("/drive/v3/files/google-page") && init?.method === "DELETE") {
        expect(requestHeader(init, "If-Match")).toBe('"etag-2"');
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected Google Drive request: ${init?.method ?? "GET"} ${url}`);
    });
    const provider = new GoogleDriveDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl,
    });
    const [listed] = await provider.listFiles();
    expect(listed).toMatchObject({
      id: "google-page",
      relativePath: "page.psd",
      version: "1",
      size: 4,
    });
    await expect(provider.downloadFile(listed!)).resolves.toEqual(bytes("page"));

    const uploaded = await provider.uploadFile({
      relativePath: "page.psd",
      bytes: bytes("page2"),
      expected: listed!,
    });
    expect(uploaded).toMatchObject({ version: "2", size: 5 });
    expect(requestHeader(
      calls.find(({ url }) => url === "https://upload.example/google-page")?.init,
      "Authorization",
    )).toBeNull();

    await provider.deleteFile({
      file: uploaded,
      expectedVersion: "2",
    });
    expect(calls.some(({ url, init }) => (
      url.endsWith("/drive/v3/files/google-page")
      && init?.method === "DELETE"
    ))).toBe(true);
  });
  it("uses OneDrive AppRoot and ETag guarded upload sessions", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let version = "etag-1";
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      calls.push({ url, init });
      if (url.includes("/special/approot")) {
        return jsonResponse({
          id: "app-root",
          name: "ToonStudio",
          eTag: "root-etag",
          size: 0,
          folder: {},
        });
      }
      if (url.includes("/items/app-root:/Sync?") && init?.method !== "POST") {
        return jsonResponse({
          id: "sync-root",
          name: "Sync",
          eTag: "sync-etag",
          size: 0,
          folder: {},
        });
      }
      if (url.includes("/items/app-root/children") && init?.method === "POST") {
        throw new Error("OneDrive dry listing must not create the sync root");
      }
      if (url.includes("/items/sync-root/children") && init?.method !== "POST") {
        return jsonResponse({
          value: [{
            id: "onedrive-page",
            name: "page.psd",
            eTag: "etag-1",
            lastModifiedDateTime: "2026-09-17T00:00:00.000Z",
            size: 4,
            file: {},
          }],
        });
      }
      if (url.includes("/items/onedrive-page?") && !url.endsWith("/content")) {
        return jsonResponse({
          id: "onedrive-page",
          name: "page.psd",
          eTag: version,
          lastModifiedDateTime: "2026-09-17T00:01:00.000Z",
          size: version === "etag-1" ? 4 : 5,
          file: {},
        });
      }
      if (url.endsWith("/items/onedrive-page/content")) {
        expect(requestHeader(init, "If-Match")).toBe("etag-1");
        return new Response(bytes("page"));
      }
      if (url.endsWith("/items/onedrive-page/createUploadSession")) {
        expect(requestHeader(init, "If-Match")).toBe("etag-1");
        return jsonResponse({
          uploadUrl: "https://upload.example/onedrive-page",
        });
      }
      if (url === "https://upload.example/onedrive-page" && init?.method === "PUT") {
        version = "etag-2";
        return jsonResponse({
          id: "onedrive-page",
          name: "page.psd",
          eTag: "etag-2",
          lastModifiedDateTime: "2026-09-17T00:02:00.000Z",
          size: 5,
          file: {},
        }, { status: 201 });
      }
      if (url.endsWith("/items/onedrive-page") && init?.method === "DELETE") {
        expect(requestHeader(init, "If-Match")).toBe("etag-2");
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected OneDrive request: ${init?.method ?? "GET"} ${url}`);
    });
    const provider = new OneDriveDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl,
    });
    const [listed] = await provider.listFiles();
    expect(listed).toMatchObject({
      id: "onedrive-page",
      relativePath: "page.psd",
      version: "etag-1",
      size: 4,
    });
    await expect(provider.downloadFile(listed!)).resolves.toEqual(
      bytes("page"),
    );
    const uploaded = await provider.uploadFile({
      relativePath: "page.psd",
      bytes: bytes("page2"),
      expected: listed!,
    });
    expect(uploaded).toMatchObject({ version: "etag-2", size: 5 });
    const chunkCall = calls.find(({ url }) => (
      url === "https://upload.example/onedrive-page"
    ));
    expect(requestHeader(chunkCall?.init, "Authorization")).toBeNull();
    await provider.deleteFile({
      file: uploaded,
      expectedVersion: "etag-2",
    });
    expect(calls.some(({ url, init }) => (
      url.endsWith("/items/onedrive-page")
      && init?.method === "DELETE"
    ))).toBe(true);
  });

  it("blocks Google-native documents instead of treating them as deleted binary files", async () => {
    let listCall = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      if (url.includes("/drive/v3/files?") && init?.method !== "POST") {
        listCall += 1;
        if (listCall === 1) {
          return jsonResponse({ files: [{
            id: "folder-ToonStudio",
            name: "ToonStudio",
            mimeType: "application/vnd.google-apps.folder",
            size: "0",
            version: "1",
            modifiedTime: "2026-09-17T00:00:00.000Z",
          }] });
        }
        if (listCall === 2) {
          return jsonResponse({ files: [{
            id: "folder-Sync",
            name: "Sync",
            mimeType: "application/vnd.google-apps.folder",
            size: "0",
            version: "1",
            modifiedTime: "2026-09-17T00:00:00.000Z",
          }] });
        }
        return jsonResponse({ files: [{
          id: "native-doc",
          name: "notes",
          mimeType: "application/vnd.google-apps.document",
          size: "0",
          version: "1",
          modifiedTime: "2026-09-17T00:00:00.000Z",
        }] });
      }
      throw new Error(`unexpected Google Drive request: ${init?.method ?? "GET"} ${url}`);
    });

    await expect(new GoogleDriveDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl,
    }).listFiles()).rejects.toMatchObject({ code: "unsupported" });
  });

  it("lists absent provider roots without creating them", async () => {
    const dropboxFetch = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      if (url.endsWith("/files/get_metadata")) {
        return jsonResponse({ error_summary: "path/not_found/" }, { status: 409 });
      }
      throw new Error(`Dropbox read-only listing attempted a mutation: ${init?.method ?? "GET"} ${url}`);
    });
    await expect(new DropboxDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl: dropboxFetch,
    }).listFiles()).resolves.toEqual([]);

    const googleFetch = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      if (url.includes("/drive/v3/files?") && init?.method !== "POST") {
        return jsonResponse({ files: [] });
      }
      throw new Error(`Google Drive read-only listing attempted a mutation: ${init?.method ?? "GET"} ${url}`);
    });
    await expect(new GoogleDriveDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl: googleFetch,
    }).listFiles()).resolves.toEqual([]);

    const oneDriveFetch = vi.fn<typeof fetch>(async (request, init) => {
      const url = requestUrl(request);
      if (url.includes("/special/approot")) {
        return jsonResponse({
          id: "app-root",
          name: "ToonStudio",
          eTag: "root-etag",
          size: 0,
          folder: {},
        });
      }
      if (url.includes("/items/app-root:/Sync?") && init?.method !== "POST") {
        return new Response(null, { status: 404 });
      }
      throw new Error(`OneDrive read-only listing attempted a mutation: ${init?.method ?? "GET"} ${url}`);
    });
    await expect(new OneDriveDesktopCloudProvider({
      accessToken: "test-access-token",
      fetchImpl: oneDriveFetch,
    }).listFiles()).resolves.toEqual([]);
  });
});

// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { sha256HexPortable } from "../studio-sha256";
import type { ProductionManifestPage } from "./production-manuscript-competitive-model";
import {
  buildProductionPageManifestArchive,
  ProductionPageManifestArchiveError,
} from "./production-page-manifest-archive";

const bytes = new TextEncoder().encode("page-one");
const page: ProductionManifestPage = {
  id: "review:0:hash",
  sourceReviewId: "review",
  sourceRevisionId: "revision",
  sourceArtifactId: "artifact",
  sourceOrdinal: 0,
  sha256: sha256HexPortable(bytes),
  mediaType: "image/png",
  byteLength: bytes.byteLength,
  url: "https://example.com/page.png",
  expiresAt: Date.parse("2026-09-25T00:00:00.000Z"),
  mapping: { status: "unmapped", reason: "legacy-review" },
};

describe("production page manifest archive", () => {
  it("verifies immutable page bytes and produces an operational CBZ input", async () => {
    const archiveBuilder = vi.fn(async (entries: readonly { path: string; data: Blob | Uint8Array | ArrayBuffer }[]) => {
      expect(entries.map((entry) => entry.path)).toEqual([
        "toonspectrum-page-manifest.json",
        "pages/0001.png",
      ]);
      return new Blob(["zip"], { type: "application/vnd.comicbook+zip" });
    });
    const result = await buildProductionPageManifestArchive({
      projectId: "project",
      workId: "work",
      artifactId: "artifact",
      title: "12화 작화 원고",
      pages: [page],
      now: new Date("2026-09-24T00:00:00.000Z"),
      fetcher: vi.fn(async () => new Response(bytes, { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch,
      archiveBuilder,
    });
    expect(result.fileName).toBe("12화 작화 원고-page-manifest.cbz");
    expect(result.manifest).toMatchObject({ pageCount: 1, contentBytes: bytes.byteLength, pages: [{ sha256: page.sha256 }] });
    expect(archiveBuilder).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a signed preview expires or bytes do not match", async () => {
    await expect(buildProductionPageManifestArchive({
      projectId: "project", workId: "work", artifactId: "artifact", title: "원고", pages: [page],
      now: new Date("2026-09-26T00:00:00.000Z"),
      fetcher: vi.fn() as unknown as typeof fetch,
      archiveBuilder: vi.fn(),
    })).rejects.toMatchObject({ code: "LEASE_EXPIRED" } satisfies Partial<ProductionPageManifestArchiveError>);

    await expect(buildProductionPageManifestArchive({
      projectId: "project", workId: "work", artifactId: "artifact", title: "원고", pages: [page],
      now: new Date("2026-09-24T00:00:00.000Z"),
      fetcher: vi.fn(async () => new Response(new TextEncoder().encode("wrong"), { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch,
      archiveBuilder: vi.fn(),
    })).rejects.toMatchObject({ code: "SOURCE_SIZE_MISMATCH" } satisfies Partial<ProductionPageManifestArchiveError>);
  });
});

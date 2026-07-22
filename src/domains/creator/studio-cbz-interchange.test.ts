import { describe, expect, it } from "vitest";

import {
  buildStudioCbzBlob,
  buildStudioCbzBytes,
  compareStudioCbzPagePaths,
  importStudioCbz,
  STUDIO_CBZ_MIME,
  StudioCbzError,
  type StudioCbzErrorCode,
} from "./studio-cbz-interchange";
import { buildStudioPackageArchiveBytes } from "./studio-package-archive";
import { readStudioZipArchive } from "./studio-zip-reader";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function png(seed: number): Uint8Array {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, seed]);
}

function jpeg(seed: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed, 0xff, 0xd9]);
}

function webp(seed: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set(encoder.encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.byteLength - 8, true);
  bytes.set(encoder.encode("WEBP"), 8);
  bytes[12] = seed;
  return bytes;
}

async function expectCbzError(
  promise: Promise<unknown>,
  code: StudioCbzErrorCode
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (cause) {
    expect(cause).toBeInstanceOf(StudioCbzError);
    expect((cause as StudioCbzError).code).toBe(code);
  }
}

describe("CBZ interchange", () => {
  it("exports deterministic canonical page order and escaped ComicInfo metadata", async () => {
    const input = {
      pages: [{ image: png(1) }, { image: jpeg(2) }, { image: webp(3) }],
      metadata: {
        title: "Hero & <Villain>",
        series: 'Toon "Spectrum"',
        number: "12.5",
        volume: 2,
        summary: "One 'quoted' summary",
        writer: "Writer Kim",
        genre: ["Fantasy", "Drama & Comedy"],
        tags: ["webtoon", "vertical scroll"],
        languageISO: "ko",
        blackAndWhite: false,
      },
    };
    const first = await buildStudioCbzBytes(input);
    const second = await buildStudioCbzBytes(input);
    expect([...first.bytes]).toEqual([...second.bytes]);
    expect(first.warnings).toEqual([]);

    const zip = await readStudioZipArchive(first.bytes);
    expect(zip.entries.map((entry) => entry.path)).toEqual([
      "ComicInfo.xml",
      "pages/0001.png",
      "pages/0002.jpg",
      "pages/0003.webp",
    ]);
    const xml = decoder.decode(await zip.readEntry("ComicInfo.xml"));
    expect(xml).toContain("<Title>Hero &amp; &lt;Villain&gt;</Title>");
    expect(xml).toContain("<Series>Toon &quot;Spectrum&quot;</Series>");
    expect(xml).toContain("<Genre>Fantasy, Drama &amp; Comedy</Genre>");
    expect(xml).toContain('<Page Image="0" Type="FrontCover"/>');
    expect(xml).toContain("<PageCount>3</PageCount>");

    const imported = await importStudioCbz(first.bytes);
    expect(imported.pages.map(({ index, path, mimeType }) => ({ index, path, mimeType }))).toEqual([
      { index: 0, path: "pages/0001.png", mimeType: "image/png" },
      { index: 1, path: "pages/0002.jpg", mimeType: "image/jpeg" },
      { index: 2, path: "pages/0003.webp", mimeType: "image/webp" },
    ]);
    expect(imported.metadata).toMatchObject({
      title: "Hero & <Villain>",
      series: 'Toon "Spectrum"',
      number: "12.5",
      volume: 2,
      summary: "One 'quoted' summary",
      writer: "Writer Kim",
      genre: ["Fantasy", "Drama & Comedy"],
      tags: ["webtoon", "vertical scroll"],
      languageISO: "ko",
      blackAndWhite: false,
    });
    expect(imported.warnings).toEqual([]);
    expect(imported.pages[2]?.image.type).toBe("image/webp");
  });

  it("builds an application/vnd.comicbook+zip Blob through the shared writer", async () => {
    const result = await buildStudioCbzBlob({ pages: [{ image: png(1) }] });
    expect(result.blob.type).toBe(STUDIO_CBZ_MIME);
    expect((await importStudioCbz(result.blob)).pages).toHaveLength(1);
  });

  it("uses deterministic natural ordering for arbitrary imported page paths", async () => {
    const archive = await buildStudioPackageArchiveBytes([
      { path: "page10.jpg", data: jpeg(10) },
      { path: "page02.png", data: png(2) },
      { path: "page2.png", data: png(3) },
      { path: "page001.webp", data: webp(1) },
      { path: "notes.txt", data: encoder.encode("ignore") },
    ]);

    const imported = await importStudioCbz(archive);
    expect(imported.pages.map((page) => page.path)).toEqual([
      "page001.webp",
      "page2.png",
      "page02.png",
      "page10.jpg",
    ]);
    expect(imported.warnings).toEqual([
      expect.objectContaining({ code: "COMICINFO_MISSING" }),
      expect.objectContaining({ code: "IGNORED_ENTRY", path: "notes.txt" }),
    ]);
    expect([
      "page10.png",
      "page2.png",
      "page001.png",
      "page02.png",
    ].sort(compareStudioCbzPagePaths)).toEqual([
      "page001.png",
      "page2.png",
      "page02.png",
      "page10.png",
    ]);
  });

  it("reports ComicInfo page-count mismatches", async () => {
    const archive = await buildStudioPackageArchiveBytes([
      {
        path: "ComicInfo.xml",
        data: encoder.encode(
          '<?xml version="1.0"?><ComicInfo><Title>Mismatch</Title><PageCount>9</PageCount></ComicInfo>'
        ),
      },
      { path: "1.png", data: png(1) },
      { path: "2.png", data: png(2) },
    ]);

    const imported = await importStudioCbz(archive);
    expect(imported.metadata.title).toBe("Mismatch");
    expect(imported.warnings).toEqual([
      expect.objectContaining({ code: "PAGE_COUNT_MISMATCH" }),
    ]);
  });

  it("rejects extension/signature mismatches and malformed image formats", async () => {
    const mismatch = await buildStudioPackageArchiveBytes([
      { path: "ComicInfo.xml", data: encoder.encode("<ComicInfo>") },
      { path: "page.jpg", data: png(1) },
    ]);
    await expectCbzError(importStudioCbz(mismatch), "COMICINFO_INVALID");

    const badImage = await buildStudioPackageArchiveBytes([
      { path: "page.png", data: encoder.encode("not png") },
    ]);
    await expectCbzError(importStudioCbz(badImage), "IMAGE_INVALID");

    const wrongExtension = await buildStudioPackageArchiveBytes([
      { path: "page.jpg", data: png(1) },
    ]);
    await expectCbzError(importStudioCbz(wrongExtension), "IMAGE_INVALID");

    const malformedWebp = webp(1);
    new DataView(malformedWebp.buffer).setUint32(4, 999, true);
    await expectCbzError(
      buildStudioCbzBytes({ pages: [{ image: malformedWebp }] }),
      "IMAGE_INVALID"
    );
  });

  it("rejects DTD, duplicate tags, invalid calendar metadata, and unknown entities", async () => {
    const cases = [
      '<!DOCTYPE ComicInfo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><ComicInfo><Title>&xxe;</Title></ComicInfo>',
      "<ComicInfo><Title>One</Title><Title>Two</Title></ComicInfo>",
      "<ComicInfo><Month>13</Month></ComicInfo>",
      "<ComicInfo><Title>&unknown;</Title></ComicInfo>",
    ];
    for (const xml of cases) {
      const archive = await buildStudioPackageArchiveBytes([
        { path: "ComicInfo.xml", data: encoder.encode(xml) },
        { path: "page.png", data: png(1) },
      ]);
      await expectCbzError(importStudioCbz(archive), "COMICINFO_INVALID");
    }
  });

  it("enforces page, byte, metadata, and abort limits", async () => {
    await expectCbzError(buildStudioCbzBytes({ pages: [] }), "PAGE_COUNT_LIMIT");
    await expectCbzError(
      buildStudioCbzBytes(
        { pages: [{ image: png(1) }, { image: png(2) }] },
        { limits: { maxPages: 1 } }
      ),
      "PAGE_COUNT_LIMIT"
    );
    await expectCbzError(
      buildStudioCbzBytes({ pages: [{ image: png(1) }] }, { limits: { maxPageBytes: 8 } }),
      "SIZE_LIMIT"
    );
    await expectCbzError(
      buildStudioCbzBytes(
        { pages: [{ image: png(1) }, { image: png(2) }] },
        { limits: { maxTotalPageBytes: 17 } }
      ),
      "SIZE_LIMIT"
    );
    await expectCbzError(
      buildStudioCbzBytes(
        { pages: [{ image: png(1) }], metadata: { title: "long title" } },
        { limits: { maxMetadataCharacters: 2 } }
      ),
      "COMICINFO_INVALID"
    );
    await expectCbzError(
      buildStudioCbzBytes({
        pages: [{ image: png(1) }],
        metadata: { title: "bad\u0000title" },
      }),
      "COMICINFO_INVALID"
    );
    await expectCbzError(
      buildStudioCbzBytes({
        pages: [{ image: png(1) }],
        metadata: { genre: ["Drama, Comedy"] },
      }),
      "COMICINFO_INVALID"
    );

    const controller = new AbortController();
    controller.abort();
    await expectCbzError(
      buildStudioCbzBytes({ pages: [{ image: png(1) }] }, { signal: controller.signal }),
      "ABORTED"
    );
  });

  it("rejects empty page archives and unsafe ZIP structures before decoding images", async () => {
    const noPages = await buildStudioPackageArchiveBytes([
      { path: "ComicInfo.xml", data: encoder.encode("<ComicInfo></ComicInfo>") },
      { path: "README.txt", data: encoder.encode("nothing") },
    ]);
    await expectCbzError(importStudioCbz(noPages), "PAGE_COUNT_LIMIT");

    const invalidZip = new Uint8Array([1, 2, 3]);
    await expectCbzError(importStudioCbz(invalidZip), "ARCHIVE_INVALID");
  });
});

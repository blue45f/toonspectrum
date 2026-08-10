import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import {
  buildInkBasicKpp,
  buildPressureCurveKpp,
} from "../brushes/kpp/synthetic-kpp";

const encoder = new TextEncoder();
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) {
    value = (CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffff_ffff) >>> 0;
}

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export interface ZipFixtureEntry {
  path: string;
  data?: Uint8Array;
  method?: 0 | 8;
  flags?: number;
  declaredCrc32?: number;
  declaredUncompressedBytes?: number;
  declaredCompressedBytes?: number;
}

export function buildFormatZipFixture(entries: readonly ZipFixtureEntry[]): Uint8Array {
  const prepared = entries.map((entry) => {
    const pathBytes = encoder.encode(entry.path);
    const data = entry.data ?? new Uint8Array();
    const method = entry.method ?? 0;
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    return {
      ...entry,
      pathBytes,
      data,
      method,
      compressed,
      flags: entry.flags ?? UTF8_FLAG,
      crc: entry.declaredCrc32 ?? crc32(data),
      compressedBytes: entry.declaredCompressedBytes ?? compressed.byteLength,
      uncompressedBytes: entry.declaredUncompressedBytes ?? data.byteLength,
      localOffset: 0,
    };
  });
  let localBytes = 0;
  for (const entry of prepared) {
    entry.localOffset = localBytes;
    localBytes += 30 + entry.pathBytes.byteLength + entry.compressed.byteLength;
  }
  const centralBytes = prepared.reduce(
    (sum, entry) => sum + 46 + entry.pathBytes.byteLength,
    0,
  );
  const output = new Uint8Array(localBytes + centralBytes + 22);
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const entry of prepared) {
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, entry.flags, true);
    view.setUint16(offset + 8, entry.method, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.compressedBytes, true);
    view.setUint32(offset + 22, entry.uncompressedBytes, true);
    view.setUint16(offset + 26, entry.pathBytes.byteLength, true);
    output.set(entry.pathBytes, offset + 30);
    output.set(entry.compressed, offset + 30 + entry.pathBytes.byteLength);
    offset += 30 + entry.pathBytes.byteLength + entry.compressed.byteLength;
  }
  const centralOffset = offset;
  for (const entry of prepared) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, entry.flags, true);
    view.setUint16(offset + 10, entry.method, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.compressedBytes, true);
    view.setUint32(offset + 24, entry.uncompressedBytes, true);
    view.setUint16(offset + 28, entry.pathBytes.byteLength, true);
    view.setUint32(offset + 42, entry.localOffset, true);
    output.set(entry.pathBytes, offset + 46);
    offset += 46 + entry.pathBytes.byteLength;
  }
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralBytes, true);
  view.setUint32(offset + 16, centralOffset, true);
  return output;
}

export interface KritaBundleFixtureResource {
  path: string;
  mediaType: string;
  data: Uint8Array;
  tags?: string[];
  method?: 0 | 8;
  manifestMd5?: string;
}

export interface KritaBundleFixtureOptions {
  resources?: KritaBundleFixtureResource[];
  compression?: "mixed" | "stored" | "deflate";
  manifestVersion?: string;
  bundleVersion?: string;
  includePreview?: boolean;
  includeManifest?: boolean;
  includeMetadata?: boolean;
  extraEntries?: ZipFixtureEntry[];
  metadataExtraXml?: string;
}

export const authoredMyb = encoder.encode(
  JSON.stringify({
    version: 3,
    group: "ToonSpectrum authored fixture",
    settings: {
      radius_logarithmic: {
        base_value: 2,
        inputs: { pressure: [[0, -1], [1, 1]] },
      },
      opaque: {
        base_value: 0.8,
        inputs: { pressure: [[0, -0.7], [1, 0.1]] },
      },
      slow_tracking: { base_value: 3, inputs: {} },
    },
  }),
);

export function defaultKritaBundleResources(): KritaBundleFixtureResource[] {
  return [
    {
      path: "paintoppresets/ink-basic.kpp",
      mediaType: "paintoppresets",
      data: buildInkBasicKpp(),
      tags: ["ink", "toonstudio"],
      method: 8,
    },
    {
      path: "paintoppresets/pressure.kpp",
      mediaType: "paintoppresets",
      data: buildPressureCurveKpp(),
      tags: ["pressure"],
    },
    {
      path: "paintoppresets/wash.myb",
      mediaType: "paintoppresets",
      data: authoredMyb,
      tags: ["watercolor"],
      method: 8,
    },
    {
      path: "patterns/paper.png",
      mediaType: "patterns",
      data: buildInkBasicKpp(),
    },
  ];
}

export function buildKritaBundleFixture(
  options: KritaBundleFixtureOptions = {},
): Uint8Array {
  const method = (mixedMethod: 0 | 8 = 0): 0 | 8 =>
    options.compression === "stored"
      ? 0
      : options.compression === "deflate"
        ? 8
        : mixedMethod;
  const resources = options.resources ?? defaultKritaBundleResources();
  const manifestEntries = resources.map((resource) => {
    const tags = resource.tags?.length
      ? `<manifest:tags>${resource.tags.map((tag) => `<manifest:tag>${xml(tag)}</manifest:tag>`).join("")}</manifest:tags>`
      : "";
    return `<manifest:file-entry manifest:media-type="${xml(resource.mediaType)}" manifest:full-path="${xml(resource.path)}" manifest:md5sum="${resource.manifestMd5 ?? md5(resource.data)}">${tags}</manifest:file-entry>`;
  });
  const manifest = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="${xml(options.manifestVersion ?? "1.2")}"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/x-krita-resourcebundle"/>${manifestEntries.join("")}</manifest:manifest>`,
  );
  const metadata = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8"?><meta:meta xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><meta:generator>Krita authored fixture</meta:generator><meta:version>${xml(options.bundleVersion ?? "1")}</meta:version><meta:author>ToonSpectrum QA</meta:author><dc:creator>ToonSpectrum Test Authors</dc:creator><dc:title>Authored Bundle</dc:title><dc:description>No third-party assets</dc:description><meta:creation-date>2026-08-09</meta:creation-date><dc:date>2026-08-09</dc:date><meta:meta-userdefined meta:name="license" meta:value="CC0-1.0"/><meta:meta-userdefined meta:name="website" meta:value="https://example.invalid/toonspectrum"/><meta:meta-userdefined meta:name="email" meta:value="qa@example.invalid"/><meta:meta-userdefined meta:name="tag" meta:value="authored"/>${options.metadataExtraXml ?? ""}</meta:meta>`,
  );
  const entries: ZipFixtureEntry[] = [];
  if (options.includeManifest !== false) {
    entries.push({ path: "META-INF/manifest.xml", data: manifest, method: method(8) });
  }
  if (options.includeMetadata !== false) {
    entries.push({ path: "meta.xml", data: metadata, method: method(8) });
  }
  if (options.includePreview !== false) {
    entries.push({ path: "preview.png", data: buildInkBasicKpp(), method: method() });
  }
  entries.push(
    ...resources.map((resource) => ({
      path: resource.path,
      data: resource.data,
      method: method(resource.method),
    })),
    ...(options.extraEntries ?? []),
  );
  return buildFormatZipFixture(entries);
}

export async function inflateFixtureRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const { inflateRawSync } = await import("node:zlib");
  return new Uint8Array(inflateRawSync(compressed));
}

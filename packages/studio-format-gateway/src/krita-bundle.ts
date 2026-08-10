import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";

import {
  FormatZipReaderError,
  readFormatZipArchive,
  type FormatZipInflateRawAdapter,
  type FormatZipReaderLimits,
  type FormatZipReaderSource,
} from "./bounded-zip";
import {
  bytesToBase64,
  md5Hex,
  parseSafeXml,
  stableTextId,
  xmlLocalName,
  type FormatIssue,
  type SafeXmlElement,
} from "./format-common";
import { parseKppPreset } from "./kpp";
import { importMybBrush } from "./myb";

import type { BrushProgramIR } from "@toonspectrum/studio-project-model";

const KRITA_MANIFEST_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
const KRITA_BUNDLE_MIME = "application/x-krita-resourcebundle";

export const KRITA_BUNDLE_LIMITS = Object.freeze({
  maxArchiveBytes: 128_000_000,
  maxEntries: 2_048,
  maxEntryCompressedBytes: 32_000_000,
  maxEntryUncompressedBytes: 32_000_000,
  maxTotalUncompressedBytes: 192_000_000,
  maxCentralDirectoryBytes: 4_000_000,
  maxPathBytes: 1_024,
  maxCompressionRatio: 100,
  maxCommentBytes: 8_192,
  maxManifestBytes: 2_000_000,
  maxMetadataBytes: 512_000,
});

export type KritaBundleErrorCode =
  | "archive-invalid"
  | "manifest-invalid"
  | "manifest-missing"
  | "metadata-invalid"
  | "metadata-missing"
  | "source-too-large";

export class KritaBundleError extends Error {
  constructor(
    message: string,
    readonly code: KritaBundleErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "KritaBundleError";
  }
}

export interface KritaBundleRights {
  author?: string;
  creator?: string;
  initialCreator?: string;
  license?: string;
  website?: string;
  email?: string;
  title?: string;
  description?: string;
  creationDate?: string;
  modifiedDate?: string;
  tags: string[];
}

export interface KritaBundleResource {
  path: string;
  mediaType: string;
  md5: string;
  tags: string[];
  compressedBytes: number;
  uncompressedBytes: number;
  status: "imported" | "preserved" | "rejected" | "missing";
}

export interface KritaBundleBrush {
  path: string;
  mediaType: string;
  tags: string[];
  md5: string;
  program: BrushProgramIR;
}

export interface KritaBundleImportResult {
  format: "krita-resource-bundle";
  manifestVersion: string | null;
  bundleVersion: string | null;
  metadata: Readonly<Record<string, string | string[]>>;
  rights: KritaBundleRights;
  resources: KritaBundleResource[];
  brushes: KritaBundleBrush[];
  warnings: FormatIssue[];
  unsupported: FormatIssue[];
  sourcePayload: { format: "krita-bundle"; base64: string };
}

export interface KritaBundleLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryCompressedBytes: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCentralDirectoryBytes: number;
  maxPathBytes: number;
  maxCompressionRatio: number;
  maxCommentBytes: number;
  maxManifestBytes: number;
  maxMetadataBytes: number;
}

export interface KritaBundleImportOptions {
  inflateRaw?: FormatZipInflateRawAdapter;
  signal?: AbortSignal;
  /** Callers may lower, never raise, the hard parser limits. */
  limits?: Partial<KritaBundleLimits>;
}

type ResolvedKritaBundleLimits = KritaBundleLimits;

interface ManifestReference {
  path: string;
  mediaType: string;
  md5: string;
  tags: string[];
}

function issue(
  scope: FormatIssue["scope"],
  code: string,
  message: string,
  path?: string,
): FormatIssue {
  return path === undefined ? { scope, code, message } : { scope, code, message, path };
}

function attributeByLocalName(element: SafeXmlElement, localName: string): string | undefined {
  for (const [name, value] of Object.entries(element.attrs)) {
    if (xmlLocalName(name) === localName) return value;
  }
  return undefined;
}

function childElements(element: SafeXmlElement, localName: string): SafeXmlElement[] {
  return element.children.filter((child) => xmlLocalName(child.name) === localName);
}

function normalizedText(element: SafeXmlElement): string {
  return element.text.trim();
}

function lowerLimits(
  requested: KritaBundleImportOptions["limits"],
): ResolvedKritaBundleLimits {
  const resolved: ResolvedKritaBundleLimits = { ...KRITA_BUNDLE_LIMITS };
  if (requested === undefined) return resolved;
  for (const key of Object.keys(KRITA_BUNDLE_LIMITS) as Array<keyof ResolvedKritaBundleLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > KRITA_BUNDLE_LIMITS[key]) {
      throw new KritaBundleError(
        `${key} must be an integer between 0 and ${KRITA_BUNDLE_LIMITS[key]}`,
        "source-too-large",
      );
    }
    resolved[key] = value;
  }
  return resolved;
}

async function sourceBytes(
  source: FormatZipReaderSource,
  maxArchiveBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (signal?.aborted) throw new DOMException("bundle import aborted", "AbortError");
  if (source instanceof Uint8Array) {
    if (source.byteLength > maxArchiveBytes) {
      throw new KritaBundleError("Krita bundle exceeds the archive safety limit", "source-too-large");
    }
    return source.slice();
  }
  if (source instanceof ArrayBuffer) return sourceBytes(new Uint8Array(source), maxArchiveBytes, signal);
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    if (source.size > maxArchiveBytes) {
      throw new KritaBundleError("Krita bundle exceeds the archive safety limit", "source-too-large");
    }
    const bytes = new Uint8Array(await source.arrayBuffer());
    if (signal?.aborted) throw new DOMException("bundle import aborted", "AbortError");
    return bytes;
  }
  throw new KritaBundleError("unsupported Krita bundle byte source", "archive-invalid");
}

function parseManifest(xml: string): {
  version: string | null;
  references: ManifestReference[];
  unsupported: FormatIssue[];
} {
  const root = parseSafeXml(xml, { maxCharacters: KRITA_BUNDLE_LIMITS.maxManifestBytes });
  if (
    xmlLocalName(root.name) !== "manifest" ||
    root.attrs["xmlns:manifest"] !== KRITA_MANIFEST_NAMESPACE
  ) {
    throw new KritaBundleError(
      "META-INF/manifest.xml has the wrong root or namespace",
      "manifest-invalid",
    );
  }
  const version = attributeByLocalName(root, "version") ?? null;
  const references: ManifestReference[] = [];
  const unsupported: FormatIssue[] = [];
  const paths = new Set<string>();
  for (const child of root.children) {
    if (xmlLocalName(child.name) !== "file-entry") {
      unsupported.push(
        issue("metadata", "manifest-element-unsupported", `manifest element ${child.name} is preserved`),
      );
      continue;
    }
    const path = attributeByLocalName(child, "full-path");
    const mediaType = attributeByLocalName(child, "media-type");
    const md5 = attributeByLocalName(child, "md5sum");
    if (path === "/" && mediaType === KRITA_BUNDLE_MIME) continue;
    if (path === undefined || mediaType === undefined || md5 === undefined) {
      unsupported.push(
        issue(
          "metadata",
          "manifest-entry-invalid",
          "manifest file-entry is missing full-path, media-type, or md5sum",
          path,
        ),
      );
      continue;
    }
    if (!/^[0-9a-f]{32}$/iu.test(md5)) {
      unsupported.push(
        issue("metadata", "manifest-md5-invalid", `manifest md5sum is not 32 hex digits: ${md5}`, path),
      );
      continue;
    }
    if (paths.has(path)) {
      throw new KritaBundleError(`duplicate manifest path ${path}`, "manifest-invalid");
    }
    paths.add(path);
    const tagsElement = childElements(child, "tags")[0];
    const tags = tagsElement === undefined
      ? []
      : childElements(tagsElement, "tag").map(normalizedText).filter(Boolean);
    for (const nested of child.children) {
      if (xmlLocalName(nested.name) !== "tags") {
        unsupported.push(
          issue(
            "metadata",
            "manifest-entry-element-unsupported",
            `manifest entry element ${nested.name} is preserved`,
            path,
          ),
        );
      }
    }
    references.push({ path, mediaType, md5: md5.toLowerCase(), tags });
  }
  return { version, references, unsupported };
}

function parseMetadata(xml: string): {
  version: string | null;
  metadata: Record<string, string | string[]>;
  rights: KritaBundleRights;
  unsupported: FormatIssue[];
} {
  const root = parseSafeXml(xml, { maxCharacters: KRITA_BUNDLE_LIMITS.maxMetadataBytes });
  if (xmlLocalName(root.name) !== "meta") {
    throw new KritaBundleError("meta.xml root is not meta:meta", "metadata-invalid");
  }
  const metadata: Record<string, string | string[]> = {};
  const tags: string[] = [];
  const unsupported: FormatIssue[] = [];
  for (const child of root.children) {
    const local = xmlLocalName(child.name);
    if (local === "meta-userdefined") {
      const name = attributeByLocalName(child, "name");
      const value = attributeByLocalName(child, "value") ?? normalizedText(child);
      if (name === undefined) {
        unsupported.push(
          issue("metadata", "metadata-userdefined-invalid", "meta-userdefined has no name"),
        );
        continue;
      }
      if (name === "tag") tags.push(value);
      else metadata[name] = value;
      continue;
    }
    const key = child.name === "cd:creator" ? "dc:creator" : child.name;
    const value = normalizedText(child);
    if (metadata[key] === undefined) metadata[key] = value;
    const known = new Set([
      "generator",
      "version",
      "author",
      "title",
      "description",
      "initial-creator",
      "creator",
      "creation-date",
      "date",
      "email",
      "license",
      "website",
    ]);
    if (!known.has(local)) {
      unsupported.push(
        issue("metadata", "metadata-field-unsupported", `metadata field ${child.name} is preserved`),
      );
    }
  }
  const read = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return undefined;
  };
  const rights: KritaBundleRights = {
    tags: [...new Set(tags)].sort(),
  };
  const assign = <Key extends Exclude<keyof KritaBundleRights, "tags">>(
    key: Key,
    value: string | undefined,
  ): void => {
    if (value !== undefined) rights[key] = value;
  };
  assign("author", read("meta:author", "author"));
  assign("creator", read("dc:creator", "creator"));
  assign("initialCreator", read("meta:initial-creator", "initial-creator"));
  assign("license", read("meta:license", "license"));
  assign("website", read("meta:website", "website"));
  assign("email", read("meta:email", "email"));
  assign("title", read("dc:title", "meta:title", "title"));
  assign("description", read("dc:description", "meta:description", "description"));
  assign("creationDate", read("meta:creation-date", "creation-date"));
  assign("modifiedDate", read("dc:date", "date"));
  return {
    version: read("meta:version", "version") ?? null,
    metadata,
    rights,
    unsupported,
  };
}

function deterministicProgramId(format: "kpp" | "myb", path: string, bytes: Uint8Array): string {
  const pathBytes = new TextEncoder().encode(path);
  const identity = new Uint8Array(pathBytes.byteLength + 1 + bytes.byteLength);
  identity.set(pathBytes);
  identity[pathBytes.byteLength] = 0;
  identity.set(bytes, pathBytes.byteLength + 1);
  return stableTextId(`krita-bundle-${format}`, identity);
}

function basenameWithoutExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function importKritaBundle(
  source: FormatZipReaderSource,
  options: KritaBundleImportOptions = {},
): Promise<KritaBundleImportResult> {
  const limits = lowerLimits(options.limits);
  const bytes = await sourceBytes(source, limits.maxArchiveBytes, options.signal);
  const zipLimits: Partial<FormatZipReaderLimits> = {
    maxArchiveBytes: limits.maxArchiveBytes,
    maxEntries: limits.maxEntries,
    maxEntryCompressedBytes: limits.maxEntryCompressedBytes,
    maxEntryUncompressedBytes: limits.maxEntryUncompressedBytes,
    maxTotalUncompressedBytes: limits.maxTotalUncompressedBytes,
    maxCentralDirectoryBytes: limits.maxCentralDirectoryBytes,
    maxPathBytes: limits.maxPathBytes,
    maxCompressionRatio: limits.maxCompressionRatio,
    maxCommentBytes: limits.maxCommentBytes,
  };
  let archive: Awaited<ReturnType<typeof readFormatZipArchive>>;
  try {
    archive = await readFormatZipArchive(bytes, {
      inflateRaw: options.inflateRaw,
      limits: zipLimits,
      signal: options.signal,
    });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw new KritaBundleError(`invalid Krita ZIP container${detail}`, "archive-invalid", cause);
  }

  const manifestEntry = archive.getEntry("META-INF/manifest.xml");
  if (manifestEntry === undefined) {
    throw new KritaBundleError("Krita bundle has no META-INF/manifest.xml", "manifest-missing");
  }
  const metadataEntry = archive.getEntry("meta.xml");
  if (metadataEntry === undefined) {
    throw new KritaBundleError("Krita bundle has no meta.xml", "metadata-missing");
  }
  if (manifestEntry.uncompressedBytes > limits.maxManifestBytes) {
    throw new KritaBundleError("Krita manifest exceeds its safety limit", "manifest-invalid");
  }
  if (metadataEntry.uncompressedBytes > limits.maxMetadataBytes) {
    throw new KritaBundleError("Krita metadata exceeds its safety limit", "metadata-invalid");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let manifest: ReturnType<typeof parseManifest>;
  let metadata: ReturnType<typeof parseMetadata>;
  try {
    manifest = parseManifest(decoder.decode(await archive.readEntry(manifestEntry)));
  } catch (cause) {
    if (cause instanceof KritaBundleError) throw cause;
    throw new KritaBundleError("Krita manifest is malformed", "manifest-invalid", cause);
  }
  try {
    metadata = parseMetadata(decoder.decode(await archive.readEntry(metadataEntry)));
  } catch (cause) {
    if (cause instanceof KritaBundleError) throw cause;
    throw new KritaBundleError("Krita metadata is malformed", "metadata-invalid", cause);
  }

  const warnings: FormatIssue[] = [];
  const unsupported = [...manifest.unsupported, ...metadata.unsupported];
  if (manifest.version !== "1.2") {
    unsupported.push(
      issue(
        "metadata",
        "manifest-version-unverified",
        `manifest version ${manifest.version ?? "missing"} is parsed conservatively; only 1.2 is verified`,
      ),
    );
  }
  if (metadata.version !== "1") {
    unsupported.push(
      issue(
        "metadata",
        "bundle-version-unverified",
        `bundle version ${metadata.version ?? "missing"} is not the verified version 1`,
      ),
    );
  }
  if (archive.getEntry("preview.png") === undefined) {
    warnings.push(issue("container", "preview-missing", "bundle has no optional preview.png"));
  }

  const resources: KritaBundleResource[] = [];
  const brushes: KritaBundleBrush[] = [];
  const manifestPaths = new Set(manifest.references.map((reference) => reference.path));
  for (const reference of manifest.references) {
    const entry = archive.getEntry(reference.path);
    if (entry === undefined || entry.directory) {
      resources.push({
        ...reference,
        compressedBytes: 0,
        uncompressedBytes: 0,
        status: "missing",
      });
      unsupported.push(
        issue("resource", "manifest-resource-missing", "manifest resource is absent from ZIP", reference.path),
      );
      continue;
    }
    let resourceBytes: Uint8Array;
    try {
      resourceBytes = await archive.readEntry(entry, { signal: options.signal });
    } catch (cause) {
      const detail = cause instanceof FormatZipReaderError ? `${cause.code}: ${cause.message}` : String(cause);
      resources.push({
        ...reference,
        compressedBytes: entry.compressedBytes,
        uncompressedBytes: entry.uncompressedBytes,
        status: "rejected",
      });
      unsupported.push(
        issue("resource", "resource-read-failed", detail, reference.path),
      );
      continue;
    }
    const computedMd5 = md5Hex(resourceBytes);
    if (computedMd5 !== reference.md5) {
      resources.push({
        ...reference,
        compressedBytes: entry.compressedBytes,
        uncompressedBytes: entry.uncompressedBytes,
        status: "rejected",
      });
      unsupported.push(
        issue(
          "resource",
          "resource-md5-mismatch",
          `manifest ${reference.md5}, computed ${computedMd5}`,
          reference.path,
        ),
      );
      continue;
    }

    const lowerPath = reference.path.toLowerCase();
    const isPreset = reference.mediaType === "paintoppresets" || lowerPath.startsWith("paintoppresets/");
    let imported = false;
    if (isPreset && lowerPath.endsWith(".kpp")) {
      try {
        const parsed = parseKppPreset(resourceBytes);
        const program = brushProgramIRSchema.parse({
          ...parsed.program,
          id: deterministicProgramId("kpp", reference.path, resourceBytes),
        });
        brushes.push({
          path: reference.path,
          mediaType: reference.mediaType,
          tags: reference.tags,
          md5: reference.md5,
          program,
        });
        for (const message of parsed.warnings) {
          warnings.push(issue("semantic", "kpp-warning", message, reference.path));
        }
        for (const unmapped of parsed.unmapped) {
          unsupported.push(
            issue("semantic", "kpp-field-unmapped", `KPP field ${unmapped} is preserved`, reference.path),
          );
        }
        imported = true;
      } catch (cause) {
        unsupported.push(
          issue(
            "semantic",
            "kpp-import-failed",
            cause instanceof Error ? cause.message : String(cause),
            reference.path,
          ),
        );
      }
    } else if (isPreset && lowerPath.endsWith(".myb")) {
      try {
        const id = deterministicProgramId("myb", reference.path, resourceBytes);
        const parsed = importMybBrush(
          resourceBytes,
          id,
          basenameWithoutExtension(reference.path) || id,
        );
        brushes.push({
          path: reference.path,
          mediaType: reference.mediaType,
          tags: reference.tags,
          md5: reference.md5,
          program: parsed.preset,
        });
        for (const unmapped of parsed.unmappedSettings) {
          unsupported.push(
            issue("semantic", "myb-setting-unmapped", `MYB setting ${unmapped} is preserved`, reference.path),
          );
        }
        imported = true;
      } catch (cause) {
        unsupported.push(
          issue(
            "semantic",
            "myb-import-failed",
            cause instanceof Error ? cause.message : String(cause),
            reference.path,
          ),
        );
      }
    } else {
      unsupported.push(
        issue(
          "resource",
          "resource-type-preserved",
          `resource ${reference.mediaType} has no semantic lowering lane`,
          reference.path,
        ),
      );
    }
    resources.push({
      ...reference,
      compressedBytes: entry.compressedBytes,
      uncompressedBytes: entry.uncompressedBytes,
      status: imported ? "imported" : "preserved",
    });
  }

  for (const entry of archive.entries) {
    if (
      entry.directory ||
      entry.path === "META-INF/manifest.xml" ||
      entry.path === "meta.xml" ||
      entry.path === "preview.png" ||
      manifestPaths.has(entry.path)
    ) {
      continue;
    }
    unsupported.push(
      issue(
        "resource",
        "unmanifested-resource",
        "ZIP entry is not declared by the Krita manifest and is preserved only in sourcePayload",
        entry.path,
      ),
    );
  }

  resources.sort((left, right) => compareCodePoints(left.path, right.path));
  brushes.sort((left, right) => compareCodePoints(left.path, right.path));
  return {
    format: "krita-resource-bundle",
    manifestVersion: manifest.version,
    bundleVersion: metadata.version,
    metadata: metadata.metadata,
    rights: metadata.rights,
    resources,
    brushes,
    warnings,
    unsupported,
    sourcePayload: { format: "krita-bundle", base64: bytesToBase64(bytes) },
  };
}

export const STUDIO_IMPORT_FORMATS = [
  "toonstudio",
  "json",
  "psd",
  "psb",
  "ora",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "tif",
  "tiff",
  "svg",
  "pdf",
  "epub",
  "cbz",
  "pptx",
  "abr",
  "myb",
  "kpp",
  "glb",
  "gltf",
  "vrm",
  "obj",
  "mp4",
  "webm",
  "gif",
  "wav",
  "mp3",
  "unknown",
] as const;

export type StudioImportFormat = (typeof STUDIO_IMPORT_FORMATS)[number];
export type StudioImportFidelity = "preserved" | "converted" | "flattened" | "unsupported";
export type StudioImportItemStatus = "accepted" | "review" | "blocked";

export interface StudioImportFileDescriptor {
  readonly name: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface StudioImportFormatProfile {
  readonly format: StudioImportFormat;
  readonly fidelity: StudioImportFidelity;
  readonly destination: "project" | "document" | "asset" | "media" | "none";
  readonly preservedFeatures: readonly string[];
  readonly losses: readonly string[];
  readonly notes: readonly string[];
}

export interface StudioImportPlanItem {
  readonly file: StudioImportFileDescriptor;
  readonly format: StudioImportFormat;
  readonly status: StudioImportItemStatus;
  readonly fidelity: StudioImportFidelity;
  readonly destination: StudioImportFormatProfile["destination"];
  readonly preservedFeatures: readonly string[];
  readonly losses: readonly string[];
  readonly warnings: readonly string[];
  readonly safeAction: "open" | "convert-copy" | "flatten-copy" | "reject";
  readonly requiresConfirmation: boolean;
}

export interface StudioImportPlan {
  readonly status: StudioImportItemStatus;
  readonly acceptedCount: number;
  readonly reviewCount: number;
  readonly blockedCount: number;
  readonly items: readonly StudioImportPlanItem[];
}

const MAX_IMPORT_BYTES = 8 * 1024 * 1024 * 1024;
const DANGEROUS_EXTENSIONS = new Set([
  "app",
  "bat",
  "cmd",
  "com",
  "dll",
  "dmg",
  "exe",
  "jar",
  "js",
  "msi",
  "pkg",
  "sh",
]);

function importProfile(
  format: StudioImportFormat,
  fidelity: StudioImportFidelity,
  destination: StudioImportFormatProfile["destination"],
  preservedFeatures: readonly string[],
  losses: readonly string[] = [],
  notes: readonly string[] = [],
): StudioImportFormatProfile {
  return Object.freeze({
    format,
    fidelity,
    destination,
    preservedFeatures: Object.freeze([...preservedFeatures]),
    losses: Object.freeze([...losses]),
    notes: Object.freeze([...notes]),
  });
}

const PROFILE_BY_FORMAT: Readonly<Record<StudioImportFormat, StudioImportFormatProfile>> =
  Object.freeze({
    toonstudio: importProfile("toonstudio", "preserved", "project", ["documents", "assets", "history", "rights"]),
    json: importProfile("json", "preserved", "project", ["project data", "document structure"]),
    psd: importProfile("psd", "converted", "document", ["layers", "groups", "masks", "text when compatible"], ["unsupported smart filters", "some blend modes"], ["The original file remains linked to the import receipt."]),
    psb: importProfile("psb", "converted", "document", ["large canvas", "layers", "groups"], ["unsupported smart objects", "some effects"]),
    ora: importProfile("ora", "preserved", "document", ["layers", "groups", "basic blend modes"]),
    png: importProfile("png", "preserved", "document", ["pixels", "alpha", "color profile"]),
    jpg: importProfile("jpg", "preserved", "document", ["pixels", "color profile"]),
    jpeg: importProfile("jpeg", "preserved", "document", ["pixels", "color profile"]),
    webp: importProfile("webp", "preserved", "document", ["pixels", "alpha", "animation when supported"]),
    avif: importProfile("avif", "preserved", "document", ["pixels", "alpha", "wide color"]),
    tif: importProfile("tif", "converted", "document", ["pixels", "alpha", "high bit depth"], ["some private tags"]),
    tiff: importProfile("tiff", "converted", "document", ["pixels", "alpha", "high bit depth"], ["some private tags"]),
    svg: importProfile("svg", "converted", "document", ["paths", "text", "basic effects"], ["scripts", "external resources", "unsupported filters"]),
    pdf: importProfile("pdf", "converted", "document", ["pages", "vector paths when supported", "text when embedded"], ["interactive forms", "some transparency effects"]),
    epub: importProfile("epub", "converted", "project", ["chapters", "images", "reading order", "metadata"], ["unsupported scripting", "vendor-specific layout"]),
    cbz: importProfile("cbz", "converted", "project", ["page order", "images"], ["unsupported metadata"]),
    pptx: importProfile("pptx", "converted", "document", ["slides", "text", "images", "basic shapes"], ["unsupported animations", "embedded macros", "some charts"]),
    abr: importProfile("abr", "converted", "asset", ["brush tip", "spacing", "basic dynamics"], ["Photoshop-only dynamics and texture modes"]),
    myb: importProfile("myb", "converted", "asset", ["size", "opacity", "pressure", "basic tip"], ["unsupported MyPaint engine behavior"]),
    kpp: importProfile("kpp", "converted", "asset", ["size", "opacity", "pressure", "basic tip"], ["unsupported Krita engine behavior"]),
    glb: importProfile("glb", "converted", "asset", ["meshes", "materials", "textures", "animation"], ["unsupported extensions"]),
    gltf: importProfile("gltf", "converted", "asset", ["meshes", "materials", "textures", "animation"], ["unsafe external resources are rejected"]),
    vrm: importProfile("vrm", "converted", "asset", ["character rig", "expressions", "materials"], ["unsupported VRM extensions"]),
    obj: importProfile("obj", "converted", "asset", ["meshes", "UVs", "materials when supplied"], ["rigging", "animation", "PBR material data"]),
    mp4: importProfile("mp4", "preserved", "media", ["video", "audio", "timing"]),
    webm: importProfile("webm", "preserved", "media", ["video", "audio", "timing"]),
    gif: importProfile("gif", "converted", "media", ["frames", "timing", "transparency"], ["original color depth"]),
    wav: importProfile("wav", "preserved", "media", ["audio", "sample rate", "bit depth"]),
    mp3: importProfile("mp3", "preserved", "media", ["audio", "timing", "metadata"]),
    unknown: importProfile("unknown", "unsupported", "none", [], ["format is not supported"]),
  });

function extension(name: string): string {
  const normalized = name.trim().toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  return lastDot > -1 ? normalized.slice(lastDot + 1) : "";
}

export function detectStudioImportFormat(
  file: Pick<StudioImportFileDescriptor, "name" | "mimeType">,
): StudioImportFormat {
  const fileExtension = extension(file.name);
  if ((STUDIO_IMPORT_FORMATS as readonly string[]).includes(fileExtension)) {
    return fileExtension as StudioImportFormat;
  }
  const mime = file.mimeType.toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "application/pdf") return "pdf";
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "video/mp4") return "mp4";
  return "unknown";
}

function planItem(file: StudioImportFileDescriptor): StudioImportPlanItem {
  const name = file.name.trim();
  if (!name || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) {
    throw new Error("Import files require a name and positive byte size.");
  }
  const fileExtension = extension(name);
  const warnings: string[] = [];
  if (DANGEROUS_EXTENSIONS.has(fileExtension)) {
    return Object.freeze({
      file,
      format: "unknown",
      status: "blocked",
      fidelity: "unsupported",
      destination: "none",
      preservedFeatures: Object.freeze([]),
      losses: Object.freeze(["executable content is not accepted"]),
      warnings: Object.freeze(["For safety, executable files cannot be imported."]),
      safeAction: "reject",
      requiresConfirmation: false,
    });
  }
  if (file.sizeBytes > MAX_IMPORT_BYTES) {
    return Object.freeze({
      file,
      format: detectStudioImportFormat(file),
      status: "blocked",
      fidelity: "unsupported",
      destination: "none",
      preservedFeatures: Object.freeze([]),
      losses: Object.freeze(["file exceeds the import size limit"]),
      warnings: Object.freeze(["Split or optimize the source before importing."]),
      safeAction: "reject",
      requiresConfirmation: false,
    });
  }

  const format = detectStudioImportFormat(file);
  const profile = PROFILE_BY_FORMAT[format];
  if (fileExtension && format === "unknown") {
    warnings.push(`Unknown extension: .${fileExtension}`);
  }
  const status: StudioImportItemStatus = profile.fidelity === "unsupported"
    ? "blocked"
    : profile.fidelity === "preserved"
      ? "accepted"
      : "review";
  const safeAction = profile.fidelity === "preserved"
    ? "open"
    : profile.fidelity === "converted"
      ? "convert-copy"
      : profile.fidelity === "flattened"
        ? "flatten-copy"
        : "reject";
  return Object.freeze({
    file,
    format,
    status,
    fidelity: profile.fidelity,
    destination: profile.destination,
    preservedFeatures: profile.preservedFeatures,
    losses: profile.losses,
    warnings: Object.freeze([...profile.notes, ...warnings]),
    safeAction,
    requiresConfirmation: status === "review",
  });
}

export function planStudioImport(
  files: readonly StudioImportFileDescriptor[],
): StudioImportPlan {
  if (files.length === 0) throw new Error("Select at least one file to import.");
  const items = files.map(planItem);
  const acceptedCount = items.filter((item) => item.status === "accepted").length;
  const reviewCount = items.filter((item) => item.status === "review").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  return Object.freeze({
    status: blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review" : "accepted",
    acceptedCount,
    reviewCount,
    blockedCount,
    items: Object.freeze(items),
  });
}

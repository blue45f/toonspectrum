/** Local-only Blender package preflight. No model installation or network access. */
import {
  parseStudioVrmBlenderCharacterPackage,
  selectStudioVrmBlenderRuntimeAsset,
} from "./studio-vrm-blender-character-package";

import type { StudioVrmBlenderCharacterPackage, StudioVrmBlenderRuntimeAsset } from "./studio-vrm-blender-character-package";

export const BLENDER_PACKAGE_LIMITS = Object.freeze({ manifest: 1_000_000, runtime: 256_000_000, files: 256 });
export interface BlenderPackagePreview {
  readonly manifest: StudioVrmBlenderCharacterPackage;
  readonly asset: StudioVrmBlenderRuntimeAsset;
  readonly runtimeFile: File;
  readonly meshes: number;
  readonly animations: number;
  readonly skins: number;
  readonly morphTargets: number;
  readonly hasVrm: boolean;
}
interface PackageEntry {
  readonly path: string;
  readonly size: number;
  read(): Promise<ArrayBuffer>;
}
interface ImportOptions { readonly prefer?: "vrm" | "glb"; readonly signal?: AbortSignal }

function checkAbort(signal?: AbortSignal): void { signal?.throwIfAborted(); }
function basename(path: string): string { return path.split("/").at(-1) ?? path; }
function key(path: string): string { return path.normalize("NFC").toLowerCase(); }
function safePath(path: string): string {
  if (!path || path.startsWith("/") || /[\\<>:"|?*]/u.test(path)
    || [...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("패키지에 안전하지 않은 파일 경로가 있습니다.");
  }
  return path;
}
async function fileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result) : reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsArrayBuffer(file);
  });
}
async function entriesOf(files: readonly File[], signal?: AbortSignal): Promise<readonly PackageEntry[]> {
  if (!files.length || files.length > BLENDER_PACKAGE_LIMITS.files) throw new Error("파일은 1~256개까지 선택할 수 있습니다.");
  const zip = files.filter((file) => /\.zip$/iu.test(file.name));
  if (zip.length) {
    if (files.length !== 1) throw new Error("ZIP 패키지는 하나만 선택해 주세요.");
    const { readStudioZipArchive } = await import("../studio-zip-reader");
    checkAbort(signal);
    const archive = await readStudioZipArchive(zip[0]!, { signal, limits: { maxEntries: BLENDER_PACKAGE_LIMITS.files } });
    return archive.entries.filter((entry) => !entry.directory).map((entry) => ({
      path: safePath(entry.path), size: entry.uncompressedBytes,
      read: async () => new Uint8Array(await archive.readEntry(entry, { signal })).buffer,
    }));
  }
  return files.map((file) => ({ path: safePath(file.webkitRelativePath || file.name), size: file.size, read: () => fileBytes(file) }));
}
function runtimeEntry(entries: readonly PackageEntry[], manifestPath: string, path: string): PackageEntry {
  const parent = manifestPath.slice(0, manifestPath.length - basename(manifestPath).length);
  const exact = entries.filter((entry) => key(entry.path) === key(parent + path));
  // Multiple-file pickers lose directories. Only allow basename fallback for a flat selection.
  const matches = exact.length ? exact : entries.every((entry) => !entry.path.includes("/"))
    ? entries.filter((entry) => key(entry.path) === key(basename(path))) : [];
  if (matches.length > 1) throw new Error(`${basename(path)} 파일이 중복되어 구분할 수 없습니다.`);
  if (!matches.length) throw new Error(`패키지가 가리키는 ${basename(path)} 파일을 함께 선택해 주세요.`);
  return matches[0]!;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("GLB 구조가 올바르지 않습니다.");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function inspectGlb(bytes: ArrayBuffer, role: "vrm" | "glb"): Omit<BlenderPackagePreview, "manifest" | "asset" | "runtimeFile"> {
  if (bytes.byteLength < 20) throw new Error("GLB/VRM 파일 헤더가 너무 짧습니다.");
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error("올바른 glTF 2.0 GLB/VRM 파일이 아닙니다.");
  }
  const length = view.getUint32(12, true);
  if (!length || length % 4 !== 0 || length > 16_000_000 || 20 + length > bytes.byteLength) throw new Error("GLB JSON 크기가 올바르지 않습니다.");
  let offset = 12;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error("GLB 청크가 손상되었습니다.");
    const chunkLength = view.getUint32(offset, true);
    if (chunkLength % 4 !== 0 || offset + 8 + chunkLength > bytes.byteLength) throw new Error("GLB 청크가 손상되었습니다.");
    offset += 8 + chunkLength;
  }
  const json = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, 20, length))));
  if (object(json.asset).version !== "2.0") throw new Error("glTF 2.0 에셋만 지원합니다.");
  for (const resource of [...array(json.buffers), ...array(json.images)]) {
    const uri = object(resource).uri;
    if (uri !== undefined && (typeof uri !== "string" || !uri.startsWith("data:"))) {
      throw new Error("외부 텍스처·버퍼가 있습니다. Blender에서 리소스를 포함한 GLB로 다시 내보내 주세요.");
    }
  }
  const extensions = json.extensions === undefined ? {} : object(json.extensions);
  const hasVrm = Boolean(extensions.VRM || extensions.VRMC_vrm);
  if (role === "vrm" && !hasVrm) throw new Error("VRM 확장이 없습니다. 확장자만 바꾸지 말고 공식 VRM 내보내기를 사용해 주세요.");
  const meshes = array(json.meshes);
  if (!meshes.length) throw new Error("표시할 메시가 없는 패키지입니다.");
  return {
    meshes: meshes.length, animations: array(json.animations).length, skins: array(json.skins).length, hasVrm,
    morphTargets: meshes.reduce<number>((sum, mesh) => sum + Math.max(0,
      ...array(object(mesh).primitives).map((primitive) => array(object(primitive).targets).length)), 0),
  };
}
export async function prepareBlenderCharacterPackage(files: readonly File[], options: ImportOptions = {}): Promise<BlenderPackagePreview> {
  checkAbort(options.signal);
  const entries = await entriesOf(files, options.signal);
  const seen = new Set<string>();
  for (const entry of entries) {
    const pathKey = key(entry.path);
    if (seen.has(pathKey)) throw new Error("중복된 파일 경로가 있습니다. 패키지를 하나씩 선택해 주세요.");
    seen.add(pathKey);
  }
  const manifests = entries.filter((entry) => key(basename(entry.path)) === "character-package.json");
  if (manifests.length !== 1) throw new Error("character-package.json 을 하나만 함께 선택해 주세요.");
  const manifestEntry = manifests[0]!;
  if (manifestEntry.size > BLENDER_PACKAGE_LIMITS.manifest) throw new Error("패키지 설명 파일은 1 MB 이하여야 합니다.");
  const manifest = parseStudioVrmBlenderCharacterPackage(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await manifestEntry.read())));
  checkAbort(options.signal);
  const asset = selectStudioVrmBlenderRuntimeAsset(manifest, { prefer: options.prefer });
  const entry = runtimeEntry(entries, manifestEntry.path, asset.file.path);
  if (entry.size !== asset.file.bytes) throw new Error(`${basename(entry.path)} 크기가 패키지 기록과 다릅니다 (${entry.size} ≠ ${asset.file.bytes}바이트).`);
  if (entry.size > BLENDER_PACKAGE_LIMITS.runtime) throw new Error("모델 파일은 256 MB 이하여야 합니다. 원본 품질은 유지하고 패키지를 분리해 주세요.");
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 검증이 필요합니다. HTTPS 또는 localhost에서 다시 열어 주세요.");
  const bytes = await entry.read();
  checkAbort(options.signal);
  if (bytes.byteLength !== asset.file.bytes) throw new Error("읽는 도중 파일 크기가 변경되었습니다.");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  checkAbort(options.signal);
  const digest = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== asset.file.sha256) throw new Error(`${basename(entry.path)} 의 SHA-256 이 패키지 기록과 다릅니다.`);
  const summary = inspectGlb(bytes, asset.role);
  return { manifest, asset, runtimeFile: new File([bytes], basename(asset.file.path), { type: "model/gltf-binary" }), ...summary };
}

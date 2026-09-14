import { evaluateIccCurve, parseIccProfile, type StudioIccCurve, type StudioIccProfile } from "../render/studio-canvaskit-icc-profile";
import { auditStudioIccProfilePolicy, type StudioIccProviderManifest } from "../studio-icc-profile-policy";
import { STUDIO_COLOR_PROOF_MAX_PROFILE_BYTES, parseStudioColorProofDocument, type StudioColorProofDocument } from "./studio-color-proof-document";

// IEC sRGB, Bradford-adapted D50 PCS. The display/source uses the exact piecewise sRGB transfer,
// never the approximate gamma-2.2 profile builder used by the older PDF path.
const SRGB_D50 = [[0.4360747, 0.3850649, 0.1430804], [0.2225045, 0.7168786, 0.0606169], [0.0139322, 0.0971045, 0.7141733]];
type Matrix = readonly (readonly number[])[];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const decodeSrgb = (n: number) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const encodeSrgb = (n: number) => n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055;
const SOURCE_LUT = Array.from({ length: 256 }, (_, n) => decodeSrgb(n / 255));
function multiply(a: Matrix, b: Matrix): number[][] {
  return a.map(row => [0, 1, 2].map(col => row.reduce((sum, x, i) => sum + x * b[i]![col]!, 0)));
}
function vector(m: Matrix, v: readonly number[]): number[] {
  return m.map(row => row.reduce((sum, x, i) => sum + x * v[i]!, 0));
}
function inverse(m: Matrix): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as number[][];
  const det = a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) throw new Error("ICC RGB 행렬이 가역이 아니어서 변환할 수 없습니다.");
  return [[e! * i! - f! * h!, c! * h! - b! * i!, b! * f! - c! * e!],
    [f! * g! - d! * i!, a! * i! - c! * g!, c! * d! - a! * f!],
    [d! * h! - e! * g!, b! * g! - a! * h!, a! * e! - b! * d!]].map(row => row.map(x => x / det));
}

/** Inverse operations admit only continuous, monotone normalized TRCs. LUT/CMYK never approximate. */
function inverseCurveTable(curve: StudioIccCurve): Float64Array {
  if (curve.kind === "gamma" && !(curve.gamma! > 0)) throw new Error("ICC 감마가 올바르지 않습니다.");
  if (curve.kind === "parametric") {
    const p = curve.params!; const kind = curve.functionType!;
    if (!(p[0]! > 0) || (kind > 0 && !(p[1]! > 0)) || (kind >= 3 && !(p[3]! >= 0))) {
      throw new Error("역변환 가능한 ICC 톤 곡선이 아닙니다.");
    }
    const split = kind < 3 ? -p[2]! / p[1]! : p[4]!;
    if (kind > 0 && split > 0 && split < 1) {
      const lo = evaluateIccCurve(curve, Math.max(0, split - 1e-9));
      const hi = evaluateIccCurve(curve, split);
      if (!Number.isFinite(lo + hi) || Math.abs(lo - hi) > 0.0001) throw new Error("불연속 ICC 톤 곡선은 지원하지 않습니다.");
    }
  }
  const samples = curve.kind === "table" ? curve.table! : Array.from({ length: 1025 }, (_, i) => evaluateIccCurve(curve, i / 1024));
  if (samples.length < 2 || Math.abs(samples[0]!) > 0.0001 || Math.abs(samples.at(-1)! - 1) > 0.0001
    || samples.some((v, i) => !Number.isFinite(v) || v < -0.0001 || v > 1.0001 || (i > 0 && v < samples[i - 1]!))) {
    throw new Error("0–1 범위의 단조 ICC 톤 곡선만 지원합니다.");
  }
  const table = new Float64Array(4097);
  for (let index = 0; index <= 4096; index++) {
    let lo = 0; let hi = 1;
    for (let step = 0; step < 30; step++) {
      const mid = (lo + hi) / 2;
      if (evaluateIccCurve(curve, mid) < index / 4096) lo = mid; else hi = mid;
    }
    table[index] = (lo + hi) / 2;
  }
  return table;
}
function sampleInverse(table: Float64Array, value: number): number {
  const p = clamp(value) * 4096; const i = Math.min(4095, Math.floor(p));
  return table[i]! + (table[i + 1]! - table[i]!) * (p - i);
}
export interface StudioRgbIccTransform {
  readonly profile: StudioIccProfile;
  readonly bytes: Uint8Array;
  convertRgb(rgb: readonly number[]): { target: number[]; proof: number[]; outOfGamut: boolean };
}
function createTransform(profile: StudioIccProfile, bytes: Uint8Array): StudioRgbIccTransform {
  if (profile.kind !== "matrix-trc-rgb" || !profile.matrixTrc || profile.header.pcs !== "XYZ ") {
    throw new Error("이 프로필은 RGB matrix/TRC 변환 대상이 아닙니다. CMYK·LUT 교정은 아직 지원하지 않습니다.");
  }
  const trc = profile.matrixTrc;
  const toTarget = multiply(inverse(trc.matrix), SRGB_D50);
  const toSrgb = multiply(inverse(SRGB_D50), trc.matrix);
  const curves = [trc.redTrc, trc.greenTrc, trc.blueTrc];
  const inverseTables = curves.map(inverseCurveTable);
  return { profile, bytes: Uint8Array.from(bytes), convertRgb(rgb) {
    const targetLinear = vector(toTarget, rgb.map(n => SOURCE_LUT[n]!));
    const outOfGamut = targetLinear.some(n => n < -0.0001 || n > 1.0001);
    const target = targetLinear.map((n, i) => Math.round(sampleInverse(inverseTables[i]!, n) * 255));
    // Simulate the actual RGB8 export quantization and selected profile on an sRGB display.
    const reconstructed = vector(toSrgb, target.map((n, i) => evaluateIccCurve(curves[i]!, n / 255)));
    return { target, outOfGamut, proof: reconstructed.map(n => Math.round(clamp(encodeSrgb(clamp(n))) * 255)) };
  } };
}
function profileManifest(bytes: Uint8Array, profile: StudioIccProfile, sha256: string | null): StudioIccProviderManifest {
  const tags = new Set(profile.tags.map(t => t.signature));
  const rawId = [...bytes.subarray(84, 100)].map(n => n.toString(16).padStart(2, "0")).join("");
  return { schemaVersion: 1, profileKey: "user-proof-profile", source: { kind: "user", providerId: "user-upload", provenance: "Local ICC file selected by the artist" },
    rights: { licenseClass: "user-authorized", licenseId: "artist-authorized-transform-and-embedding", redistribution: "forbidden", embedding: "allowed", commercialUse: "allowed" },
    expected: { sha256, versionMajor: bytes[8] as 2 | 4, profileId: /^0+$/u.test(rawId) ? null : rawId,
      deviceClass: profile.header.deviceClass as StudioIccProviderManifest["expected"]["deviceClass"],
      dataColorSpace: profile.header.dataColorSpace as StudioIccProviderManifest["expected"]["dataColorSpace"],
      pcs: profile.header.pcs as StudioIccProviderManifest["expected"]["pcs"],
      capabilities: { matrixTrcRgb: profile.kind === "matrix-trc-rgb", trc: ["rTRC", "gTRC", "bTRC"].every(t => tags.has(t)) || tags.has("kTRC"), lut: profile.kind === "lut-based", cmyk: profile.header.dataColorSpace === "CMYK" } } };
}
async function audit(bytes: Uint8Array, expectedHash: string | null) {
  const parsed = parseIccProfile(bytes); if (!parsed.ok) throw new Error(parsed.error);
  const manifest = profileManifest(bytes, parsed.profile, expectedHash);
  const result = await auditStudioIccProfilePolicy({ bytes, manifest, requestedUse: "transform" });
  if (!result.ok) throw new Error(result.error);
  const embedded = await auditStudioIccProfilePolicy({ bytes, manifest, requestedUse: "embed" });
  if (!embedded.ok) throw new Error(embedded.error);
  return { transform: createTransform(result.profile, bytes), sha256: result.receipt.checksum.actual! };
}
export async function importStudioColorProofProfile(bytes: Uint8Array, name: string, embeddingAuthorized: boolean) {
  if (!embeddingAuthorized) throw new Error("사용 권한이 있는 ICC 프로필을 선택해 주세요.");
  if (bytes.byteLength > STUDIO_COLOR_PROOF_MAX_PROFILE_BYTES) throw new Error("현재 페이지 ICC 설정은 4KiB 이하 RGB 프로필을 지원합니다.");
  const stable = Uint8Array.from(bytes); const admitted = await audit(stable, null);
  const document: StudioColorProofDocument = { version: 1, sourceSpace: "srgb", intent: "media-relative", profile: {
    name: name.slice(0, 128) || "profile.icc", base64: btoa(String.fromCharCode(...stable)), sha256: admitted.sha256, embeddingAuthorized: true,
  } };
  return { document, transform: admitted.transform };
}
export async function loadStudioColorProofProfile(value: unknown): Promise<StudioRgbIccTransform> {
  const doc = parseStudioColorProofDocument(value); if (!doc) throw new Error("저장된 ICC 설정이 올바르지 않습니다.");
  const bytes = Uint8Array.from(atob(doc.profile.base64), c => c.charCodeAt(0));
  if (bytes.byteLength > STUDIO_COLOR_PROOF_MAX_PROFILE_BYTES || btoa(String.fromCharCode(...bytes)) !== doc.profile.base64) throw new Error("ICC 원본 바이트 인코딩이 올바르지 않습니다.");
  return (await audit(bytes, doc.profile.sha256)).transform;
}
export async function transformStudioColorProofPixels(input: Uint8ClampedArray, transform: StudioRgbIccTransform, signal?: AbortSignal) {
  if (input.length === 0 || input.length % 4 !== 0 || input.length > 4 * 16_777_216) throw new Error("ICC 미리보기는 최대 16메가픽셀 RGBA8을 지원합니다.");
  const target = new Uint8ClampedArray(input.length); const proof = new Uint8ClampedArray(input.length); const gamut = new Uint8ClampedArray(input.length);
  let outOfGamutPixels = 0; let visiblePixels = 0;
  for (let i = 0; i < input.length; i += 4) {
    if (i % 65536 === 0) { signal?.throwIfAborted(); await new Promise<void>(resolve => setTimeout(resolve, 0)); signal?.throwIfAborted(); }
    const alpha = input[i + 3]!; target[i + 3] = proof[i + 3] = gamut[i + 3] = alpha;
    if (alpha === 0) continue;
    const result = transform.convertRgb([input[i]!, input[i + 1]!, input[i + 2]!]); visiblePixels++;
    if (result.outOfGamut) outOfGamutPixels++;
    target.set(result.target, i); proof.set(result.proof, i); gamut.set(result.outOfGamut ? [255, 0, 255] : result.proof, i);
  }
  return { target, proof, gamut, outOfGamutPixels, visiblePixels };
}

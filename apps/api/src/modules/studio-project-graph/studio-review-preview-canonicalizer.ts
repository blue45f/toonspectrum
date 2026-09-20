import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";

/** The existing work-asset admission ceilings, with no silent resize or quality conversion. */
export const STUDIO_REVIEW_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export const STUDIO_REVIEW_PREVIEW_MAX_PIXELS = 16_777_216;
export const STUDIO_REVIEW_PREVIEW_DECODE_TIMEOUT_MS = 15_000;
export const STUDIO_REVIEW_PREVIEW_VALIDATOR = "server-srgb-png-reconstruction-v1";

export interface CanonicalStudioReviewPreview {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly inputSha256: string;
  readonly width: number;
  readonly height: number;
  readonly validator: typeof STUDIO_REVIEW_PREVIEW_VALIDATOR;
}

export class StudioReviewPreviewValidationError extends Error {
  constructor(readonly code: string) { super(code); this.name = "StudioReviewPreviewValidationError"; }
}

// Runs in a terminated, memory-bounded worker. A Promise timeout around a synchronous decoder
// would leave malicious or corrupt image decoding running on the API event loop.
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { inflateSync } = require('node:zlib');
function fail(code) { throw new Error(code); }
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const out = Buffer.alloc(bytes.length + 12);
  out.writeUInt32BE(bytes.length, 0); out.write(type, 4, 4, 'ascii'); bytes.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
(async () => {
  const input = Buffer.from(workerData.bytes);
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  if (input.length < 45 || !input.subarray(0,8).equals(signature)) fail('preview-png-required');
  let offset = 8, width = 0, height = 0, channels = 0, ended = false, seenData = false;
  const critical = [signature], compressed = [];
  while (offset < input.length) {
    if (offset + 12 > input.length) fail('preview-png-invalid');
    const length = input.readUInt32BE(offset), end = offset + length + 12;
    if (end > input.length) fail('preview-png-invalid');
    const type = input.toString('ascii', offset+4, offset+8);
    const data = input.subarray(offset+8, end-4);
    if (!/^[A-Za-z]{4}$/.test(type) || crc(input.subarray(offset+4,end-4)) !== input.readUInt32BE(end-4)) fail('preview-png-invalid');
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) fail('preview-png-invalid');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (!width || !height || width > 16384 || height > 16384 || width * height > workerData.maxPixels) fail('preview-pixel-budget-exceeded');
      if (data[8] !== 8 || !channels || data[10] || data[11] || data[12]) fail('preview-pixel-format-unsupported');
      critical.push(input.subarray(offset,end));
    } else if (!width) fail('preview-png-invalid');
    else if (type === 'IDAT') { seenData = true; compressed.push(data); critical.push(input.subarray(offset,end)); }
    else if (type === 'IEND') {
      if (length || !seenData || end !== input.length) fail('preview-png-invalid');
      critical.push(input.subarray(offset,end)); ended = true;
    } else if (type === 'sRGB') {
      if (length !== 1 || data[0] > 3) fail('preview-color-profile-unsupported');
    } else if (type === 'gAMA') {
      if (length !== 4 || data.readUInt32BE(0) !== 45455) fail('preview-color-profile-unsupported');
    } else if (type === 'cHRM') {
      const srgb = [31270,32900,64000,33000,30000,60000,15000,6000];
      if (length !== 32 || srgb.some((v,i) => data.readUInt32BE(i*4) !== v)) fail('preview-color-profile-unsupported');
    } else if (['iCCP','cICP','mDCV','cLLI','tRNS'].includes(type)) fail('preview-color-profile-unsupported');
    else if (['acTL','fcTL','fdAT'].includes(type)) fail('preview-animation-unsupported');
    else if (type[0] === type[0].toUpperCase()) fail('preview-png-invalid');
    // Untrusted ancillary metadata never reaches the decoder or the stored derivative.
    offset = end;
  }
  if (!ended) fail('preview-png-invalid');
  const expected = (width * channels + 1) * height;
  const inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  if (inflated.length !== expected) fail('preview-png-invalid');
  inflated.fill(0);
  const { Image, decodePng, encodePng } = await import(workerData.imageJsUrl);
  const decoded = decodePng(Buffer.concat(critical));
  if (decoded.width !== width || decoded.height !== height || decoded.bitDepth !== 8 || decoded.channels !== channels || decoded.colorModel !== (channels === 4 ? 'RGBA' : 'RGB')) fail('preview-decoded-identity-mismatch');
  const raw = decoded.getRawImage();
  // Fresh pixel-owned image: no profiles, EXIF, comments, hidden attachments or source buffers.
  const pixels = new Uint8Array(raw.data);
  const encoded = Buffer.from(encodePng(new Image(width, height, { data:pixels, bitDepth:8, colorModel:decoded.colorModel })));
  pixels.fill(0); raw.data.fill(0); input.fill(0);
  // Server-authored page identity preserves repeated identical pages despite the existing
  // revision_blob primary key (revision, hash, role). It contains only a hash and integer.
  const identity = chunk('tEXt', Buffer.from('StudioReviewPage\0' + workerData.pageIdentity, 'ascii'));
  const output = Buffer.concat([encoded.subarray(0,33), chunk('sRGB',Buffer.from([0])), identity, encoded.subarray(33)]);
  if (output.length > workerData.maxBytes) fail('preview-byte-budget-exceeded');
  parentPort.postMessage({ bytes:output, width, height });
})().catch(error => parentPort.postMessage({ error: /^preview-[a-z-]+$/.test(error.message) ? error.message : 'preview-png-invalid' }));
`;

let activeWorkers = 0;

/** This proves a newly constructed raster, not an antivirus result for the supplied original. */
export async function canonicalizeStudioReviewPreview(
  input: Uint8Array,
  pageIdentity: string,
  options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<CanonicalStudioReviewPreview> {
  if (!/^[a-f0-9]{64}:[0-9]{1,6}$/u.test(pageIdentity)) throw new StudioReviewPreviewValidationError("preview-page-identity-invalid");
  if (input.byteLength === 0 || input.byteLength > STUDIO_REVIEW_PREVIEW_MAX_BYTES) throw new StudioReviewPreviewValidationError("preview-byte-budget-exceeded");
  if (options.signal?.aborted) throw new StudioReviewPreviewValidationError("preview-cancelled");
  if (activeWorkers >= 2) throw new StudioReviewPreviewValidationError("preview-validator-busy");
  activeWorkers += 1;
  const owned = Buffer.from(input);
  const inputSha256 = createHash("sha256").update(owned).digest("hex");
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { bytes: owned, pageIdentity, imageJsUrl: require.resolve("image-js"),
          maxBytes: STUDIO_REVIEW_PREVIEW_MAX_BYTES, maxPixels: STUDIO_REVIEW_PREVIEW_MAX_PIXELS },
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
      });
      let settled = false;
      const finish = (error?: string, result?: { bytes: Uint8Array; width: number; height: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        // Do not release a capacity slot until the terminated worker has actually exited.
        void worker.terminate().then(() => {
          if (error || !result) reject(new StudioReviewPreviewValidationError(error ?? "preview-png-invalid"));
          else {
            const bytes = Buffer.from(result.bytes);
            resolve({ bytes, inputSha256, sha256: createHash("sha256").update(bytes).digest("hex"),
              width: result.width, height: result.height, validator: STUDIO_REVIEW_PREVIEW_VALIDATOR });
          }
        }, () => reject(new StudioReviewPreviewValidationError("preview-decoder-unavailable")));
      };
      const abort = () => finish("preview-cancelled");
      const timer = setTimeout(() => finish("preview-decode-timeout"),
        Math.min(STUDIO_REVIEW_PREVIEW_DECODE_TIMEOUT_MS, Math.max(1, options.timeoutMs ?? STUDIO_REVIEW_PREVIEW_DECODE_TIMEOUT_MS)));
      options.signal?.addEventListener("abort", abort, { once: true });
      worker.once("message", (result) => finish(result.error, result));
      worker.once("error", () => finish("preview-decoder-unavailable"));
      worker.once("exit", () => { if (!settled) finish("preview-decoder-unavailable"); });
      if (options.signal?.aborted) abort();
    });
  } finally { owned.fill(0); activeWorkers -= 1; }
}

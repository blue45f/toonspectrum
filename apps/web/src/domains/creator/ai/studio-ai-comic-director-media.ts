import {
  dataUrlToBlob,
  isStudioAiConfigured,
  type StudioAiResult,
  type StudioAiSettings,
} from "./studio-ai-client";

import type {
  ScenarioImageLayerManifest,
  ScenarioImageQualityFinding,
  ScenarioImageQualityReport,
  ScenarioImageRepairRecord,
} from "../studio-scenario-layout";

export type StudioAiComicRepairTarget = ScenarioImageRepairRecord["target"];

export interface StudioAiComicRepairCapabilities {
  readonly available: boolean;
  readonly maskEdit: boolean;
  readonly outpaint: boolean;
  readonly reason: string | null;
}

export interface StudioAiComicRepairResult {
  readonly imageDataUrl: string;
  readonly repair: ScenarioImageRepairRecord;
}

function buildUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/u, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function providerLabel(settings: StudioAiSettings): string {
  try {
    return new URL(settings.baseUrl).hostname.slice(0, 120) || "custom";
  } catch {
    return settings.baseUrl.slice(0, 120) || "custom";
  }
}

function imageFromResponse(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const data = (value as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const entry = first as Record<string, unknown>;
  if (typeof entry.b64_json === "string" && entry.b64_json.length > 0) {
    return `data:image/png;base64,${entry.b64_json}`;
  }
  return typeof entry.url === "string" && entry.url.length > 0 ? entry.url : null;
}

function responseError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as Record<string, unknown>).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return null;
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function inspectStudioAiComicRepairCapabilities(
  settings: StudioAiSettings | null | undefined,
): StudioAiComicRepairCapabilities {
  if (!settings || !isStudioAiConfigured(settings)) {
    return {
      available: false,
      maskEdit: false,
      outpaint: false,
      reason: "이미지 편집 API가 연결되지 않았습니다.",
    };
  }
  if (!settings.imageEditPath.trim()) {
    return {
      available: false,
      maskEdit: false,
      outpaint: false,
      reason: "현재 연결에 이미지 편집 경로가 없습니다.",
    };
  }
  return {
    available: true,
    maskEdit: true,
    outpaint: true,
    reason: null,
  };
}

/**
 * Performs one explicit OpenAI-compatible Images Edits request. It never retries or silently falls
 * back to whole-panel generation because either behaviour could double-charge the creator or
 * discard approved pixels.
 */
export async function repairStudioAiComicImageRegion(input: {
  readonly settings: StudioAiSettings;
  readonly sourceImageDataUrl: string;
  readonly maskDataUrl: string;
  readonly prompt: string;
  readonly target: StudioAiComicRepairTarget;
  readonly parentCandidateId: string;
  readonly signal?: AbortSignal;
}): Promise<StudioAiResult<StudioAiComicRepairResult>> {
  const capabilities = inspectStudioAiComicRepairCapabilities(input.settings);
  if (!capabilities.maskEdit) {
    return {
      ok: false,
      code: "not_configured",
      error: capabilities.reason ?? "마스크 영역 수리를 사용할 수 없습니다.",
    };
  }
  const prompt = input.prompt.normalize("NFKC").trim();
  if (!prompt) {
    return { ok: false, code: "invalid_input", error: "수리 지시를 입력해 주세요." };
  }
  let source: Blob;
  let mask: Blob;
  try {
    source = dataUrlToBlob(input.sourceImageDataUrl);
    mask = dataUrlToBlob(input.maskDataUrl);
  } catch (error) {
    return {
      ok: false,
      code: "invalid_input",
      error: error instanceof Error ? error.message : "수리 이미지 또는 마스크가 올바르지 않습니다.",
    };
  }
  if (!source.type.startsWith("image/") || !mask.type.startsWith("image/")) {
    return {
      ok: false,
      code: "invalid_input",
      error: "수리 원본과 마스크는 이미지여야 합니다.",
    };
  }

  const form = new FormData();
  form.append("model", input.settings.imageModel);
  form.append("image", source, "comic-director-source.png");
  form.append("mask", mask, "comic-director-mask.png");
  form.append("prompt", prompt);
  form.append("response_format", "b64_json");

  let response: Response;
  try {
    response = await fetch(
      buildUrl(input.settings.baseUrl, input.settings.imageEditPath),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${input.settings.apiKey}` },
        body: form,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
  } catch (error) {
    return {
      ok: false,
      code: "network_error",
      error:
        input.signal?.aborted
          ? "수리 요청이 취소되었습니다."
          : error instanceof Error
            ? error.message
            : "수리 요청에 실패했습니다.",
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return { ok: false, code: "parse_error", error: "수리 결과를 해석하지 못했습니다." };
  }
  if (!response.ok) {
    return {
      ok: false,
      code: "http_error",
      error: `수리 요청이 실패했습니다 (HTTP ${response.status}): ${responseError(body) ?? response.statusText}`,
    };
  }
  const imageDataUrl = imageFromResponse(body);
  if (!imageDataUrl) {
    return { ok: false, code: "parse_error", error: "수리 결과 이미지가 없습니다." };
  }
  return {
    ok: true,
    data: {
      imageDataUrl,
      repair: {
        version: 1,
        target: input.target,
        parentCandidateId: input.parentCandidateId,
        maskFingerprint: fingerprint(input.maskDataUrl),
        prompt,
        provider: providerLabel(input.settings),
        model: input.settings.imageModel,
        createdAt: new Date().toISOString(),
      },
    },
  };
}

interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly source: CanvasImageSource;
  readonly dispose: () => void;
}

async function decodeImage(dataUrl: string): Promise<DecodedImage> {
  const blob = dataUrlToBlob(dataUrl);
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      dispose: () => bitmap.close(),
    };
  }
  if (typeof document === "undefined") throw new Error("이미지 분석은 브라우저에서만 사용할 수 있어요.");
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    source: image,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

function canvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") throw new Error("이 작업은 브라우저에서만 사용할 수 있어요.");
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

function context2d(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = element.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D 이미지 처리 컨텍스트를 만들지 못했습니다.");
  return context;
}

/** Measures only observable pixels. Semantic identity, anatomy and story correctness stay unknown. */
export async function analyzeStudioAiComicCandidate(
  imageDataUrl: string,
): Promise<ScenarioImageQualityReport> {
  const decoded = await decodeImage(imageDataUrl);
  try {
    const scale = Math.min(1, 256 / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const surface = canvas(width, height);
    const context = context2d(surface);
    context.drawImage(decoded.source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let opaque = 0;
    let edgeOpaque = 0;
    let luminanceSum = 0;
    let luminanceSquared = 0;
    let nearBlack = 0;
    let nearWhite = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = pixels[offset + 3]! / 255;
        if (alpha > 0.05) opaque += 1;
        if (alpha > 0.5 && (x === 0 || y === 0 || x === width - 1 || y === height - 1)) {
          edgeOpaque += 1;
        }
        const luminance = (
          0.2126 * pixels[offset]!
          + 0.7152 * pixels[offset + 1]!
          + 0.0722 * pixels[offset + 2]!
        ) / 255;
        luminanceSum += luminance;
        luminanceSquared += luminance * luminance;
        if (luminance < 0.025) nearBlack += 1;
        if (luminance > 0.975) nearWhite += 1;
      }
    }
    const sampleCount = width * height;
    const meanLuminance = luminanceSum / sampleCount;
    const variance = Math.max(0, luminanceSquared / sampleCount - meanLuminance ** 2);
    const contrast = Math.sqrt(variance);
    const edgePixels = Math.max(1, width * 2 + height * 2 - 4);
    const opaqueCoverage = opaque / sampleCount;
    const edgeOccupancy = edgeOpaque / edgePixels;
    const findings: ScenarioImageQualityFinding[] = [];
    if (decoded.width < 768 || decoded.height < 768) {
      findings.push({
        id: "resolution",
        severity: "review",
        category: "resolution",
        message: `원본이 ${decoded.width}×${decoded.height}px입니다. 최종 원고 확대 전에 확인하세요.`,
      });
    }
    if (opaqueCoverage < 0.9) {
      findings.push({
        id: "alpha",
        severity: "info",
        category: "alpha",
        message: "투명 픽셀이 포함되어 있습니다. 합성 순서와 배경을 확인하세요.",
      });
    }
    if (edgeOccupancy > 0.82) {
      findings.push({
        id: "edge-clipping",
        severity: "review",
        category: "edge-clipping",
        message: "불투명 피사체가 이미지 가장자리에 많이 닿아 있어 잘림을 확인해야 합니다.",
      });
    }
    if (contrast < 0.09) {
      findings.push({
        id: "contrast",
        severity: "review",
        category: "contrast",
        message: "명암 대비가 낮아 작은 화면에서 인물과 배경이 합쳐 보일 수 있습니다.",
      });
    }
    if (nearBlack / sampleCount > 0.35 || nearWhite / sampleCount > 0.35) {
      findings.push({
        id: "exposure",
        severity: "review",
        category: "exposure",
        message: "매우 어둡거나 밝은 픽셀 비중이 높습니다. 디테일 손실을 확인하세요.",
      });
    }
    findings.push({
      id: "semantic-unknown",
      severity: "info",
      category: "semantic-unknown",
      message: "캐릭터 정체성·손·해부·이야기 정확성은 자동 픽셀 검사로 확정하지 않습니다.",
    });
    return {
      version: 1,
      width: decoded.width,
      height: decoded.height,
      pixelCount: decoded.width * decoded.height,
      opaqueCoverage,
      edgeOccupancy,
      meanLuminance,
      contrast,
      confidence: "measured",
      findings,
      analyzedAt: new Date().toISOString(),
    };
  } finally {
    decoded.dispose();
  }
}

function writeLayerPixels(
  source: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  foreground: Uint8ClampedArray,
  background: Uint8ClampedArray,
): void {
  for (let offset = 0; offset < source.length; offset += 4) {
    const maskLuminance = (
      mask[offset]! + mask[offset + 1]! + mask[offset + 2]!
    ) / (3 * 255);
    const maskAlpha = mask[offset + 3]! / 255;
    const coverage = Math.max(0, Math.min(1, maskLuminance * maskAlpha));
    foreground[offset] = source[offset]!;
    foreground[offset + 1] = source[offset + 1]!;
    foreground[offset + 2] = source[offset + 2]!;
    foreground[offset + 3] = Math.round(source[offset + 3]! * coverage);
    background[offset] = source[offset]!;
    background[offset + 1] = source[offset + 1]!;
    background[offset + 2] = source[offset + 2]!;
    background[offset + 3] = Math.round(source[offset + 3]! * (1 - coverage));
  }
}

/** Creates real foreground/background PNG layers from an explicit user-reviewed mask. */
export async function decomposeStudioAiComicCandidate(input: {
  readonly sourceImageDataUrl: string;
  readonly maskDataUrl: string;
  readonly sourceCandidateId: string;
}): Promise<ScenarioImageLayerManifest> {
  const [source, mask] = await Promise.all([
    decodeImage(input.sourceImageDataUrl),
    decodeImage(input.maskDataUrl),
  ]);
  try {
    if (source.width !== mask.width || source.height !== mask.height) {
      throw new Error("레이어 분리 마스크 크기가 원본 이미지와 다릅니다.");
    }
    const sourceCanvas = canvas(source.width, source.height);
    const sourceContext = context2d(sourceCanvas);
    sourceContext.drawImage(source.source, 0, 0);
    const maskCanvas = canvas(mask.width, mask.height);
    const maskContext = context2d(maskCanvas);
    maskContext.drawImage(mask.source, 0, 0);
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
    const maskPixels = maskContext.getImageData(0, 0, mask.width, mask.height);
    const foregroundPixels = sourceContext.createImageData(source.width, source.height);
    const backgroundPixels = sourceContext.createImageData(source.width, source.height);
    writeLayerPixels(
      sourcePixels.data,
      maskPixels.data,
      foregroundPixels.data,
      backgroundPixels.data,
    );
    const foregroundCanvas = canvas(source.width, source.height);
    context2d(foregroundCanvas).putImageData(foregroundPixels, 0, 0);
    const backgroundCanvas = canvas(source.width, source.height);
    context2d(backgroundCanvas).putImageData(backgroundPixels, 0, 0);
    const createdAt = new Date().toISOString();
    return {
      version: 1,
      method: "manual-mask",
      editable: true,
      sourceCandidateId: input.sourceCandidateId,
      layers: [
        {
          id: `${input.sourceCandidateId}:background`,
          name: "AI 컷 배경",
          role: "background",
          imageDataUrl: backgroundCanvas.toDataURL("image/png"),
          sourceCandidateId: input.sourceCandidateId,
        },
        {
          id: `${input.sourceCandidateId}:foreground`,
          name: "AI 컷 전경",
          role: "foreground",
          imageDataUrl: foregroundCanvas.toDataURL("image/png"),
          sourceCandidateId: input.sourceCandidateId,
        },
      ],
      createdAt,
    };
  } finally {
    source.dispose();
    mask.dispose();
  }
}

export function singleLayerStudioAiComicManifest(
  sourceCandidateId: string,
  imageDataUrl: string,
  limitation = "분리 가능한 공급자 레이어나 검토된 마스크가 없어 단일 장면 레이어로 유지합니다.",
): ScenarioImageLayerManifest {
  return {
    version: 1,
    method: "single-layer",
    editable: false,
    sourceCandidateId,
    layers: [
      {
        id: `${sourceCandidateId}:scene`,
        name: "AI 장면 이미지",
        role: "provider-layer",
        imageDataUrl,
        sourceCandidateId,
      },
    ],
    createdAt: new Date().toISOString(),
    limitation,
  };
}

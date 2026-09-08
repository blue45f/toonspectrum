import {
  createStudioAnimaticFromPages,
  validateStudioAnimaticDocument,
  type StudioAnimaticDocument,
  type StudioAnimaticPageLike,
} from "../studio-animatic-timeline";

import type { StudioOpfsAssetRef } from "../studio-opfs-asset-store";

export const ANIMATIC_WORKSPACE_KIND = "toonspectrum.storyboard-workspace";
export const ANIMATIC_WORKSPACE_LIMITS = Object.freeze({
  audioTracks: 8,
  audioFileBytes: 32 * 1024 * 1024,
  assetBytes: 256 * 1024 * 1024,
  assetCount: 1099,
  archiveBytes: 264 * 1024 * 1024 + 512 * 1024,
  metadataBytes: 8 * 1024 * 1024,
  variants: 12,
  reviews: 200,
  markers: 200,
  waveformBins: 256,
});

export interface StudioAnimaticArtwork {
  readonly pageId: string;
  readonly asset: StudioOpfsAssetRef;
  readonly width: number;
  readonly height: number;
  readonly documentWidth: number;
  readonly documentHeight: number;
}

export interface StudioAnimaticAudioTrack {
  readonly id: string;
  readonly name: string;
  readonly asset: StudioOpfsAssetRef;
  readonly durationMs: number;
  readonly startMs: number;
  readonly trimStartMs: number;
  readonly trimEndMs: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly waveform: readonly number[];
}

export interface StudioAnimaticMarker {
  readonly id: string;
  readonly timeMs: number;
  readonly label: string;
}

export interface StudioAnimaticShotNote {
  readonly segmentId: string;
  readonly sequence: string;
  readonly camera: string;
  readonly notes: string;
}

export interface StudioAnimaticWorkspaceSnapshot {
  readonly timeline: StudioAnimaticDocument;
  readonly artwork: readonly StudioAnimaticArtwork[];
  readonly audio: readonly StudioAnimaticAudioTrack[];
  readonly markers: readonly StudioAnimaticMarker[];
  readonly shots: readonly StudioAnimaticShotNote[];
}

export interface StudioAnimaticVariant {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly snapshot: StudioAnimaticWorkspaceSnapshot;
}

export interface StudioAnimaticReview {
  readonly id: string;
  readonly variantId: string | null;
  readonly timeMs: number;
  readonly text: string;
  readonly resolved: boolean;
}

export interface StudioAnimaticWorkspaceDocument extends StudioAnimaticWorkspaceSnapshot {
  readonly kind: typeof ANIMATIC_WORKSPACE_KIND;
  readonly version: 1;
  readonly workScope: string;
  readonly variants: readonly StudioAnimaticVariant[];
  readonly reviews: readonly StudioAnimaticReview[];
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length <= max;
const id = (value: unknown): value is string => text(value) && value.trim().length > 0;
const number = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const uniqueIds = (values: readonly { readonly id: string }[]): boolean => new Set(values.map((value) => value.id)).size === values.length;

function validAsset(value: unknown): value is StudioOpfsAssetRef {
  return record(value) && typeof value.hash === "string" && /^sha256:[a-f0-9]{64}$/u.test(value.hash)
    && number(value.bytes, 1, 256_000_000) && Number.isInteger(value.bytes)
    && text(value.mime, 100) && /^(image\/png|audio\/[a-z0-9.+-]+|application\/octet-stream)$/u.test(value.mime);
}

function validateSnapshot(value: unknown, workScope: string): StudioAnimaticWorkspaceSnapshot {
  if (!record(value)) throw new Error("스토리보드 스냅샷이 올바르지 않습니다.");
  const timing = validateStudioAnimaticDocument(value.timeline);
  if (!timing.ok || timing.document.workScope !== workScope) throw new Error("다른 작품 또는 유효하지 않은 타임라인입니다.");
  const artwork = value.artwork;
  const audio = value.audio;
  const markers = value.markers;
  const shots = value.shots;
  if (!Array.isArray(artwork) || artwork.length > 180 || !artwork.every((item: unknown) => record(item)
    && id(item.pageId) && validAsset(item.asset) && item.asset.mime === "image/png"
    && number(item.width, 1, 16384) && Number.isInteger(item.width)
    && number(item.height, 1, 100000) && Number.isInteger(item.height)
    && number(item.documentWidth, 1, 100000) && number(item.documentHeight, 1, 100000))) {
    throw new Error("캡처한 페이지 이미지가 올바르지 않습니다.");
  }
  if (new Set(artwork.map((item) => item.pageId)).size !== artwork.length) throw new Error("페이지 이미지가 중복되었습니다.");
  if (!Array.isArray(audio) || audio.length > ANIMATIC_WORKSPACE_LIMITS.audioTracks || !audio.every((item: unknown) => record(item)
    && id(item.id) && text(item.name, 200) && validAsset(item.asset)
    && (item.asset.mime.startsWith("audio/") || item.asset.mime === "application/octet-stream")
    && item.asset.bytes <= ANIMATIC_WORKSPACE_LIMITS.audioFileBytes
    && number(item.durationMs, 1, 600000) && number(item.startMs, 0, 600000)
    && number(item.trimStartMs, 0, item.durationMs) && number(item.trimEndMs, 0, item.durationMs)
    && item.trimEndMs > item.trimStartMs && number(item.volume, 0, 1) && typeof item.muted === "boolean"
    && Array.isArray(item.waveform) && item.waveform.length <= ANIMATIC_WORKSPACE_LIMITS.waveformBins
    && item.waveform.every((peak: unknown) => number(peak, 0, 1)))) {
    throw new Error("오디오 길이·트림·볼륨 또는 파형이 올바르지 않습니다.");
  }
  if (!uniqueIds(audio)) throw new Error("오디오 ID가 중복되었습니다.");
  if (!Array.isArray(markers) || markers.length > ANIMATIC_WORKSPACE_LIMITS.markers || !markers.every((item: unknown) => record(item)
    && id(item.id) && text(item.label, 200) && number(item.timeMs, 0, 600000)) || !uniqueIds(markers)) {
    throw new Error("타임라인 마커가 올바르지 않습니다.");
  }
  if (!Array.isArray(shots) || shots.length > 180 || !shots.every((item: unknown) => record(item)
    && id(item.segmentId) && text(item.sequence, 120) && text(item.camera, 300) && text(item.notes, 2000))) {
    throw new Error("시퀀스·카메라 메모가 올바르지 않습니다.");
  }
  if (new Set(shots.map((item) => item.segmentId)).size !== shots.length) throw new Error("컷의 카메라 메모가 중복되었습니다.");
  return { timeline: timing.document, artwork: artwork as StudioAnimaticArtwork[], audio: audio as StudioAnimaticAudioTrack[], markers: markers as StudioAnimaticMarker[], shots: shots as StudioAnimaticShotNote[] };
}

export function validateStudioAnimaticWorkspace(value: unknown): StudioAnimaticWorkspaceDocument {
  if (!record(value) || value.kind !== ANIMATIC_WORKSPACE_KIND || value.version !== 1 || !id(value.workScope)) {
    throw new Error("지원하는 ToonSpectrum 스토리보드 작업 파일이 아닙니다.");
  }
  const snapshot = validateSnapshot(value, value.workScope);
  if (!Array.isArray(value.variants) || value.variants.length > ANIMATIC_WORKSPACE_LIMITS.variants) throw new Error("버전은 최대 12개까지 보관할 수 있습니다.");
  const variants = value.variants.map((variant: unknown): StudioAnimaticVariant => {
    if (!record(variant) || !id(variant.id) || !text(variant.name, 200) || !number(variant.createdAt, 0, Number.MAX_SAFE_INTEGER)) throw new Error("보관한 버전이 올바르지 않습니다.");
    return { id: variant.id, name: variant.name, createdAt: variant.createdAt, snapshot: validateSnapshot(variant.snapshot, value.workScope as string) };
  });
  if (!uniqueIds(variants)) throw new Error("버전 ID가 중복되었습니다.");
  if (!Array.isArray(value.reviews) || value.reviews.length > ANIMATIC_WORKSPACE_LIMITS.reviews || !value.reviews.every((review: unknown) => record(review)
    && id(review.id) && (review.variantId === null || (id(review.variantId) && variants.some((variant) => variant.id === review.variantId)))
    && number(review.timeMs, 0, 600000) && text(review.text, 2000) && typeof review.resolved === "boolean") || !uniqueIds(value.reviews)) {
    throw new Error("검토 의견이 올바르지 않습니다.");
  }
  const result: StudioAnimaticWorkspaceDocument = { ...snapshot, kind: ANIMATIC_WORKSPACE_KIND, version: 1, workScope: value.workScope, variants, reviews: value.reviews as StudioAnimaticReview[] };
  const assets = studioAnimaticWorkspaceAssetRefs(result);
  if (assets.length > ANIMATIC_WORKSPACE_LIMITS.assetCount) throw new Error("미디어 파일 수가 작업 ZIP의 한도를 넘었습니다. 사용하지 않는 버전을 정리하세요.");
  if (assets.reduce((sum, asset) => sum + asset.bytes, 0) > ANIMATIC_WORKSPACE_LIMITS.assetBytes) throw new Error("스토리보드 이미지·오디오의 총 크기는 256MB 이하여야 합니다.");
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > ANIMATIC_WORKSPACE_LIMITS.metadataBytes) throw new Error("스토리보드 메타데이터가 8MB 한도를 넘었습니다.");
  return result;
}

export function createStudioAnimaticWorkspace(pages: readonly StudioAnimaticPageLike[], workScope: string, timeline?: StudioAnimaticDocument): StudioAnimaticWorkspaceDocument {
  const created = timeline ? { ok: true as const, document: timeline } : createStudioAnimaticFromPages(pages, { workScope });
  if (!created.ok) throw new Error(created.error);
  return { kind: ANIMATIC_WORKSPACE_KIND, version: 1, workScope, timeline: created.document, artwork: [], audio: [], markers: [], shots: [], variants: [], reviews: [] };
}

export function studioAnimaticWorkspaceSnapshot(workspace: StudioAnimaticWorkspaceDocument): StudioAnimaticWorkspaceSnapshot {
  const { timeline, artwork, audio, markers, shots } = workspace;
  return { timeline, artwork, audio, markers, shots };
}

export function studioAnimaticWorkspaceAssetRefs(workspace: StudioAnimaticWorkspaceDocument): StudioOpfsAssetRef[] {
  const refs = new Map<string, StudioOpfsAssetRef>();
  for (const snapshot of [workspace, ...workspace.variants.map((variant) => variant.snapshot)]) {
    for (const item of [...snapshot.artwork, ...snapshot.audio]) {
      const existing = refs.get(item.asset.hash);
      if (existing && (existing.bytes !== item.asset.bytes || existing.mime !== item.asset.mime)) {
        throw new Error("같은 미디어 해시의 크기 또는 파일 형식이 서로 다릅니다.");
      }
      refs.set(item.asset.hash, item.asset);
    }
  }
  return [...refs.values()];
}

export function moveStudioAnimaticShot(workspace: StudioAnimaticWorkspaceDocument, segmentId: string, delta: -1 | 1): StudioAnimaticWorkspaceDocument {
  const segments = [...workspace.timeline.segments];
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= segments.length) return workspace;
  [segments[index], segments[nextIndex]] = [segments[nextIndex]!, segments[index]!];
  return { ...workspace, timeline: { ...workspace.timeline, segments } };
}

export function compareStudioAnimaticSnapshots(current: StudioAnimaticWorkspaceSnapshot, previous: StudioAnimaticWorkspaceSnapshot): { added: number; removed: number; changed: number; timingChanged: boolean; audioChanged: boolean } {
  const before = new Map(previous.timeline.segments.map((segment) => [segment.id, segment]));
  const after = new Map(current.timeline.segments.map((segment) => [segment.id, segment]));
  return {
    added: [...after.keys()].filter((key) => !before.has(key)).length,
    removed: [...before.keys()].filter((key) => !after.has(key)).length,
    changed: [...after].filter(([key, value]) => before.has(key) && JSON.stringify(before.get(key)) !== JSON.stringify(value)).length,
    timingChanged: current.timeline.fps !== previous.timeline.fps
      || current.timeline.segments.length !== previous.timeline.segments.length
      || current.timeline.segments.some((segment, index) => {
        const original = previous.timeline.segments[index];
        return original?.id !== segment.id || original.holdMs !== segment.holdMs
          || JSON.stringify(original.transition) !== JSON.stringify(segment.transition);
      }),
    audioChanged: JSON.stringify(current.audio) !== JSON.stringify(previous.audio),
  };
}

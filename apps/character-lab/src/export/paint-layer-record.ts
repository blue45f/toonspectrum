/**
 * 페인트 레이어 ↔ 레시피 `paint.layers[]` 레코드(PNG base64). Buffer 없이 btoa/atob(Node 22·브라우저 공통)를 쓴다.
 */
import { failVisible } from "../contracts";

import { decodePng, encodePng } from "./png-encoder";

import type { LabFailure, PaintLayer, PaintLayerRecord } from "../contracts";

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function encodePaintLayerRecord(layer: PaintLayer): Promise<PaintLayerRecord> {
  const png = await encodePng({ width: layer.width, height: layer.height, rgba: layer.rgba }, { filter: "adaptive" });
  return { part: layer.part, width: layer.width, height: layer.height, pngBase64: bytesToBase64(png) };
}

export type DecodePaintLayerResult = { readonly ok: true; readonly layer: PaintLayer } | { readonly ok: false; readonly failure: LabFailure };

export async function decodePaintLayerRecord(record: PaintLayerRecord, now?: number): Promise<DecodePaintLayerResult> {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(record.pngBase64);
  } catch (error) {
    return { ok: false, failure: failVisible("paint-layer-base64", `페인트 레이어(${record.part})의 base64가 올바르지 않습니다.`, error, now) };
  }
  let decoded: Awaited<ReturnType<typeof decodePng>>;
  try {
    decoded = await decodePng(bytes);
  } catch (error) {
    return { ok: false, failure: failVisible("paint-layer-png", `페인트 레이어(${record.part})의 PNG를 디코드할 수 없습니다.`, error, now) };
  }
  if (decoded.width !== record.width || decoded.height !== record.height) {
    return {
      ok: false,
      failure: failVisible(
        "paint-layer-size",
        `페인트 레이어(${record.part}) PNG 크기 ${decoded.width}×${decoded.height}가 레코드 ${record.width}×${record.height}와 다릅니다.`,
        undefined,
        now,
      ),
    };
  }
  return { ok: true, layer: { part: record.part, width: decoded.width, height: decoded.height, rgba: decoded.rgba, revision: 0 } };
}

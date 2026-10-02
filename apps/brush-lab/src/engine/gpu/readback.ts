import { alignedBytesPerRow, MAP_MODE, TABLE_OFFSETS } from "./layout";

import type { LabImage } from "../core/types";

/**
 * GPU → CPU readback. 핫 패스가 아니며(endStroke·리포트 시점) 모든 map은 await한다.
 * - present 텍스처(rgba8unorm): copyTextureToBuffer는 bytesPerRow 256 정렬이 필요하므로 복사 후 행 패딩을 벗긴다.
 * - 문서 버퍼(선형 premultiplied f32): copyBufferToBuffer 후 Float32Array 복사.
 * - TileTable 헤더: 카운터 readback(overflow·pool_cursor·wet_live_count).
 */

/** present 텍스처 복사를 encoder에 기록한다. */
export function encodePresentReadback(
  encoder: GPUCommandEncoder,
  presentTex: GPUTexture,
  staging: GPUBuffer,
  width: number,
  height: number,
): void {
  encoder.copyTextureToBuffer(
    { texture: presentTex },
    { buffer: staging, bytesPerRow: alignedBytesPerRow(width), rowsPerImage: height },
    { width, height },
  );
}

/** 스테이징(256 정렬 행)을 LabImage로 푼다. */
export async function mapToLabImage(staging: GPUBuffer, width: number, height: number): Promise<LabImage> {
  const bytesPerRow = alignedBytesPerRow(width);
  const total = bytesPerRow * height;
  await staging.mapAsync(MAP_MODE.READ, 0, total);
  const src = new Uint8Array(staging.getMappedRange(0, total));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    data.set(src.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
  }
  staging.unmap();
  return { width, height, data };
}

/** 문서 버퍼 복사를 기록한다. */
export function encodeDocumentReadback(encoder: GPUCommandEncoder, document: GPUBuffer, staging: GPUBuffer, bytes: number): void {
  encoder.copyBufferToBuffer(document, 0, staging, 0, bytes);
}

/** 스테이징을 Float32Array로 푼다(복사본). */
export async function mapToFloat32(staging: GPUBuffer, floats: number): Promise<Float32Array> {
  const bytes = floats * 4;
  await staging.mapAsync(MAP_MODE.READ, 0, bytes);
  const out = new Float32Array(staging.getMappedRange(0, bytes).slice(0));
  staging.unmap();
  return out;
}

/** 스테이징을 Uint32Array로 푼다(복사본). */
export async function mapToUint32(staging: GPUBuffer, count: number): Promise<Uint32Array> {
  const bytes = count * 4;
  await staging.mapAsync(MAP_MODE.READ, 0, bytes);
  const out = new Uint32Array(staging.getMappedRange(0, bytes).slice(0));
  staging.unmap();
  return out;
}

/** 버퍼 구간 복사를 기록한다(습식 슬롯 표·습식 풀 readback 공용). */
export function encodeBufferReadback(encoder: GPUCommandEncoder, source: GPUBuffer, sourceOffset: number, staging: GPUBuffer, bytes: number): void {
  encoder.copyBufferToBuffer(source, sourceOffset, staging, 0, bytes);
}

export interface TableHeaderReadback {
  dirtyCount: number;
  refsTotal: number;
  dabOverflow: number;
  refsOverflow: number;
  poolCursor: number;
  strokeDirtyCount: number;
  poolOverflow: number;
  wetCursor: number;
  wetActiveCount: number;
  wetOverflow: number;
  /** 정착 루프에서 활성 타일이 0이 된 뒤 1. */
  wetSettleDone: number;
  wetLiveCount: number;
}

/** 헤더 복사를 기록한다. */
export function encodeTableHeaderReadback(encoder: GPUCommandEncoder, table: GPUBuffer, tableStaging: GPUBuffer): void {
  encoder.copyBufferToBuffer(table, 0, tableStaging, 0, TABLE_OFFSETS.header);
}

/** 헤더 바이트를 해석한다(테스트·주입 공용). */
export function decodeTableHeader(bytes: ArrayBuffer): TableHeaderReadback {
  const v = new DataView(bytes);
  const u = (off: number): number => v.getUint32(off, true);
  return {
    dirtyCount: u(TABLE_OFFSETS.dirtyCount),
    refsTotal: u(TABLE_OFFSETS.refsTotal),
    dabOverflow: u(TABLE_OFFSETS.dabOverflow),
    refsOverflow: u(TABLE_OFFSETS.refsOverflow),
    poolCursor: u(TABLE_OFFSETS.poolCursor),
    strokeDirtyCount: u(TABLE_OFFSETS.strokeDirtyCount),
    poolOverflow: u(TABLE_OFFSETS.poolOverflow),
    wetCursor: u(TABLE_OFFSETS.wetCursor),
    wetActiveCount: u(TABLE_OFFSETS.wetActiveCount),
    wetOverflow: u(TABLE_OFFSETS.wetOverflow),
    wetSettleDone: u(TABLE_OFFSETS.wetSettleDone),
    wetLiveCount: u(TABLE_OFFSETS.wetLiveCount),
  };
}

export async function mapTableHeader(tableStaging: GPUBuffer): Promise<TableHeaderReadback> {
  await tableStaging.mapAsync(MAP_MODE.READ, 0, TABLE_OFFSETS.header);
  const bytes = tableStaging.getMappedRange(0, TABLE_OFFSETS.header).slice(0);
  tableStaging.unmap();
  return decodeTableHeader(bytes);
}

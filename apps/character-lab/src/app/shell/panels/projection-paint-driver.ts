/**
 * 투영 페인트(베타) 드로잉 드라이버. `paint/paint-bridge`의 `createPointerPaintDriver`(UV 원형 스탬프, CPU)와 같은 `PointerPaintDriver` 인터페이스를 구현해
 * `ViewportPane`이 스트로크마다 둘 중 하나를 고르게 한다 — 엔진이 투영 포트(`projectionPaint()`)를 주면(베타를 켜고 능력이 되면) 투영, 아니면 기존 CPU 경로.
 *
 * 흐름(스트로크 하나)
 *  1. `down`: 부위 레이어 크기로 포트를 시작(`begin`)하고 브러시 비트맵(premultiplied sRGB, `dabMask`로 만든 소프트 원)을 올린 뒤 첫 스탬프(`stamp(ndc)`).
 *  2. `move`: 포인터 이동을 화면 위 브러시 크기×간격(`brush.spacing`)으로 나눠 보간 스탬프(이동 한 번에 최대 `MAX_STAMPS_PER_MOVE`개).
 *  3. `up`: 포트 `flush()`(GPU 결과 읽기)가 비동기라 **바로 null을 돌려주고**, 읽기가 끝나면 overlay를 `PaintLayer`에 합성해 변경된 64px 타일을
 *     `session.applyToken`으로 레이어에 반영한다. 그 호출이 돌려주는 역토큰(= 변경 전 타일)이 undo 토큰이며 `commit`(`paint/stroke`)으로 정확히 1번 보낸다
 *     (1 포인터 스트로크 = 1 undo, CPU 경로와 같은 계약). 결과는 항상 같은 `PaintLayer` RGBA다.
 *
 * 한계(정직하게)
 *  - GPU 블렌딩은 sRGB 바이트 공간 premultiplied source-over, CPU 경로는 선형 공간 합성이라 **스트로크 안에서 겹치는 곳**의 값이 미세하게 다르다.
 *    기존에 칠해진 레이어 위에는 overlay를 선형 합성으로 얹으므로 그 부분은 CPU 경로와 같은 식이다.
 *  - 읽기가 끝나기 전에는 새 스트로크를 시작하지 않는다(포트가 부위 하나의 RTT를 공유). 그동안 `down`은 false를 돌려주고 사유를 알린다.
 *  - 투영 뒷면·UV 섬 경계·스키닝된 표면 결과는 실제 GPU에서만 확인된다(브라우저 미검증 항목은 docs/parity/render.md).
 */
import { PAINT_TILE_SIZE } from "../../../contracts";
import { createPointerPaintDriver } from "../../../paint/paint-bridge";
import { MAX_BRUSH_RADIUS_PX, MIN_BRUSH_RADIUS_PX, compositePixelLinear, dabMask, tileExtent } from "../../../paint/paint-layer";
import { PROJECTION_FALLBACK_SCREEN_NDC, overlayHasPaint, premultipliedPixel, unpremultiplyPixel } from "../../../render/projection-paint";
import { parseHex, srgbToLinear } from "../../../shared/color";

import type { BrushSettings, PaintLayer, PaintUndoToken, PaintUndoTile, PartRole } from "../../../contracts";
import type { PaintLayerUploader, PointerPaintDriver, PointerPaintPorts, PointerSample } from "../../../paint/paint-bridge";
import type { PaintSession } from "../../../paint/paint-session";
import type { ProjectionBrushBitmap, ProjectionOverlay, ProjectionPaintPort } from "../../../render/projection-paint";

/** 포인터 이동 한 번에 보간하는 스탬프 상한(스탬프마다 RTT 렌더 패스가 든다) */
export const MAX_STAMPS_PER_MOVE = 16;
/** 브러시 비트맵 한 변(px) 하한·상한. 상한을 넘는 브러시는 확대 샘플링된다. */
export const PROJECTION_BITMAP_MIN = 8;
export const PROJECTION_BITMAP_MAX = 64;

export interface ProjectionPaintPorts {
  /** 지금 쓸 수 있는 투영 포트(없으면 null → CPU 경로) */
  readonly projection: () => ProjectionPaintPort | null;
  readonly upload: PaintLayerUploader;
  /** 스트로크 종료 시 토큰 1개(`dispatch({ type: "paint/stroke", undoToken })`) */
  readonly commit: (token: PaintUndoToken) => void;
  /** 한글 안내·오류(null이면 지움). 비동기 반영 중 거절·실패를 화면에 알린다. */
  readonly notify?: (messageKo: string | null) => void;
}

// ---------------------------------------------------------------- 브러시 비트맵

/** 세션 브러시와 강도(불투명도 × 압력)에서 premultiplied sRGB RGBA8 비트맵을 만든다(행 0 = 위). */
export function brushBitmapFor(brush: BrushSettings, pressure: number): ProjectionBrushBitmap {
  const radius = Math.min(MAX_BRUSH_RADIUS_PX, Math.max(MIN_BRUSH_RADIUS_PX, brush.radiusPx));
  const size = Math.min(PROJECTION_BITMAP_MAX, Math.max(PROJECTION_BITMAP_MIN, Math.ceil(2 * radius) + 2));
  const color = parseHex(brush.color);
  if (!color) throw new Error(`브러시 색 "${brush.color}"은 #rrggbb 형식이어야 합니다.`);
  const strength = Math.min(1, Math.max(0, brush.opacity)) * Math.min(1, Math.max(0, pressure));
  // 비트맵 지름이 투영 한 변과 같으므로 원이 비트맵을 거의 꽉 채우게 한다(가장자리 1텍셀 여유).
  const bitmapRadius = (size - 2) / 2;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const mask = dabMask(distance, bitmapRadius, brush.hardness);
      const pixel = premultipliedPixel(color, mask, strength);
      rgba.set(pixel, (y * size + x) * 4);
    }
  }
  return { size, rgba, key: `${size}|${brush.color}|${brush.hardness.toFixed(3)}|${strength.toFixed(3)}` };
}

// ---------------------------------------------------------------- overlay 합성

const SRGB_TO_LINEAR = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

/**
 * overlay(premultiplied sRGB RGBA, 행 0 = UV v 0)를 레이어에 합성한 **합성 후 타일**을 토큰으로 만든다(레이어는 건드리지 않는다).
 * 칠해진(알파 > 0) 픽셀이 있는 64px 타일만 담는다. 합성은 CPU 스탬프 경로와 같은 선형 공간 source-over(`compositePixelLinear`)다.
 * 칠한 것이 없으면 null. 크기·부위가 레이어와 다르면 한글 오류.
 */
export function compositeOverlayTiles(layer: PaintLayer, overlay: ProjectionOverlay): PaintUndoToken | null {
  if (overlay.part !== layer.part) throw new Error(`투영 결과 부위(${overlay.part})가 레이어 부위(${layer.part})와 다릅니다.`);
  if (overlay.width !== layer.width || overlay.height !== layer.height) {
    throw new Error(`투영 결과 크기 ${overlay.width}×${overlay.height}가 레이어 ${layer.width}×${layer.height}와 다릅니다(스트로크 중 레이어 크기가 바뀌었습니다).`);
  }
  if (!overlayHasPaint(overlay)) return null;
  const tilesX = Math.ceil(layer.width / PAINT_TILE_SIZE);
  const tilesY = Math.ceil(layer.height / PAINT_TILE_SIZE);
  const tiles: PaintUndoTile[] = [];
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const { x, y, w, h } = tileExtent(layer, tx, ty);
      const data = new Uint8ClampedArray(w * h * 4);
      let painted = false;
      for (let row = 0; row < h; row += 1) {
        const start = ((y + row) * layer.width + x) * 4;
        data.set(layer.rgba.subarray(start, start + w * 4), row * w * 4);
        for (let col = 0; col < w; col += 1) {
          const index = start + col * 4;
          const alpha = overlay.rgba[index + 3] ?? 0;
          if (alpha === 0) continue;
          const straight = unpremultiplyPixel(overlay.rgba[index] ?? 0, overlay.rgba[index + 1] ?? 0, overlay.rgba[index + 2] ?? 0, alpha);
          if (!straight) continue;
          const src: readonly [number, number, number] = [SRGB_TO_LINEAR[Math.round(straight.rgb[0])] ?? 0, SRGB_TO_LINEAR[Math.round(straight.rgb[1])] ?? 0, SRGB_TO_LINEAR[Math.round(straight.rgb[2])] ?? 0];
          compositePixelLinear(data, (row * w + col) * 4, src, straight.alpha);
          painted = true;
        }
      }
      if (painted) tiles.push({ x, y, data });
    }
  }
  return tiles.length === 0 ? null : { part: layer.part, tiles, tileSize: PAINT_TILE_SIZE };
}

// ---------------------------------------------------------------- 투영 스트로크 드라이버

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

/** 투영 포트로 한 스트로크를 구동하는 드라이버. `up()`은 반영이 비동기라 항상 null을 돌려준다(토큰은 `commit`으로 전달). */
export function createProjectionStrokeDriver(session: PaintSession, port: ProjectionPaintPort, ports: Pick<ProjectionPaintPorts, "upload" | "commit" | "notify">, shared: { finalizing: boolean }): PointerPaintDriver {
  let active = false;
  let touching = false;
  let dabCount = 0;
  let part: PartRole = session.getState().activePart;
  let last: { readonly x: number; readonly y: number } | null = null;
  let screenSize: readonly [number, number] = PROJECTION_FALLBACK_SCREEN_NDC;
  const bitmaps = new Map<string, ProjectionBrushBitmap>();

  const stampAt = (x: number, y: number, pressure: number): boolean => {
    const brush = session.getState().brush;
    const bitmap = brushBitmapFor(brush, pressure);
    const cached = bitmaps.get(bitmap.key) ?? bitmap;
    bitmaps.set(cached.key, cached);
    port.setBrush(cached, brush.radiusPx);
    const outcome = port.stamp(x, y);
    if (!outcome.hit) return false;
    screenSize = outcome.screenSizeNdc;
    dabCount += 1;
    return true;
  };

  const reset = (): void => {
    active = false;
    touching = false;
    dabCount = 0;
    last = null;
    bitmaps.clear();
  };

  const finalize = async (): Promise<void> => {
    try {
      const overlay = await port.flush();
      if (!overlay) return;
      const layer = session.layer(overlay.part);
      const after = compositeOverlayTiles(layer, overlay);
      if (!after) return;
      // 합성 후 타일을 레이어에 적용하면 변경 전 타일이 역토큰으로 돌아온다 = 이 스트로크의 undo 토큰.
      const inverse = session.applyToken(after);
      if (!inverse) throw new Error("세션이 부위 레이어를 찾지 못했습니다.");
      ports.upload(session.layer(overlay.part));
      ports.commit(inverse);
    } catch (error) {
      port.cancel();
      ports.notify?.(`투영 페인트 결과를 레이어에 반영하지 못했습니다: ${failureText(error)}`);
    } finally {
      shared.finalizing = false;
    }
  };

  return {
    get active() {
      return active;
    },
    get touching() {
      return touching;
    },
    get dabCount() {
      return dabCount;
    },
    down(sample) {
      // 진행 중이던 스트로크는 먼저 끝낸다(반영이 시작되므로 그 뒤에 반영 중인지 확인한다).
      if (active) this.up();
      if (shared.finalizing) {
        ports.notify?.("이전 투영 스트로크를 레이어에 반영하는 중입니다. 잠시 뒤 다시 칠하세요.");
        return false;
      }
      part = session.getState().activePart;
      const layer = session.layer(part);
      if (!port.begin(part, layer.width, layer.height)) {
        ports.notify?.("투영 페인트: 이 부위에 칠할 메시가 없습니다.");
        return false;
      }
      active = true;
      screenSize = PROJECTION_FALLBACK_SCREEN_NDC;
      last = { x: sample.ndcX, y: sample.ndcY };
      touching = stampAt(sample.ndcX, sample.ndcY, sample.pressure);
      return touching;
    },
    move(sample) {
      if (!active || last === null) return 0;
      const from = last;
      // 화면 위 브러시 크기 단위 이동 거리 → 간격(brush.spacing × 반지름 = spacing/2 × 지름)마다 스탬프
      const distance = Math.hypot((sample.ndcX - from.x) / Math.max(screenSize[0], 1e-6), (sample.ndcY - from.y) / Math.max(screenSize[1], 1e-6));
      const step = Math.max(0.02, session.getState().brush.spacing / 2);
      const count = Math.min(MAX_STAMPS_PER_MOVE, Math.max(1, Math.ceil(distance / step - 1e-6)));
      let added = 0;
      let hitLast = false;
      for (let k = 1; k <= count; k += 1) {
        const t = k / count;
        const hit = stampAt(from.x + (sample.ndcX - from.x) * t, from.y + (sample.ndcY - from.y) * t, sample.pressure);
        if (hit) added += 1;
        hitLast = hit;
      }
      touching = hitLast;
      last = { x: sample.ndcX, y: sample.ndcY };
      return added;
    },
    up() {
      if (!active) return null;
      const painted = dabCount > 0;
      reset();
      if (!painted) {
        port.cancel();
        return null;
      }
      shared.finalizing = true;
      void finalize();
      return null;
    },
    cancel() {
      if (!active) return;
      reset();
      port.cancel();
    },
  };
}

// ---------------------------------------------------------------- 전환 드라이버

/**
 * 스트로크마다 투영(포트가 있을 때)과 CPU 스탬프 경로를 고르는 드라이버. 포인터를 누를 때 한 번 고르고 그 스트로크는 끝까지 같은 경로를 쓴다.
 * 베타 토글은 엔진 세션 상태라 드로잉 중에도 바뀔 수 있으므로 `ProjectionPaintPorts.projection()`을 스트로크 시작 때마다 읽는다.
 */
export function createSwitchingPaintDriver(session: PaintSession, ports: PointerPaintPorts & ProjectionPaintPorts): PointerPaintDriver {
  const cpu = createPointerPaintDriver(session, { pick: ports.pick, upload: ports.upload, commit: ports.commit });
  const shared = { finalizing: false };
  let current: PointerPaintDriver = cpu;

  return {
    get active() {
      return current.active;
    },
    get touching() {
      return current.touching;
    },
    get dabCount() {
      return current.dabCount;
    },
    down(sample: PointerSample) {
      // 진행 중이던 스트로크는 그 경로로 먼저 끝낸다(`down`이 내부에서 닫지만 경로가 바뀔 수 있어 여기서 처리).
      if (current.active) current.up();
      if (shared.finalizing) {
        ports.notify?.("이전 투영 스트로크를 레이어에 반영하는 중입니다. 잠시 뒤 다시 칠하세요.");
        return false;
      }
      const port = ports.projection();
      current = port ? createProjectionStrokeDriver(session, port, ports, shared) : cpu;
      return current.down(sample);
    },
    move: (sample) => current.move(sample),
    up: () => current.up(),
    cancel: () => current.cancel(),
  };
}

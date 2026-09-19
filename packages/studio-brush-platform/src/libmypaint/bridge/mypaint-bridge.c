/*
 * ToonSpectrum libmypaint wasm bridge (ADR-0011 lane 11).
 *
 * Thin C shims over libmypaint v1.6.1 so the TypeScript loader can:
 *   (a) create a brush and program it through the injection API
 *       (set_base_value / set_mapping_n / set_mapping_point) — the json-c
 *       parser is bypassed by design (see json.h),
 *   (b) feed stroke_to(x, y, pressure, xtilt, ytilt, dtime) samples against a
 *       MyPaintFixedTiledSurface, and
 *   (c) read the surface back as straight-alpha RGBA8.
 *
 * The sample-feed atomic granularity (begin_atomic + stroke_to + end_atomic
 * per sample) intentionally mirrors HokusaiCanvas.addSample so cross-engine
 * throughput numbers compare like-for-like.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>

#include "config.h"
#include "mypaint-brush-settings.h"
#include "mypaint-brush.h"
#include "mypaint-fixed-tiled-surface.h"
#include "mypaint-glib-compat.h"
#include "mypaint-surface.h"
#include "mypaint-tiled-surface.h"

/* Surface handles stay opaque at the JS boundary. Dirty state is native and
 * surface-local: no shared global ROI and no per-sample JS allocation. */
typedef struct {
  MyPaintFixedTiledSurface *pixels;
  MyPaintRectangle dirty;
} StudioLmpSurface;

static void lmp_mark_dirty(StudioLmpSurface *surface, MyPaintRectangle roi) {
  const int width = mypaint_fixed_tiled_surface_get_width(surface->pixels);
  const int height = mypaint_fixed_tiled_surface_get_height(surface->pixels);
  const int x = roi.x < 0 ? 0 : roi.x;
  const int y = roi.y < 0 ? 0 : roi.y;
  const int64_t right = (int64_t)roi.x + roi.width;
  const int64_t bottom = (int64_t)roi.y + roi.height;
  const int r = right > width ? width : (int)right;
  const int b = bottom > height ? height : (int)bottom;
  if (roi.width <= 0 || roi.height <= 0 || r <= x || b <= y) return;
  MyPaintRectangle clipped = { x, y, r - x, b - y };
  mypaint_rectangle_expand_to_include_rect(&surface->dirty, &clipped);
}

EMSCRIPTEN_KEEPALIVE
const char *lmp_version(void) {
  return TOONSPECTRUM_LIBMYPAINT_VERSION;
}

EMSCRIPTEN_KEEPALIVE
int lmp_setting_count(void) {
  return MYPAINT_BRUSH_SETTINGS_COUNT;
}

EMSCRIPTEN_KEEPALIVE
int lmp_input_count(void) {
  return MYPAINT_BRUSH_INPUTS_COUNT;
}

/* Returns the setting id, or a value >= MYPAINT_BRUSH_SETTINGS_COUNT (or < 0)
 * for unknown cnames — callers must range-check (libmypaint's contract). */
EMSCRIPTEN_KEEPALIVE
int lmp_setting_id(const char *cname) {
  return (int)mypaint_brush_setting_from_cname(cname);
}

EMSCRIPTEN_KEEPALIVE
int lmp_input_id(const char *cname) {
  return (int)mypaint_brush_input_from_cname(cname);
}

/* Fresh brush with stock MyPaint defaults (mypaint_brush_from_defaults). */
EMSCRIPTEN_KEEPALIVE
MyPaintBrush *lmp_brush_new(void) {
  MyPaintBrush *brush = mypaint_brush_new();
  if (brush != NULL) {
    mypaint_brush_from_defaults(brush);
  }
  return brush;
}

EMSCRIPTEN_KEEPALIVE
void lmp_brush_free(MyPaintBrush *brush) {
  mypaint_brush_unref(brush);
}

EMSCRIPTEN_KEEPALIVE
void lmp_brush_set_base_value(MyPaintBrush *brush, int setting_id,
                              float value) {
  mypaint_brush_set_base_value(brush, (MyPaintBrushSetting)setting_id, value);
}

EMSCRIPTEN_KEEPALIVE
float lmp_brush_get_base_value(MyPaintBrush *brush, int setting_id) {
  return mypaint_brush_get_base_value(brush, (MyPaintBrushSetting)setting_id);
}

EMSCRIPTEN_KEEPALIVE
void lmp_brush_set_mapping_n(MyPaintBrush *brush, int setting_id, int input_id,
                             int n) {
  mypaint_brush_set_mapping_n(brush, (MyPaintBrushSetting)setting_id,
                              (MyPaintBrushInput)input_id, n);
}

EMSCRIPTEN_KEEPALIVE
void lmp_brush_set_mapping_point(MyPaintBrush *brush, int setting_id,
                                 int input_id, int index, float x, float y) {
  mypaint_brush_set_mapping_point(brush, (MyPaintBrushSetting)setting_id,
                                  (MyPaintBrushInput)input_id, index, x, y);
}

/* Reset dynamic state and begin a stroke. Settings/mappings survive (the
 * libmypaint reset contract), so one programmed brush renders many strokes
 * deterministically: the per-brush RngDouble reseeds on reset, and `seed`
 * repins libc rand() — brushmodes.c's smudge color sampling
 * (get_color_pixels_legacy) draws from the GLOBAL libc RNG, which would
 * otherwise drift across renders inside one wasm instance. */
EMSCRIPTEN_KEEPALIVE
void lmp_brush_new_stroke(MyPaintBrush *brush, unsigned int seed) {
  srand(seed);
  mypaint_brush_reset(brush);
  mypaint_brush_new_stroke(brush);
}

/* Zero every tile through the public tile-request API (the struct's buffer is
 * private to mypaint-fixed-tiled-surface.c). Upstream initializes the buffer
 * with memset(255) — an opaque-white example convention — but the parity lane
 * needs a transparent canvas exactly like HokusaiCanvas. */
EMSCRIPTEN_KEEPALIVE
void lmp_surface_clear(StudioLmpSurface *surface) {
  if (surface == NULL) return;
  MyPaintTiledSurface *tiled = (MyPaintTiledSurface *)surface->pixels;
  const int width = mypaint_fixed_tiled_surface_get_width(surface->pixels);
  const int height = mypaint_fixed_tiled_surface_get_height(surface->pixels);
  const int tile_size = tiled->tile_size;
  const size_t tile_bytes = (size_t)tile_size * tile_size * 4 * sizeof(uint16_t);
  for (int ty = 0; ty < (height + tile_size - 1) / tile_size; ty++) {
    for (int tx = 0; tx < (width + tile_size - 1) / tile_size; tx++) {
      MyPaintTileRequest request;
      mypaint_tile_request_init(&request, 0, tx, ty, FALSE);
      mypaint_tiled_surface_tile_request_start(tiled, &request);
      if (request.buffer != NULL) memset(request.buffer, 0, tile_bytes);
      mypaint_tiled_surface_tile_request_end(tiled, &request);
    }
  }
  surface->dirty = (MyPaintRectangle){ 0, 0, width, height };
}

EMSCRIPTEN_KEEPALIVE
StudioLmpSurface *lmp_surface_new(int width, int height) {
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096 ||
      (int64_t)width * height > 4194304) return NULL;
  StudioLmpSurface *surface = calloc(1, sizeof(StudioLmpSurface));
  if (surface == NULL) return NULL;
  surface->pixels = mypaint_fixed_tiled_surface_new(width, height);
  if (surface->pixels == NULL) { free(surface); return NULL; }
  lmp_surface_clear(surface);
  surface->dirty = (MyPaintRectangle){ 0, 0, 0, 0 }; /* fresh transparent canvas */
  return surface;
}

EMSCRIPTEN_KEEPALIVE
void lmp_surface_free(StudioLmpSurface *surface) {
  if (surface == NULL) return;
  mypaint_surface_unref(mypaint_fixed_tiled_surface_interface(surface->pixels));
  free(surface);
}

EMSCRIPTEN_KEEPALIVE
int lmp_surface_width(StudioLmpSurface *surface) {
  return mypaint_fixed_tiled_surface_get_width(surface->pixels);
}

EMSCRIPTEN_KEEPALIVE
int lmp_surface_height(StudioLmpSurface *surface) {
  return mypaint_fixed_tiled_surface_get_height(surface->pixels);
}

EMSCRIPTEN_KEEPALIVE
int lmp_surface_dirty_rect(StudioLmpSurface *surface, int32_t *out) {
  if (surface == NULL || out == NULL || surface->dirty.width <= 0 || surface->dirty.height <= 0) return 0;
  out[0] = surface->dirty.x; out[1] = surface->dirty.y;
  out[2] = surface->dirty.width; out[3] = surface->dirty.height;
  return 1;
}

EMSCRIPTEN_KEEPALIVE
void lmp_surface_ack_dirty(StudioLmpSurface *surface) {
  if (surface != NULL) surface->dirty = (MyPaintRectangle){ 0, 0, 0, 0 };
}

/* One pointer sample: begin_atomic → stroke_to → end_atomic, exactly the
 * HokusaiCanvas.addSample granularity. dtime is in seconds. Returns
 * libmypaint's "painted" flag. */
EMSCRIPTEN_KEEPALIVE
int lmp_stroke_to(MyPaintBrush *brush, StudioLmpSurface *surface,
                  float x, float y, float pressure, float xtilt, float ytilt,
                  double dtime) {
  MyPaintSurface *interface = mypaint_fixed_tiled_surface_interface(surface->pixels);
  MyPaintRectangle roi = { 0, 0, 0, 0 };
  mypaint_surface_begin_atomic(interface);
  const int painted = mypaint_brush_stroke_to(brush, interface, x, y, pressure,
                                              xtilt, ytilt, dtime);
  mypaint_surface_end_atomic(interface, &roi);
  lmp_mark_dirty(surface, roi);
  return painted;
}

/* Packed, straight-alpha RGBA8 of just the requested rectangle. Reads only
 * intersecting native tiles; never constructs a full-frame temporary. The
 * fix15 conversion is identical to the previous full-frame implementation. */
EMSCRIPTEN_KEEPALIVE
int lmp_surface_region_to_rgba8(StudioLmpSurface *surface, int x, int y,
                               int width, int height, uint8_t *out) {
  if (surface == NULL || out == NULL || x < 0 || y < 0 || width <= 0 || height <= 0) return 0;
  const int sw = lmp_surface_width(surface), sh = lmp_surface_height(surface);
  if ((int64_t)x + width > sw || (int64_t)y + height > sh) return 0;
  memset(out, 0, (size_t)width * height * 4);
  MyPaintTiledSurface *tiled = (MyPaintTiledSurface *)surface->pixels;
  const int size = tiled->tile_size;
  const int right = x + width, bottom = y + height;
  for (int ty = y / size; ty <= (bottom - 1) / size; ty++) {
    for (int tx = x / size; tx <= (right - 1) / size; tx++) {
      MyPaintTileRequest request;
      mypaint_tile_request_init(&request, 0, tx, ty, TRUE);
      mypaint_tiled_surface_tile_request_start(tiled, &request);
      const uint16_t *tile = request.buffer;
      if (tile != NULL) {
        const int x0 = tx * size, y0 = ty * size;
        const int left = x > x0 ? x : x0;
        const int top = y > y0 ? y : y0;
        const int r = right < x0 + size ? right : x0 + size;
        const int b = bottom < y0 + size ? bottom : y0 + size;
        for (int py = top; py < b; py++) {
          for (int px = left; px < r; px++) {
            const uint16_t *src = tile + ((size_t)(py - y0) * size + px - x0) * 4;
            uint8_t *dst = out + ((size_t)(py - y) * width + px - x) * 4;
            const uint32_t alpha = src[3];
            if (alpha == 0) continue;
            for (int c = 0; c < 3; c++) {
              const uint32_t value = ((uint32_t)src[c] * 255 + alpha / 2) / alpha;
              dst[c] = (uint8_t)(value > 255 ? 255 : value);
            }
            dst[3] = (uint8_t)((alpha * 255 + (1u << 14)) >> 15);
          }
        }
      }
      mypaint_tiled_surface_tile_request_end(tiled, &request);
    }
  }
  return 1;
}

/* Existing complete-frame ABI is preserved for golden/reference/export users. */
EMSCRIPTEN_KEEPALIVE
void lmp_surface_to_rgba8(StudioLmpSurface *surface, uint8_t *out) {
  lmp_surface_region_to_rgba8(surface, 0, 0, lmp_surface_width(surface), lmp_surface_height(surface), out);
}

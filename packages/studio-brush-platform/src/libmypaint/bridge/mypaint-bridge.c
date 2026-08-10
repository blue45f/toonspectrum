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
void lmp_surface_clear(MyPaintFixedTiledSurface *surface) {
  MyPaintTiledSurface *tiled = (MyPaintTiledSurface *)surface;
  const int width = mypaint_fixed_tiled_surface_get_width(surface);
  const int height = mypaint_fixed_tiled_surface_get_height(surface);
  const int tile_size = tiled->tile_size;
  const size_t tile_bytes =
      (size_t)tile_size * tile_size * 4 * sizeof(uint16_t);
  const int tiles_x = (width + tile_size - 1) / tile_size;
  const int tiles_y = (height + tile_size - 1) / tile_size;
  for (int ty = 0; ty < tiles_y; ty++) {
    for (int tx = 0; tx < tiles_x; tx++) {
      MyPaintTileRequest request;
      mypaint_tile_request_init(&request, 0, tx, ty, FALSE);
      mypaint_tiled_surface_tile_request_start(tiled, &request);
      if (request.buffer != NULL) {
        memset(request.buffer, 0, tile_bytes);
      }
      mypaint_tiled_surface_tile_request_end(tiled, &request);
    }
  }
}

EMSCRIPTEN_KEEPALIVE
MyPaintFixedTiledSurface *lmp_surface_new(int width, int height) {
  MyPaintFixedTiledSurface *surface =
      mypaint_fixed_tiled_surface_new(width, height);
  if (surface != NULL) {
    lmp_surface_clear(surface);
  }
  return surface;
}

EMSCRIPTEN_KEEPALIVE
void lmp_surface_free(MyPaintFixedTiledSurface *surface) {
  mypaint_surface_unref(mypaint_fixed_tiled_surface_interface(surface));
}

EMSCRIPTEN_KEEPALIVE
int lmp_surface_width(MyPaintFixedTiledSurface *surface) {
  return mypaint_fixed_tiled_surface_get_width(surface);
}

EMSCRIPTEN_KEEPALIVE
int lmp_surface_height(MyPaintFixedTiledSurface *surface) {
  return mypaint_fixed_tiled_surface_get_height(surface);
}

/* One pointer sample: begin_atomic → stroke_to → end_atomic, exactly the
 * HokusaiCanvas.addSample granularity. dtime is in seconds. Returns
 * libmypaint's "painted" flag. */
EMSCRIPTEN_KEEPALIVE
int lmp_stroke_to(MyPaintBrush *brush, MyPaintFixedTiledSurface *surface,
                  float x, float y, float pressure, float xtilt, float ytilt,
                  double dtime) {
  MyPaintSurface *interface = mypaint_fixed_tiled_surface_interface(surface);
  MyPaintRectangle roi;
  mypaint_surface_begin_atomic(interface);
  const int painted = mypaint_brush_stroke_to(brush, interface, x, y, pressure,
                                              xtilt, ytilt, dtime);
  mypaint_surface_end_atomic(interface, &roi);
  return painted;
}

/*
 * Read the whole surface as straight-alpha RGBA8 into `out` (width*height*4
 * bytes, caller-allocated). libmypaint tiles are premultiplied fix15
 * (0..1<<15) in the engine's native (non-linear) channel space; this
 * un-premultiplies and scales without any color-space transform, mirroring
 * HokusaiCanvas.fullFrame's straight-alpha layout. Alpha is the cross-engine
 * parity axis — RGB stays in each engine's own space (recorded in the ADR).
 */
EMSCRIPTEN_KEEPALIVE
void lmp_surface_to_rgba8(MyPaintFixedTiledSurface *surface, uint8_t *out) {
  MyPaintTiledSurface *tiled = (MyPaintTiledSurface *)surface;
  const int width = mypaint_fixed_tiled_surface_get_width(surface);
  const int height = mypaint_fixed_tiled_surface_get_height(surface);
  const int tile_size = tiled->tile_size;
  const int tiles_x = (width + tile_size - 1) / tile_size;
  const int tiles_y = (height + tile_size - 1) / tile_size;

  for (int ty = 0; ty < tiles_y; ty++) {
    for (int tx = 0; tx < tiles_x; tx++) {
      MyPaintTileRequest request;
      mypaint_tile_request_init(&request, 0, tx, ty, TRUE);
      mypaint_tiled_surface_tile_request_start(tiled, &request);
      const uint16_t *tile = request.buffer;
      if (tile != NULL) {
        const int x0 = tx * tile_size;
        const int y0 = ty * tile_size;
        const int copy_w = (x0 + tile_size > width) ? width - x0 : tile_size;
        const int copy_h = (y0 + tile_size > height) ? height - y0 : tile_size;
        for (int local_y = 0; local_y < copy_h; local_y++) {
          const uint16_t *row = tile + (size_t)local_y * tile_size * 4;
          uint8_t *out_row = out + (((size_t)(y0 + local_y) * width) + x0) * 4;
          for (int local_x = 0; local_x < copy_w; local_x++) {
            const uint32_t r15 = row[local_x * 4 + 0];
            const uint32_t g15 = row[local_x * 4 + 1];
            const uint32_t b15 = row[local_x * 4 + 2];
            const uint32_t a15 = row[local_x * 4 + 3];
            uint8_t *pixel = out_row + (size_t)local_x * 4;
            if (a15 == 0) {
              pixel[0] = 0;
              pixel[1] = 0;
              pixel[2] = 0;
              pixel[3] = 0;
            } else {
              /* straight = premultiplied / alpha, rounded, clamped. */
              uint32_t r8 = (r15 * 255 + a15 / 2) / a15;
              uint32_t g8 = (g15 * 255 + a15 / 2) / a15;
              uint32_t b8 = (b15 * 255 + a15 / 2) / a15;
              pixel[0] = (uint8_t)(r8 > 255 ? 255 : r8);
              pixel[1] = (uint8_t)(g8 > 255 ? 255 : g8);
              pixel[2] = (uint8_t)(b8 > 255 ? 255 : b8);
              pixel[3] = (uint8_t)((a15 * 255 + (1u << 14)) >> 15);
            }
          }
        }
      }
      mypaint_tiled_surface_tile_request_end(tiled, &request);
    }
  }
}

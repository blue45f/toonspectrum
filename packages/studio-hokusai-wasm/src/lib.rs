//! Transparent, deterministic wasm bindings around Hokusai 0.3.0.
//!
//! This crate deliberately composes `hokusai-core`, `hokusai-brush`, and
//! `hokusai-tile-mem` directly. Hokusai's upstream wasm wrapper flattens onto
//! white; ToonSpectrum instead reads the original premultiplied-linear fix15
//! tiles and exports straight-alpha sRGB RGBA8.

#![forbid(unsafe_code)]

use hokusai_brush as myb;
use hokusai_core::color::linear_to_srgb;
use hokusai_core::tile::TILE_SIZE;
use hokusai_core::{fix15, Brush, BrushSetting, BrushState, TiledSurface};
use hokusai_tile_mem::MemSurface;
use wasm_bindgen::prelude::*;

const MAX_BRUSH_JSON_BYTES: usize = 1024 * 1024;
const MAX_DIMENSION: u32 = 16_384;
const MAX_PIXELS: u64 = 64 * 1024 * 1024;
const SAMPLE_OVERSCAN: f32 = 4_096.0;

const NATURAL_MEDIA_BRUSH: &str = r#"{
  "version": 3,
  "group": "ToonSpectrum",
  "comment": "Seeded transparent natural-media brush",
  "settings": {
    "opaque": {
      "base_value": 0.55,
      "inputs": {
        "pressure": [[0.0, -0.42], [0.35, 0.0], [1.0, 0.45]]
      }
    },
    "opaque_multiply": { "base_value": 1.0 },
    "hardness": { "base_value": 0.52 },
    "radius_logarithmic": {
      "base_value": 2.35,
      "inputs": {
        "pressure": [[0.0, -0.70], [1.0, 0.28]]
      }
    },
    "dabs_per_actual_radius": { "base_value": 3.25 },
    "tracking_noise": { "base_value": 0.055 },
    "radius_by_random": { "base_value": 0.14 },
    "elliptical_dab_ratio": {
      "base_value": 1.25,
      "inputs": {
        "tilt": [[0.0, 0.0], [1.0, 1.75]]
      }
    },
    "elliptical_dab_angle": {
      "base_value": 0.0,
      "inputs": {
        "tilt_ascension": [[-180.0, -180.0], [180.0, 180.0]]
      }
    },
    "anti_aliasing": { "base_value": 1.0 },
    "slow_tracking": { "base_value": 0.45 },
    "color_h": { "base_value": 0.075 },
    "color_s": { "base_value": 0.62 },
    "color_v": { "base_value": 0.24 }
  }
}"#;

/// Parsed libmypaint v3 brush data.
///
/// A canvas snapshots this value at `beginStroke`, so mutating a brush while
/// a stroke is active cannot change the in-flight stroke half way through.
#[wasm_bindgen]
pub struct HokusaiBrush {
    inner: Brush,
}

#[wasm_bindgen]
impl HokusaiBrush {
    /// Parse a libmypaint `.myb` v3 JSON document.
    #[wasm_bindgen(constructor)]
    pub fn new(myb_json: &str) -> Result<HokusaiBrush, JsError> {
        if myb_json.len() > MAX_BRUSH_JSON_BYTES {
            return Err(js_error("brush JSON exceeds the 1 MiB safety limit"));
        }
        let inner = myb::from_str(myb_json)
            .map_err(|error| js_error(&format!("invalid .myb brush: {error}")))?;
        Ok(Self { inner })
    }

    /// A pressure-, tilt-, and seeded-random-aware natural-media preset.
    #[wasm_bindgen(js_name = naturalMedia)]
    pub fn natural_media() -> HokusaiBrush {
        let inner =
            myb::from_str(NATURAL_MEDIA_BRUSH).expect("embedded natural-media brush is valid");
        Self { inner }
    }

    /// Override the HSV base colour. Hue wraps; saturation and value clamp.
    #[wasm_bindgen(js_name = setColorHsv)]
    pub fn set_color_hsv(&mut self, h: f32, s: f32, v: f32) -> Result<(), JsError> {
        if !h.is_finite() || !s.is_finite() || !v.is_finite() {
            return Err(js_error("HSV channels must be finite"));
        }
        self.inner.get_mut(BrushSetting::ColorH).base_value = h.rem_euclid(1.0);
        self.inner.get_mut(BrushSetting::ColorS).base_value = s.clamp(0.0, 1.0);
        self.inner.get_mut(BrushSetting::ColorV).base_value = v.clamp(0.0, 1.0);
        Ok(())
    }

    /// Override the UI-facing base-2 logarithmic radius in pixels.
    ///
    /// Hokusai 0.3.0 internally evaluates `exp(radius_logarithmic)`, so this
    /// wrapper converts the public log2 value to Hokusai's natural-log storage.
    #[wasm_bindgen(js_name = setRadiusLog)]
    pub fn set_radius_log(&mut self, log2_radius: f32) -> Result<(), JsError> {
        if !log2_radius.is_finite() {
            return Err(js_error("radius log must be finite"));
        }
        self.inner.get_mut(BrushSetting::Radius).base_value =
            log2_radius.clamp(0.2_f32.log2(), 1_000.0_f32.log2()) * std::f32::consts::LN_2;
        Ok(())
    }

    #[wasm_bindgen(js_name = radiusLog)]
    pub fn radius_log(&self) -> f32 {
        self.inner.get(BrushSetting::Radius).base_value / std::f32::consts::LN_2
    }
}

/// Stateful transparent canvas with an explicit stroke lifecycle.
///
/// Dirty bounds are conservative, tile-aligned bounds clipped to the canvas.
/// They safely include pixels that became transparent through erasing.
#[wasm_bindgen]
pub struct HokusaiCanvas {
    surface: MemSurface,
    state: BrushState,
    active_brush: Option<Brush>,
    width: u32,
    height: u32,
    default_seed: u32,
    last_time_ms: Option<f64>,
    dirty: Option<Bounds>,
    stroke_active: bool,
    disposed: bool,
}

#[wasm_bindgen]
impl HokusaiCanvas {
    /// Create a transparent canvas. `seed` is used when `beginStroke` omits
    /// its optional per-stroke seed.
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32, seed: u32) -> Result<HokusaiCanvas, JsError> {
        validate_dimensions(width, height)?;
        Ok(Self {
            surface: MemSurface::new(),
            state: BrushState::new(seed),
            active_brush: None,
            width,
            height,
            default_seed: seed,
            last_time_ms: None,
            dirty: None,
            stroke_active: false,
            disposed: false,
        })
    }

    /// Begin a stroke and snapshot `brush`. Passing `undefined`/`null` for
    /// `seed` uses the constructor seed.
    #[wasm_bindgen(js_name = beginStroke)]
    pub fn begin_stroke(
        &mut self,
        brush: &HokusaiBrush,
        seed: Option<u32>,
    ) -> Result<(), JsError> {
        self.ensure_live()?;
        if self.stroke_active {
            return Err(js_error(
                "a stroke is already active; finishStroke or reset first",
            ));
        }
        self.state = BrushState::new(seed.unwrap_or(self.default_seed));
        self.active_brush = Some(brush.inner.clone());
        self.last_time_ms = None;
        self.stroke_active = true;
        Ok(())
    }

    /// Add one absolute-time pointer sample.
    ///
    /// `timeMs` must be finite and monotonic. Pressure clamps to `[0, 1]`;
    /// tilt components clamp to `[-1, 1]`. The `brush` argument preserves a
    /// convenient call-site contract; rendering uses the immutable snapshot
    /// captured by `beginStroke`.
    #[wasm_bindgen(js_name = addSample)]
    #[allow(clippy::too_many_arguments)]
    pub fn add_sample(
        &mut self,
        _brush: &HokusaiBrush,
        x: f32,
        y: f32,
        pressure: f32,
        tilt_x: f32,
        tilt_y: f32,
        time_ms: f64,
    ) -> Result<bool, JsError> {
        self.ensure_live()?;
        if !self.stroke_active {
            return Err(js_error("beginStroke must be called before addSample"));
        }
        validate_sample(
            x,
            y,
            pressure,
            tilt_x,
            tilt_y,
            time_ms,
            self.width,
            self.height,
        )?;

        let dtime = match self.last_time_ms {
            None => 0.0001,
            Some(previous) if time_ms < previous => {
                return Err(js_error("sample timeMs must be monotonic"));
            }
            Some(previous) => (time_ms - previous) / 1_000.0,
        };

        let brush = self
            .active_brush
            .as_ref()
            .ok_or_else(|| js_error("active stroke has no brush snapshot"))?;
        self.surface.begin_atomic();
        let painted = brush.stroke_to(
            &mut self.state,
            &mut self.surface,
            x,
            y,
            pressure.clamp(0.0, 1.0),
            tilt_x.clamp(-1.0, 1.0),
            tilt_y.clamp(-1.0, 1.0),
            dtime,
        );
        let dirty_tiles = self.surface.end_atomic();
        self.last_time_ms = Some(time_ms);
        self.merge_dirty_tiles(dirty_tiles);
        Ok(painted)
    }

    /// Flush slow-tracking tail dabs, then close the active stroke.
    #[wasm_bindgen(js_name = finishStroke)]
    pub fn finish_stroke(&mut self, _brush: &HokusaiBrush) -> Result<bool, JsError> {
        self.ensure_live()?;
        if !self.stroke_active {
            return Err(js_error(
                "beginStroke must be called before finishStroke",
            ));
        }

        let brush = self
            .active_brush
            .as_ref()
            .ok_or_else(|| js_error("active stroke has no brush snapshot"))?;
        self.surface.begin_atomic();
        let painted = brush.finish_stroke(&mut self.state, &mut self.surface);
        let dirty_tiles = self.surface.end_atomic();
        self.merge_dirty_tiles(dirty_tiles);
        self.stroke_active = false;
        self.active_brush = None;
        self.last_time_ms = None;
        Ok(painted)
    }

    /// Return the entire transparent canvas as straight-alpha sRGB RGBA8.
    #[wasm_bindgen(js_name = fullFrame)]
    pub fn full_frame(&self) -> Result<Vec<u8>, JsError> {
        self.ensure_live()?;
        Ok(render_rect(
            &self.surface,
            self.width,
            Bounds::full(self.width, self.height),
        ))
    }

    /// Return `[x, y, width, height]` for changes since `clearDirty`.
    ///
    /// An empty `Int32Array` means there are no pending changes.
    #[wasm_bindgen(js_name = dirtyBounds)]
    pub fn dirty_bounds(&self) -> Result<Vec<i32>, JsError> {
        self.ensure_live()?;
        Ok(self.dirty.map_or_else(Vec::new, Bounds::as_i32_xywh))
    }

    /// Return tightly packed transparent RGBA8 for `dirtyBounds`.
    ///
    /// This does not clear dirty tracking. Call `clearDirty` after the
    /// consumer has uploaded both bounds and bytes.
    #[wasm_bindgen(js_name = dirtyFrame)]
    pub fn dirty_frame(&self) -> Result<Vec<u8>, JsError> {
        self.ensure_live()?;
        Ok(self
            .dirty
            .map_or_else(Vec::new, |bounds| render_rect(&self.surface, self.width, bounds)))
    }

    /// Acknowledge pending changes without altering canvas pixels.
    #[wasm_bindgen(js_name = clearDirty)]
    pub fn clear_dirty(&mut self) {
        self.dirty = None;
    }

    /// Clear all paint and cancel any active stroke.
    ///
    /// If the canvas contained tiles, the whole canvas becomes dirty so the
    /// caller can clear its destination texture.
    pub fn reset(&mut self) -> Result<bool, JsError> {
        self.ensure_live()?;
        let changed = self.surface.tile_count() > 0;
        self.surface = MemSurface::new();
        self.state = BrushState::new(self.default_seed);
        self.active_brush = None;
        self.last_time_ms = None;
        self.stroke_active = false;
        if changed {
            self.dirty = Some(Bounds::full(self.width, self.height));
        }
        Ok(changed)
    }

    /// Release Rust-owned tile memory and permanently tombstone this object.
    ///
    /// The method is idempotent. Call wasm-bindgen's generated `.free()`
    /// afterwards when the JavaScript wrapper itself is no longer needed.
    pub fn dispose(&mut self) {
        if self.disposed {
            return;
        }
        self.surface = MemSurface::new();
        self.state = BrushState::new(0);
        self.active_brush = None;
        self.last_time_ms = None;
        self.dirty = None;
        self.stroke_active = false;
        self.disposed = true;
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    #[wasm_bindgen(getter, js_name = isStrokeActive)]
    pub fn is_stroke_active(&self) -> bool {
        self.stroke_active
    }

    #[wasm_bindgen(getter, js_name = isDisposed)]
    pub fn is_disposed(&self) -> bool {
        self.disposed
    }

    #[wasm_bindgen(getter, js_name = hasDirty)]
    pub fn has_dirty(&self) -> bool {
        self.dirty.is_some()
    }
}

impl HokusaiCanvas {
    fn ensure_live(&self) -> Result<(), JsError> {
        if self.disposed {
            Err(js_error("canvas has been disposed"))
        } else {
            Ok(())
        }
    }

    fn merge_dirty_tiles(&mut self, tiles: Vec<(i32, i32)>) {
        for (tile_x, tile_y) in tiles {
            let Some(bounds) =
                Bounds::from_tile(tile_x, tile_y, self.width, self.height)
            else {
                continue;
            };
            self.dirty = Some(match self.dirty {
                Some(current) => current.union(bounds),
                None => bounds,
            });
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Bounds {
    x0: u32,
    y0: u32,
    x1: u32,
    y1: u32,
}

impl Bounds {
    const fn full(width: u32, height: u32) -> Self {
        Self {
            x0: 0,
            y0: 0,
            x1: width,
            y1: height,
        }
    }

    fn from_tile(tile_x: i32, tile_y: i32, width: u32, height: u32) -> Option<Self> {
        let tile_size = i64::try_from(TILE_SIZE).expect("tile size fits i64");
        let x0 = i64::from(tile_x) * tile_size;
        let y0 = i64::from(tile_y) * tile_size;
        let x1 = x0 + tile_size;
        let y1 = y0 + tile_size;
        let clipped_x0 = x0.clamp(0, i64::from(width));
        let clipped_y0 = y0.clamp(0, i64::from(height));
        let clipped_x1 = x1.clamp(0, i64::from(width));
        let clipped_y1 = y1.clamp(0, i64::from(height));
        if clipped_x0 >= clipped_x1 || clipped_y0 >= clipped_y1 {
            return None;
        }
        Some(Self {
            x0: u32::try_from(clipped_x0).expect("clipped x0 is non-negative"),
            y0: u32::try_from(clipped_y0).expect("clipped y0 is non-negative"),
            x1: u32::try_from(clipped_x1).expect("clipped x1 is non-negative"),
            y1: u32::try_from(clipped_y1).expect("clipped y1 is non-negative"),
        })
    }

    const fn union(self, other: Self) -> Self {
        Self {
            x0: if self.x0 < other.x0 {
                self.x0
            } else {
                other.x0
            },
            y0: if self.y0 < other.y0 {
                self.y0
            } else {
                other.y0
            },
            x1: if self.x1 > other.x1 {
                self.x1
            } else {
                other.x1
            },
            y1: if self.y1 > other.y1 {
                self.y1
            } else {
                other.y1
            },
        }
    }

    fn as_i32_xywh(self) -> Vec<i32> {
        vec![
            i32::try_from(self.x0).expect("bounded canvas x fits i32"),
            i32::try_from(self.y0).expect("bounded canvas y fits i32"),
            i32::try_from(self.x1 - self.x0).expect("bounded width fits i32"),
            i32::try_from(self.y1 - self.y0).expect("bounded height fits i32"),
        ]
    }
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), JsError> {
    if width == 0 || height == 0 {
        return Err(js_error("canvas dimensions must be non-zero"));
    }
    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(js_error("canvas dimensions exceed the 16384 px limit"));
    }
    if u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err(js_error("canvas exceeds the 64 megapixel safety limit"));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn validate_sample(
    x: f32,
    y: f32,
    pressure: f32,
    tilt_x: f32,
    tilt_y: f32,
    time_ms: f64,
    width: u32,
    height: u32,
) -> Result<(), JsError> {
    if !x.is_finite()
        || !y.is_finite()
        || !pressure.is_finite()
        || !tilt_x.is_finite()
        || !tilt_y.is_finite()
        || !time_ms.is_finite()
    {
        return Err(js_error("sample values must be finite"));
    }
    let max_x = width as f32 + SAMPLE_OVERSCAN;
    let max_y = height as f32 + SAMPLE_OVERSCAN;
    if !(-SAMPLE_OVERSCAN..=max_x).contains(&x)
        || !(-SAMPLE_OVERSCAN..=max_y).contains(&y)
    {
        return Err(js_error("sample coordinates exceed the canvas safety margin"));
    }
    Ok(())
}

fn render_rect(surface: &MemSurface, canvas_width: u32, bounds: Bounds) -> Vec<u8> {
    let out_width = bounds.x1 - bounds.x0;
    let out_height = bounds.y1 - bounds.y0;
    let output_len = u64::from(out_width) * u64::from(out_height) * 4;
    let mut output = vec![
        0_u8;
        usize::try_from(output_len)
            .expect("validated canvas buffer length fits usize")
    ];
    let tile_size = u32::try_from(TILE_SIZE).expect("tile size fits u32");
    let first_tile_x = bounds.x0 / tile_size;
    let first_tile_y = bounds.y0 / tile_size;
    let last_tile_x = (bounds.x1 - 1) / tile_size;
    let last_tile_y = (bounds.y1 - 1) / tile_size;

    for tile_y in first_tile_y..=last_tile_y {
        for tile_x in first_tile_x..=last_tile_x {
            let Some(tile) = surface.tile(
                i32::try_from(tile_x).expect("bounded tile x fits i32"),
                i32::try_from(tile_y).expect("bounded tile y fits i32"),
            ) else {
                continue;
            };
            let tile_origin_x = tile_x * tile_size;
            let tile_origin_y = tile_y * tile_size;
            let copy_x0 = bounds.x0.max(tile_origin_x);
            let copy_y0 = bounds.y0.max(tile_origin_y);
            let copy_x1 = bounds.x1.min(tile_origin_x + tile_size);
            let copy_y1 = bounds.y1.min(tile_origin_y + tile_size);

            for canvas_y in copy_y0..copy_y1 {
                for canvas_x in copy_x0..copy_x1 {
                    let local_x = usize::try_from(canvas_x - tile_origin_x)
                        .expect("local x fits usize");
                    let local_y = usize::try_from(canvas_y - tile_origin_y)
                        .expect("local y fits usize");
                    let output_x = canvas_x - bounds.x0;
                    let output_y = canvas_y - bounds.y0;
                    let output_index =
                        usize::try_from((u64::from(output_y) * u64::from(out_width)
                            + u64::from(output_x))
                            * 4)
                        .expect("validated output index fits usize");
                    output[output_index..output_index + 4]
                        .copy_from_slice(&transparent_rgba8(tile[local_y][local_x]));
                }
            }
        }
    }

    // Keep this argument explicit so callers cannot accidentally pass a
    // rectangle from a differently sized canvas.
    debug_assert!(bounds.x1 <= canvas_width);
    output
}

fn transparent_rgba8(pixel: [u16; 4]) -> [u8; 4] {
    let alpha = fix15::to_f32(pixel[3]).clamp(0.0, 1.0);
    if alpha <= 0.0 {
        return [0, 0, 0, 0];
    }
    let channel = |value: u16| {
        let straight_linear = (fix15::to_f32(value) / alpha).clamp(0.0, 1.0);
        (linear_to_srgb(straight_linear).clamp(0.0, 1.0) * 255.0).round() as u8
    };
    [
        channel(pixel[0]),
        channel(pixel[1]),
        channel(pixel[2]),
        (alpha * 255.0).round() as u8,
    ]
}

fn js_error(message: &str) -> JsError {
    JsError::new(message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use hokusai_core::fix15::FIX15_MAX_U16;

    #[test]
    fn transparent_conversion_preserves_alpha_without_white_flattening() {
        assert_eq!(transparent_rgba8([0, 0, 0, 0]), [0, 0, 0, 0]);
        let half = FIX15_MAX_U16 / 2;
        let rgba = transparent_rgba8([half, 0, 0, half]);
        assert_eq!(rgba[0], 255);
        assert_eq!(rgba[1], 0);
        assert_eq!(rgba[2], 0);
        assert!((127..=128).contains(&rgba[3]));
    }

    #[test]
    fn public_radius_log2_round_trips_through_hokusai_natural_log_storage() {
        let mut brush = HokusaiBrush::natural_media();
        brush.set_radius_log(6.0).expect("finite log2 radius");
        assert!((brush.radius_log() - 6.0).abs() < f32::EPSILON);
        assert!(
            (brush.inner.get(BrushSetting::Radius).base_value - 64.0_f32.ln()).abs()
                < f32::EPSILON
        );
    }

    #[test]
    fn tile_bounds_clip_negative_and_edge_tiles() {
        assert_eq!(
            Bounds::from_tile(-1, 0, 100, 100),
            None,
            "fully off-canvas tile should be ignored"
        );
        assert_eq!(
            Bounds::from_tile(1, 1, 100, 100),
            Some(Bounds {
                x0: 64,
                y0: 64,
                x1: 100,
                y1: 100,
            })
        );
    }
}

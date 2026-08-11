import type {
  StudioHokusaiNaturalMediaPresetId,
} from "./studio-hokusai-natural-media-contract";

interface StudioHokusaiPresetSetting {
  readonly base_value: number;
  readonly inputs: Readonly<
    Record<string, readonly (readonly [number, number])[]>
  >;
}

function setting(
  baseValue: number,
  inputs: Readonly<Record<string, readonly (readonly [number, number])[]>> = {},
): StudioHokusaiPresetSetting {
  return { base_value: baseValue, inputs };
}

export function studioHokusaiNaturalMediaPresetSettings(
  presetId: StudioHokusaiNaturalMediaPresetId,
): Readonly<Record<string, StudioHokusaiPresetSetting>> {
  switch (presetId) {
    case "pencil":
      return {
        anti_aliasing: setting(1),
        // Small Studio pencil sizes used to collapse below one device pixel:
        // the pressure radius curve reduced the requested radius a second time,
        // then sparse antialiased dabs left an occasional transparent centre.
        // Keep enough overlap for a continuous graphite core while preserving
        // pressure taper at both ends of a stylus stroke.
        dabs_per_actual_radius: setting(9.5),
        dabs_per_basic_radius: setting(0.75),
        dabs_per_second: setting(55),
        direction_filter: setting(0.3),
        hardness: setting(0.78),
        opaque: setting(0.96, {
          pressure: [[0, -0.28], [0.2, -0.12], [0.45, 0], [1, 0.08]],
        }),
        opaque_linearize: setting(0.95),
        opaque_multiply: setting(0, {
          pressure: [[0, 0], [0.02, 0], [0.08, 0.92], [0.3, 1], [1, 1]],
        }),
        radius_by_random: setting(0.015),
        radius_logarithmic: setting(1, {
          pressure: [
            [0, -0.82],
            [0.15, -0.48],
            [0.35, -0.22],
            [0.55, -0.04],
            [0.8, 0.12],
            [1, 0.24],
          ],
        }),
        slow_tracking: setting(1.2),
        slow_tracking_per_dab: setting(0.5),
        tracking_noise: setting(0.012),
      };
    case "charcoal":
      return {
        anti_aliasing: setting(0.8),
        dabs_per_actual_radius: setting(15),
        dabs_per_basic_radius: setting(0.55),
        elliptical_dab_ratio: setting(1.2),
        hardness: setting(0.72, {
          pressure: [[0, -0.06], [1, 0.1]],
        }),
        offset_by_random: setting(0.12, {
          pressure: [[0, 0.04], [1, -0.06]],
        }),
        opaque: setting(0.84, {
          pressure: [[0, -0.2], [0.55, 0], [1, 0.14]],
        }),
        opaque_linearize: setting(0.94),
        opaque_multiply: setting(0, {
          pressure: [[0, 0], [0.02, 0.55], [0.12, 1], [1, 1]],
        }),
        radius_by_random: setting(0.02),
        radius_logarithmic: setting(0.8, {
          pressure: [[0, -0.28], [0.55, 0.02], [1, 0.38]],
        }),
        slow_tracking: setting(1),
        tracking_noise: setting(0.012),
      };
    case "oil":
      return {
        anti_aliasing: setting(1),
        dabs_per_actual_radius: setting(11.5),
        dabs_per_basic_radius: setting(0.85),
        direction_filter: setting(0.38),
        elliptical_dab_angle: setting(0, {
          direction: [[0, 0], [180, 180]],
        }),
        elliptical_dab_ratio: setting(1.78, {
          pressure: [[0, -0.28], [0.45, -0.04], [1, 0.18]],
        }),
        hardness: setting(0.9, {
          pressure: [[0, -0.1], [1, 0.08]],
        }),
        opaque: setting(0.96, {
          pressure: [[0, -0.22], [0.4, -0.04], [1, 0.08]],
        }),
        opaque_linearize: setting(0.98),
        opaque_multiply: setting(0, {
          pressure: [[0, 0], [0.05, 0.18], [0.2, 0.72], [1, 1]],
        }),
        // Hokusai/libmypaint's canonical spectral-pigment switch is
        // `paint_mode`; the unknown `paint` key silently disables it.
        paint_mode: setting(0.88),
        radius_logarithmic: setting(1.45, {
          pressure: [[0, -0.32], [0.35, -0.02], [0.65, 0.28], [1, 0.78]],
        }),
        slow_tracking: setting(0.78),
        slow_tracking_per_dab: setting(0.28),
        // The selected-stroke transform starts on a transparent surface.
        // Spectral paint is retained, while opacity-destructive smudge
        // feedback is disabled so retracing can only add coverage.
        smudge: setting(0),
        smudge_length: setting(0.9),
        smudge_length_log: setting(0.3),
      };
    case "calligraphy":
      return {
        anti_aliasing: setting(1),
        dabs_per_actual_radius: setting(3.4),
        elliptical_dab_angle: setting(43, {
          direction: [[0, -4], [180, 4]],
        }),
        elliptical_dab_ratio: setting(4.8, {
          pressure: [[0, 1.4], [1, -1.2]],
        }),
        hardness: setting(0.78),
        opaque: setting(1),
        opaque_multiply: setting(0, {
          pressure: [[0, 0], [0.02, 0.8], [0.08, 1], [1, 1]],
        }),
        radius_logarithmic: setting(1.8, {
          pressure: [[0, -0.3], [1, 0.6]],
          speed1: [[0, 0], [1, -0.15]],
        }),
        slow_tracking: setting(0.65),
        slow_tracking_per_dab: setting(0.7),
      };
    case "marker":
      return {
        anti_aliasing: setting(0.9),
        dabs_per_actual_radius: setting(3),
        dabs_per_basic_radius: setting(1),
        elliptical_dab_angle: setting(108, {
          tilt_ascension: [[-180, -180], [180, 180]],
        }),
        elliptical_dab_ratio: setting(7.5, {
          tilt_declination: [[0, 0], [68, -6.5], [90, -6.5]],
        }),
        hardness: setting(0.96),
        opaque: setting(0.92, {
          pressure: [[0, -0.24], [0.25, -0.1], [0.65, 0.02], [1, 0.08]],
        }),
        opaque_linearize: setting(0.78),
        opaque_multiply: setting(0, {
          pressure: [[0, 0], [0.04, 0.75], [0.1, 1], [1, 1]],
        }),
        radius_logarithmic: setting(2.1, {
          pressure: [[0, -0.22], [0.45, -0.04], [1, 0.18]],
          tilt_declination: [[20, 0], [50, 0], [80, -0.8]],
        }),
        slow_tracking: setting(1.4),
      };
  }
}

export function studioHokusaiNaturalMediaPresetJson(
  presetId: StudioHokusaiNaturalMediaPresetId,
): string {
  return JSON.stringify({
    version: 3,
    group: "ToonSpectrum natural media",
    parent_brush_name: "",
    comment:
      `ToonSpectrum ${presetId} preset for Hokusai 0.3.0 · deterministic texture v2`,
    settings: studioHokusaiNaturalMediaPresetSettings(presetId),
  });
}

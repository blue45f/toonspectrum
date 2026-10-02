/**
 * 셰이딩 프로파일(zod 4). PBR/툰 모드, 그림자, 후처리, IBL, 툰 옵션.
 * taa·ssao는 베타(기본 false).
 */
import { z } from "zod";

export const SHADING_MODES = ["pbr", "toon"] as const;
export type ShadingMode = (typeof SHADING_MODES)[number];

export const TONE_MAPPINGS = ["khr-pbr-neutral", "aces", "none"] as const;
export type ToneMapping = (typeof TONE_MAPPINGS)[number];

export const shadingProfileSchema = z
  .object({
    mode: z.enum(SHADING_MODES),
    toneMapping: z.enum(TONE_MAPPINGS),
    shadows: z
      .object({
        enabled: z.boolean(),
        cascades: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
        pcf: z.boolean(),
        contactHardening: z.boolean(),
      })
      .strict(),
    postfx: z
      .object({
        fxaa: z.boolean(),
        /** 베타 */
        taa: z.boolean(),
        bloom: z.boolean(),
        /** 베타 */
        ssao: z.boolean(),
        sharpen: z.boolean(),
      })
      .strict(),
    ibl: z
      .object({
        enabled: z.boolean(),
        intensity: z.number().min(0).max(4),
      })
      .strict(),
    toon: z
      .object({
        rampSteps: z.union([z.literal(2), z.literal(3), z.literal(4)]),
        faceSdfShadow: z.boolean(),
        outline: z.enum(["none", "hull", "edge"]),
        rim: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type ShadingProfile = z.infer<typeof shadingProfileSchema>;

export const DEFAULT_SHADING: ShadingProfile = Object.freeze({
  mode: "pbr",
  toneMapping: "khr-pbr-neutral",
  shadows: { enabled: true, cascades: 2, pcf: true, contactHardening: false },
  postfx: { fxaa: true, taa: false, bloom: false, ssao: false, sharpen: false },
  ibl: { enabled: true, intensity: 1 },
  toon: { rampSteps: 3, faceSdfShadow: true, outline: "hull", rim: true },
}) as ShadingProfile;

export type QualityPresetId = "preview" | "standard" | "hero";

export const QUALITY_PRESET_LABELS_KO: Readonly<Record<QualityPresetId, string>> = {
  preview: "미리보기",
  standard: "표준",
  hero: "히어로",
};

/** 품질 프리셋. mode·toon 옵션은 유지하고 그림자·후처리·IBL만 바꾸는 용도로 `applyQualityPreset`을 쓴다. */
export const QUALITY_PRESETS: Readonly<Record<QualityPresetId, ShadingProfile>> = {
  preview: {
    ...DEFAULT_SHADING,
    shadows: { enabled: true, cascades: 1, pcf: false, contactHardening: false },
    postfx: { fxaa: false, taa: false, bloom: false, ssao: false, sharpen: false },
    ibl: { enabled: true, intensity: 1 },
  },
  standard: DEFAULT_SHADING,
  hero: {
    ...DEFAULT_SHADING,
    shadows: { enabled: true, cascades: 4, pcf: true, contactHardening: true },
    postfx: { fxaa: true, taa: false, bloom: true, ssao: false, sharpen: true },
    ibl: { enabled: true, intensity: 1.2 },
  },
};

/** 프로파일의 mode·toon·toneMapping은 유지하고 품질 프리셋의 shadows·postfx·ibl만 덮어쓴다. */
export function applyQualityPreset(profile: ShadingProfile, preset: QualityPresetId): ShadingProfile {
  const source = QUALITY_PRESETS[preset];
  return { ...profile, shadows: source.shadows, postfx: source.postfx, ibl: source.ibl };
}

/** 부분 프로파일을 깊이 1단계로 병합한다(shading/set 명령용). */
export function mergeShadingProfile(base: ShadingProfile, patch: Partial<ShadingProfile>): ShadingProfile {
  return {
    mode: patch.mode ?? base.mode,
    toneMapping: patch.toneMapping ?? base.toneMapping,
    shadows: { ...base.shadows, ...patch.shadows },
    postfx: { ...base.postfx, ...patch.postfx },
    ibl: { ...base.ibl, ...patch.ibl },
    toon: { ...base.toon, ...patch.toon },
  };
}

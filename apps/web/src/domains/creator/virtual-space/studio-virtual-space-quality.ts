import type { StudioVirtualQualityPreset } from "./studio-virtual-space-experience-preference";

export type StudioVirtualQualityTier = Exclude<StudioVirtualQualityPreset, "auto">;

export interface StudioVirtualQualityEnvironment {
  readonly viewportWidth: number;
  readonly reducedMotion: boolean;
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
}

export interface StudioVirtualQualityProfile {
  readonly tier: StudioVirtualQualityTier;
  readonly dprCap: number;
  readonly particleRatio: number;
  readonly maxActiveNpcs: number;
  readonly maxAnimatedDecorations: number;
  readonly interestRadius: number;
  readonly targetFps: number;
  readonly dynamicLights: boolean;
  readonly weather: boolean;
  readonly ambientActors: boolean;
}

const PROFILES: Readonly<Record<StudioVirtualQualityTier, StudioVirtualQualityProfile>> = Object.freeze({
  ultra: Object.freeze({ tier: "ultra", dprCap: 2, particleRatio: 1, maxActiveNpcs: 10, maxAnimatedDecorations: 36, interestRadius: 760, targetFps: 60, dynamicLights: true, weather: true, ambientActors: true }),
  high: Object.freeze({ tier: "high", dprCap: 1.75, particleRatio: .82, maxActiveNpcs: 8, maxAnimatedDecorations: 28, interestRadius: 650, targetFps: 55, dynamicLights: true, weather: true, ambientActors: true }),
  balanced: Object.freeze({ tier: "balanced", dprCap: 1.5, particleRatio: .58, maxActiveNpcs: 6, maxAnimatedDecorations: 20, interestRadius: 520, targetFps: 45, dynamicLights: true, weather: true, ambientActors: true }),
  battery: Object.freeze({ tier: "battery", dprCap: 1.15, particleRatio: .24, maxActiveNpcs: 4, maxAnimatedDecorations: 10, interestRadius: 390, targetFps: 30, dynamicLights: false, weather: false, ambientActors: false }),
  accessibility: Object.freeze({ tier: "accessibility", dprCap: 1, particleRatio: 0, maxActiveNpcs: 2, maxAnimatedDecorations: 0, interestRadius: 340, targetFps: 30, dynamicLights: false, weather: false, ambientActors: false }),
});

export function studioVirtualAutomaticQualityTier(environment: StudioVirtualQualityEnvironment): StudioVirtualQualityTier {
  if (environment.reducedMotion) return "accessibility";
  const mobile = environment.viewportWidth < 720;
  const memory = environment.deviceMemory ?? 8;
  const cores = environment.hardwareConcurrency ?? 8;
  if (memory <= 3 || cores <= 4) return "battery";
  if (mobile || memory <= 5 || cores <= 6) return "balanced";
  if (memory >= 12 && cores >= 10 && environment.viewportWidth >= 1200) return "ultra";
  return "high";
}

export function studioVirtualQualityProfile(
  preset: StudioVirtualQualityPreset,
  environment: StudioVirtualQualityEnvironment,
): StudioVirtualQualityProfile {
  return PROFILES[preset === "auto" ? studioVirtualAutomaticQualityTier(environment) : preset];
}

const ORDER: readonly StudioVirtualQualityTier[] = ["accessibility", "battery", "balanced", "high", "ultra"];

export interface StudioVirtualQualitySample {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly tier: StudioVirtualQualityTier;
  readonly changed: boolean;
}

/** Hysteresis prevents a single slow frame from visibly toggling quality. */
export class StudioVirtualAdaptiveQualityController {
  private tier: StudioVirtualQualityTier;
  private elapsedLow = 0;
  private elapsedHigh = 0;
  private smoothedFrameMs = 16.67;

  constructor(initial: StudioVirtualQualityTier) {
    this.tier = initial;
  }

  reset(tier: StudioVirtualQualityTier): void {
    this.tier = tier;
    this.elapsedLow = 0;
    this.elapsedHigh = 0;
  }

  sample(deltaMs: number, automatic: boolean): StudioVirtualQualitySample {
    const bounded = Number.isFinite(deltaMs) ? Math.max(1, Math.min(250, deltaMs)) : 16.67;
    this.smoothedFrameMs += (bounded - this.smoothedFrameMs) * .08;
    const fps = 1_000 / this.smoothedFrameMs;
    let changed = false;
    if (automatic) {
      const profile = PROFILES[this.tier];
      if (fps < profile.targetFps - 8) {
        this.elapsedLow += bounded;
        this.elapsedHigh = 0;
      } else if (fps > profile.targetFps + 5) {
        this.elapsedHigh += bounded;
        this.elapsedLow = 0;
      } else {
        this.elapsedLow = Math.max(0, this.elapsedLow - bounded * .5);
        this.elapsedHigh = Math.max(0, this.elapsedHigh - bounded * .25);
      }
      const index = ORDER.indexOf(this.tier);
      if (this.elapsedLow >= 3_000 && index > 0) {
        this.tier = ORDER[index - 1]!;
        this.elapsedLow = 0;
        changed = true;
      } else if (this.elapsedHigh >= 10_000 && index < ORDER.length - 1) {
        this.tier = ORDER[index + 1]!;
        this.elapsedHigh = 0;
        changed = true;
      }
    }
    return Object.freeze({ fps, frameTimeMs: this.smoothedFrameMs, tier: this.tier, changed });
  }
}

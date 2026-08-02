export type ToonPassType =
  | "beauty"
  | "line-art"
  | "shadow-ao"
  | "depth"
  | "object-id";

export interface ToonPassConfig {
  passType: ToonPassType;
  enabled: boolean;
  resolutionMultiplier: number; // 1 = 1x, 2 = 2x supersampling
  bitDepth: 8 | 16 | 32;
  channelName: string;
}

export interface Studio3DToonPipelineProfile {
  id: string;
  name: string;
  passes: Record<ToonPassType, ToonPassConfig>;
  outlineThickness: number;
  creaseAngleThreshold: number;
  shadowBands: number; // 카툰 섀도우 단수 (예: 2 = 2단 툰 섀딩)
  depthFogEnabled: boolean;
}

export function createDefaultToonPipelineProfile(id = "toon-standard", name = "웹툰 표준 카툰 렌더 프로필"): Studio3DToonPipelineProfile {
  return {
    id,
    name,
    outlineThickness: 1.5,
    creaseAngleThreshold: 35,
    shadowBands: 2,
    depthFogEnabled: true,
    passes: {
      beauty: {
        passType: "beauty",
        enabled: true,
        resolutionMultiplier: 2,
        bitDepth: 8,
        channelName: "RGB Color",
      },
      "line-art": {
        passType: "line-art",
        enabled: true,
        resolutionMultiplier: 2,
        bitDepth: 8,
        channelName: "Line Ink Layer",
      },
      "shadow-ao": {
        passType: "shadow-ao",
        enabled: true,
        resolutionMultiplier: 1,
        bitDepth: 8,
        channelName: "Toon Shadow & AO",
      },
      depth: {
        passType: "depth",
        enabled: true,
        resolutionMultiplier: 1,
        bitDepth: 16,
        channelName: "Linear Depth Map",
      },
      "object-id": {
        passType: "object-id",
        enabled: true,
        resolutionMultiplier: 1,
        bitDepth: 8,
        channelName: "Object Mask ID",
      },
    },
  };
}

export class Studio3DToonPassPipeline {
  private profile: Studio3DToonPipelineProfile;

  constructor(profile = createDefaultToonPipelineProfile()) {
    this.profile = profile;
  }

  public getProfile(): Studio3DToonPipelineProfile {
    return this.profile;
  }

  public setOutlineThickness(thickness: number): void {
    this.profile.outlineThickness = Math.max(0.1, Math.min(10, thickness));
  }

  public setShadowBands(bands: number): void {
    this.profile.shadowBands = Math.max(1, Math.min(5, Math.round(bands)));
  }

  public togglePass(passType: ToonPassType, enabled?: boolean): void {
    if (this.profile.passes[passType]) {
      this.profile.passes[passType].enabled = enabled ?? !this.profile.passes[passType].enabled;
    }
  }

  public getActivePassTypes(): ToonPassType[] {
    return (Object.keys(this.profile.passes) as ToonPassType[]).filter(
      (key) => this.profile.passes[key].enabled,
    );
  }

  public generatePsdLayerManifest(): Array<{ name: string; type: ToonPassType; bitDepth: number }> {
    return this.getActivePassTypes().map((passType) => ({
      name: this.profile.passes[passType].channelName,
      type: passType,
      bitDepth: this.profile.passes[passType].bitDepth,
    }));
  }
}

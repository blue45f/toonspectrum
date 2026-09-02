/**
 * studio-3d-webtoon-multipass-exporter.ts
 *
 * Acon3D (ABLER) & Clip Studio Paint-inspired Webtoon Multi-Pass Layer Auto-Split Engine.
 * Automatically decomposes a 3D scene render into isolated, professional 2D layers:
 * Line Art, Flat Color (Albedo), Shadow & AO, Highlights, Z-Depth, and Object ID Masks.
 */

export type WebtoonRenderPassKind =
  | "line-art"
  | "flat-color"
  | "shadow-ambient"
  | "specular-highlight"
  | "depth-map"
  | "normal-map"
  | "object-id-mask";

export interface RenderPassSpec {
  readonly kind: WebtoonRenderPassKind;
  readonly layerName: string;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly opacity: number; // 0.0 to 1.0
  readonly description: string;
  readonly defaultEnabled: boolean;
}

export interface MultiPassExportConfig {
  readonly resolutionWidth: number;
  readonly resolutionHeight: number;
  readonly transparentBackground: boolean;
  readonly includeLineArt: boolean;
  readonly includeFlatColor: boolean;
  readonly includeShadow: boolean;
  readonly includeHighlight: boolean;
  readonly includeDepthMap: boolean;
  readonly includeObjectIdMask: boolean;
  readonly format: "png-zip" | "psd" | "clip-studio-layers";
}

export const WEBTOON_RENDER_PASSES: readonly RenderPassSpec[] = [
  {
    kind: "line-art",
    layerName: "01_선화 (Line Art)",
    blendMode: "normal",
    opacity: 1.0,
    description: "선명한 외곽선 및 형태 엣지만 추출된 투명 배경 선화 레이어",
    defaultEnabled: true,
  },
  {
    kind: "flat-color",
    layerName: "02_밑색 (Flat Color)",
    blendMode: "normal",
    opacity: 1.0,
    description: "조명과 그림자가 배제된 순수 원색(Albedo) 베이스 컬러 레이어",
    defaultEnabled: true,
  },
  {
    kind: "shadow-ambient",
    layerName: "03_그림자 & 음영 (Shadow & AO)",
    blendMode: "multiply",
    opacity: 0.85,
    description: "곱하기(Multiply) 모드로 밑색 위에 얹어지는 방향성 그림자 및 음영 레이어",
    defaultEnabled: true,
  },
  {
    kind: "specular-highlight",
    layerName: "04_하이라이트 (Highlight)",
    blendMode: "screen",
    opacity: 0.9,
    description: "스크린(Screen) 모드로 빛나는 금속 반사 및 안광 하이라이트 레이어",
    defaultEnabled: true,
  },
  {
    kind: "depth-map",
    layerName: "05_원근 깊이 (Z-Depth)",
    blendMode: "normal",
    opacity: 1.0,
    description: "안개, 대기원근법, 카메라 포커스 블러를 합성할 수 있는 거리 흑백 맵",
    defaultEnabled: false,
  },
  {
    kind: "normal-map",
    layerName: "06_법선 벡터 (Normal Map)",
    blendMode: "normal",
    opacity: 1.0,
    description: "후반 리라이팅 및 텍스처 합성을 위한 표면 방향 RGB 맵",
    defaultEnabled: false,
  },
  {
    kind: "object-id-mask",
    layerName: "07_영역 마스크 (Object ID Mask)",
    blendMode: "normal",
    opacity: 1.0,
    description: "캐릭터/소품/배경을 자동 선택(마술봉)할 수 있는 고유 색상 마스크 레이어",
    defaultEnabled: true,
  },
];

export interface PlannedMultiPassExport {
  readonly totalPasses: number;
  readonly activePasses: readonly RenderPassSpec[];
  readonly estimatedFileSizeMb: number;
  readonly exportResolution: readonly [number, number];
}

/**
 * Plans the multi-pass export queue based on user configuration
 */
export function planMultiPassExport(config: MultiPassExportConfig): PlannedMultiPassExport {
  const activePasses = WEBTOON_RENDER_PASSES.filter((pass) => {
    switch (pass.kind) {
      case "line-art":
        return config.includeLineArt;
      case "flat-color":
        return config.includeFlatColor;
      case "shadow-ambient":
        return config.includeShadow;
      case "specular-highlight":
        return config.includeHighlight;
      case "depth-map":
        return config.includeDepthMap;
      case "object-id-mask":
        return config.includeObjectIdMask;
      default:
        return false;
    }
  });

  // Approx. 4 bytes per pixel per pass in RGBA PNG uncompressed estimation
  const bytesPerFrame = config.resolutionWidth * config.resolutionHeight * 4;
  const estimatedMb = (bytesPerFrame * activePasses.length * 0.3) / (1024 * 1024);

  return {
    totalPasses: activePasses.length,
    activePasses,
    estimatedFileSizeMb: Math.max(0.1, Number(estimatedMb.toFixed(2))),
    exportResolution: [config.resolutionWidth, config.resolutionHeight],
  };
}

export type SpectacleBackdropVariant = "aurora" | "beams" | "grid" | "noise";

/** 배경 변형 → 레이어 클래스. */
export function backdropLayerClass(variant: SpectacleBackdropVariant): string {
  switch (variant) {
    case "aurora":
      return "spectacle-backdrop-aurora";
    case "beams":
      return "spectacle-backdrop-beams";
    case "grid":
      return "spectacle-backdrop-grid";
    case "noise":
      return "spectacle-backdrop-noise";
  }
}

/**
 * Studio Filter Split-Preview Comparison Engine
 *
 * 필터 적용 전후(Original vs Filtered)를 비교하기 위한 Split Slider,
 * Side-by-Side, Toggle Original 상태 및 렌더링 파라미터 관리 엔진입니다.
 */

export type ComparisonMode = "split-slider" | "side-by-side" | "toggle-original";

export interface ComparisonConfig {
  mode: ComparisonMode;
  splitPosition: number; // 0.0 (완전 필터) ~ 1.0 (완전 원본), 기본 0.5 (50% 위치)
  showOriginalOnHold: boolean; // hold 중일 때 원본 임시 보기
  activeHolding: boolean;
  zoomLevel: number;
}

export class StudioFilterSplitPreview {
  private config: ComparisonConfig;

  constructor(initialMode: ComparisonMode = "split-slider") {
    this.config = {
      mode: initialMode,
      splitPosition: 0.5,
      showOriginalOnHold: true,
      activeHolding: false,
      zoomLevel: 1.0,
    };
  }

  public getConfig(): Readonly<ComparisonConfig> {
    return this.config;
  }

  public setMode(mode: ComparisonMode): void {
    this.config.mode = mode;
  }

  public setSplitPosition(position: number): void {
    this.config.splitPosition = Math.max(0, Math.min(1, position));
  }

  public setHoldState(holding: boolean): void {
    this.config.activeHolding = holding;
  }

  public setZoomLevel(zoom: number): void {
    this.config.zoomLevel = Math.max(0.1, Math.min(10, zoom));
  }

  /**
   * 주어진 픽셀 좌표가 원본 렌더링 영역에 속하는지 계산합니다 (Split Slider 모드용).
   * @param normalizedX 0~1 사이의 캔버스 상대 X 좌표
   */
  public isOriginalArea(normalizedX: number): boolean {
    if (this.config.activeHolding && this.config.showOriginalOnHold) {
      return true;
    }

    switch (this.config.mode) {
      case "toggle-original":
        return this.config.activeHolding;
      case "side-by-side":
        return normalizedX < 0.5;
      case "split-slider":
      default:
        return normalizedX < this.config.splitPosition;
    }
  }

  /**
   * Split 가이드 라인 위치(픽셀)를 반환합니다.
   */
  public getSplitGuidePixelX(viewportWidth: number): number {
    return Math.round(this.config.splitPosition * viewportWidth);
  }
}

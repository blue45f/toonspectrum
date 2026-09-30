/**
 * Studio 3D Vertical Webtoon Storyboard Cut Strip & Multi-Pass PSD Exporter
 *
 * Implements:
 * - Vertical Webtoon Strip Cut manager (reordering, framing, camera snapshots, dialog lines)
 * - Multi-Pass PSD Layer separation manifest (Line Art, Base Color, Cel Shadow, AO, Rim, FX, Speech, BG)
 * - Aspect ratio framing presets (21:9 Wide Action, 1:1 Medium, 9:16 Vertical Close-Up, 16:9 Cinematic)
 */

export type CutAspectRatio = "21:9-wide-action" | "1:1-square-medium" | "9:16-vertical-climax" | "16:9-cinematic";

export interface CutAspectRatioUi {
  readonly labelKo: string;
  readonly labelEn: string;
  /** 한 줄 설명(10초 이해용). */
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 호버 툴팁. */
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 컷 화면비 UI 메타데이터(ko/en, 한줄설명+툴팁). */
export const CUT_ASPECT_RATIO_UI: Readonly<Record<CutAspectRatio, CutAspectRatioUi>> =
  Object.freeze({
    "21:9-wide-action": Object.freeze({
      labelKo: "21:9 와이드 액션",
      labelEn: "21:9 Wide action",
      descriptionKo: "가로로 긴 파노라마. 전투·추격의 박력.",
      descriptionEn: "Long panorama. Action and chase impact.",
      tooltipKo: "21:9 와이드 — 가로로 긴 액션 컷. 전투·추격·전경 제시용.",
      tooltipEn: "21:9 wide — long action cut. Battles, chases, vistas.",
    }),
    "1:1-square-medium": Object.freeze({
      labelKo: "1:1 정사각 미디엄",
      labelEn: "1:1 Square medium",
      descriptionKo: "인물 반신을 담는 표준 대화 컷.",
      descriptionEn: "Standard medium shot for dialogue.",
      tooltipKo: "1:1 미디엄 — 인물 반신을 담는 표준 대화·일상 컷.",
      tooltipEn: "1:1 medium — standard waist-up dialogue shot.",
    }),
    "9:16-vertical-climax": Object.freeze({
      labelKo: "9:16 세로 클라이맥스",
      labelEn: "9:16 Vertical climax",
      descriptionKo: "세로로 긴 클로즈업. 감정의 절정.",
      descriptionEn: "Tall close-up. Emotional climax.",
      tooltipKo: "9:16 세로 — 클로즈업·감정 절정용. 웹툰 스크롤에 최적.",
      tooltipEn: "9:16 vertical — close-ups and climaxes. Built for webtoon scroll.",
    }),
    "16:9-cinematic": Object.freeze({
      labelKo: "16:9 시네마틱",
      labelEn: "16:9 Cinematic",
      descriptionKo: "영화 같은 와이드. 장면 전환·회상용.",
      descriptionEn: "Cinematic wide. Scene changes and flashbacks.",
      tooltipKo: "16:9 시네마틱 — 영화 같은 화면비. 장면 전환·회상용.",
      tooltipEn: "16:9 cinematic — filmic framing for transitions.",
    }),
  });

/** 컷 화면비 ID로 UI 메타데이터를 찾습니다. 없으면 undefined를 돌립니다. */
export function getCutAspectRatioUi(aspect: CutAspectRatio): CutAspectRatioUi | undefined {
  return CUT_ASPECT_RATIO_UI[aspect];
}

export interface StoryboardCut {
  readonly id: string;
  readonly cutNumber: number;
  readonly title: string;
  readonly aspectRatio: CutAspectRatio;
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly cameraFovDeg: number;
  readonly cameraRollDeg: number;
  readonly characterIds: readonly string[];
  readonly dialogueLine?: string;
  readonly sfxSoundName?: string;
  readonly durationSeconds?: number;
}

export interface PsdLayerChannel {
  readonly name: string;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay" | "color-dodge";
  readonly opacity: number;
  readonly isVisible: boolean;
}

export interface PsdMultiPassExportManifest {
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly cuts: readonly StoryboardCut[];
  readonly channels: readonly PsdLayerChannel[];
  readonly colorSpace: "sRGB" | "Display-P3";
}

export class Studio3DStoryboardCutStrip {
  private cuts: StoryboardCut[] = [];
  private documentWidth = 800; // Standard Webtoon width 800px or 1600px

  constructor(initialCuts?: readonly StoryboardCut[]) {
    if (initialCuts) {
      this.cuts = [...initialCuts];
    }
  }

  public getCuts(): readonly StoryboardCut[] {
    return this.cuts;
  }

  public getDocumentWidth(): number {
    return this.documentWidth;
  }

  public setDocumentWidth(width: number): void {
    this.documentWidth = Math.max(300, width);
  }

  public addCut(cut: StoryboardCut): void {
    this.cuts.push(cut);
    this.reindexCuts();
  }

  public removeCut(id: string): void {
    this.cuts = this.cuts.filter((c) => c.id !== id);
    this.reindexCuts();
  }

  public moveCut(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.cuts.length ||
      toIndex < 0 ||
      toIndex >= this.cuts.length
    ) {
      return;
    }
    const [cut] = this.cuts.splice(fromIndex, 1);
    if (cut) {
      this.cuts.splice(toIndex, 0, cut);
      this.reindexCuts();
    }
  }

  private reindexCuts(): void {
    this.cuts = this.cuts.map((cut, idx) => ({
      ...cut,
      cutNumber: idx + 1,
    }));
  }

  /**
   * Calculates pixel dimensions for a given cut aspect ratio.
   */
  public evaluateCutPixelDimensions(aspectRatio: CutAspectRatio): { readonly width: number; readonly height: number } {
    const w = this.documentWidth;
    switch (aspectRatio) {
      case "21:9-wide-action":
        return { width: w, height: Math.round((w * 9) / 21) };
      case "1:1-square-medium":
        return { width: w, height: w };
      case "9:16-vertical-climax":
        return { width: w, height: Math.round((w * 16) / 9) };
      case "16:9-cinematic":
        return { width: w, height: Math.round((w * 9) / 16) };
    }
  }

  /**
   * Generates the total cumulative height of the full vertical webtoon strip.
   */
  public evaluateTotalStripHeight(interCutSpacingPx = 80): number {
    if (this.cuts.length === 0) return 0;
    const heightsSum = this.cuts.reduce(
      (sum, cut) => sum + this.evaluateCutPixelDimensions(cut.aspectRatio).height,
      0,
    );
    const spacingSum = (this.cuts.length - 1) * interCutSpacingPx;
    return heightsSum + spacingSum;
  }

  /**
   * Generates standard multi-pass PSD layers manifest for professional finishing in Photoshop / Clip Studio.
   */
  public generatePsdExportManifest(): PsdMultiPassExportManifest {
    const totalHeight = this.evaluateTotalStripHeight();

    const channels: PsdLayerChannel[] = [
      { name: "Speech & Text (말풍선 및 대사)", blendMode: "normal", opacity: 1.0, isVisible: true },
      { name: "Emotion & Action FX (효과선 및 이모트)", blendMode: "normal", opacity: 1.0, isVisible: true },
      { name: "Rim Light & Glow (하이라이트/역광)", blendMode: "screen", opacity: 0.85, isVisible: true },
      { name: "Ink Line Art (3D 외곽선 추출)", blendMode: "multiply", opacity: 1.0, isVisible: true },
      { name: "Deep AO Shadow 2 (2차 깊은 음영)", blendMode: "multiply", opacity: 0.65, isVisible: true },
      { name: "Cel Shadow Tone 1 (1차 툰 음영)", blendMode: "multiply", opacity: 0.75, isVisible: true },
      { name: "Base Flat Color (기본 밑색)", blendMode: "normal", opacity: 1.0, isVisible: true },
      { name: "3D Background Scene (3D 배경)", blendMode: "normal", opacity: 1.0, isVisible: true },
    ];

    return {
      documentWidth: this.documentWidth,
      documentHeight: totalHeight,
      cuts: this.cuts,
      channels,
      colorSpace: "sRGB",
    };
  }
}

/**
 * webtoon-scroll-pacing-simulator.ts
 *
 * Mobile Webtoon Scroll Rhythm & Narrative Pacing Simulator.
 * Benchmarks Spirall Webtoon Previewer, Llamagen Pacing Simulator, and Comistitch Studio.
 *
 * - Analyzes vertical gutters between sequential panels to detect narrative pacing beats.
 * - Simulates real-time mobile reader vertical scrolling speeds (casual, skimmer, immersive).
 * - Computes panel dwell times and alerts when scenes feel too rushed or dragged out.
 */

export type PacingBeatType =
  | "action-rush" // 50~180px: rapid-fire combat / shock beats
  | "dialogue-beat" // 180~380px: conversational tempo & emotional reactions
  | "scene-transition" // 380~650px: time lapse or location shift
  | "suspense-cliffhanger" // 650~1200px: cliffhanger, dramatic silence
  | "excessive-void"; // >1200px: potential reader dropout / blank screen hazard

export type ReaderScrollSpeedProfile = "casual" | "skimmer" | "immersive";

export interface PanelVerticalSpan {
  readonly id: string;
  readonly topY: number;
  readonly bottomY: number;
  readonly heightPx: number;
  readonly dialogueCount?: number;
}

export interface PacingBeatAnalysis {
  readonly fromPanelIndex: number;
  readonly toPanelIndex: number;
  readonly gutterDistancePx: number;
  readonly beatType: PacingBeatType;
  readonly label: string;
  readonly guidance: string;
}

export interface PacingSimulationResult {
  readonly totalCanvasHeightPx: number;
  readonly panelCount: number;
  readonly averageGutterPx: number;
  readonly beats: readonly PacingBeatAnalysis[];
  readonly estimatedReadingSeconds: {
    readonly casual: number; // ~350 px/sec
    readonly skimmer: number; // ~700 px/sec
    readonly immersive: number; // ~180 px/sec
  };
  readonly pacingHealthScore: number; // 0..100
  readonly warnings: readonly string[];
  readonly summary: string;
}

export const SCROLL_SPEEDS_PX_PER_SEC: Record<ReaderScrollSpeedProfile, number> = {
  casual: 350,
  skimmer: 700,
  immersive: 180,
};

export class WebtoonScrollPacingSimulator {
  /**
   * Evaluates sequential panel layouts to compute pacing beats and mobile reading duration.
   */
  public analyze(panels: readonly PanelVerticalSpan[], canvasHeight: number): PacingSimulationResult {
    if (panels.length === 0) {
      return {
        totalCanvasHeightPx: canvasHeight,
        panelCount: 0,
        averageGutterPx: 0,
        beats: [],
        estimatedReadingSeconds: { casual: 0, skimmer: 0, immersive: 0 },
        pacingHealthScore: 100,
        warnings: [],
        summary: "패널이 없습니다.",
      };
    }

    // Sort panels vertically top-to-bottom
    const sorted = [...panels].sort((a, b) => a.topY - b.topY);
    const beats: PacingBeatAnalysis[] = [];
    const warnings: string[] = [];
    let totalGutter = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const gutter = Math.max(0, next.topY - current.bottomY);
      totalGutter += gutter;

      const beat = this.classifyGutter(gutter, i + 1, i + 2);
      beats.push(beat);

      if (beat.beatType === "excessive-void") {
        warnings.push(
          `${i + 1}번~${i + 2}번 컷 사이 여백(${gutter}px)이 너무 길어 독자 이탈 위험이 있습니다.`,
        );
      }
    }

    // Check consecutive rapid action beats
    let consecutiveRush = 0;
    for (const b of beats) {
      if (b.beatType === "action-rush") {
        consecutiveRush++;
        if (consecutiveRush >= 5) {
          warnings.push("연속 5컷 이상 급박한 컷 간격이 이어져 가독성 피로가 유발될 수 있습니다.");
          break;
        }
      } else {
        consecutiveRush = 0;
      }
    }

    const avgGutter = beats.length > 0 ? Math.round(totalGutter / beats.length) : 0;

    // Estimate reading times including dwell time for dialogue
    let totalReadingSecCasual = canvasHeight / SCROLL_SPEEDS_PX_PER_SEC.casual;
    let totalReadingSecSkimmer = canvasHeight / SCROLL_SPEEDS_PX_PER_SEC.skimmer;
    let totalReadingSecImmersive = canvasHeight / SCROLL_SPEEDS_PX_PER_SEC.immersive;

    for (const p of sorted) {
      const dialogues = p.dialogueCount ?? 1;
      const readingBonus = dialogues * 0.8; // +0.8s per speech bubble
      totalReadingSecCasual += readingBonus;
      totalReadingSecSkimmer += readingBonus * 0.5;
      totalReadingSecImmersive += readingBonus * 1.5;
    }

    // Health score calculation (penalty for warnings and severe imbalances)
    let score = 100;
    score -= warnings.length * 15;
    if (avgGutter < 80) score -= 10;
    if (avgGutter > 600) score -= 10;
    score = Math.max(20, Math.min(100, score));

    const summary = `${sorted.length}개 컷 분석 완료 (평균 간격 ${avgGutter}px, 예상 완독 시간 ${Math.round(
      totalReadingSecCasual,
    )}초, 페이싱 점수 ${score}점)`;

    return {
      totalCanvasHeightPx: canvasHeight,
      panelCount: sorted.length,
      averageGutterPx: avgGutter,
      beats,
      estimatedReadingSeconds: {
        casual: Math.round(totalReadingSecCasual),
        skimmer: Math.round(totalReadingSecSkimmer),
        immersive: Math.round(totalReadingSecImmersive),
      },
      pacingHealthScore: score,
      warnings,
      summary,
    };
  }

  private classifyGutter(gutterPx: number, fromIdx: number, toIdx: number): PacingBeatAnalysis {
    if (gutterPx < 180) {
      return {
        fromPanelIndex: fromIdx,
        toPanelIndex: toIdx,
        gutterDistancePx: gutterPx,
        beatType: "action-rush",
        label: "급박한 액션/타격 비트",
        guidance: "빠른 템포의 연속 컷 또는 충격적인 순간 연출에 적합합니다.",
      };
    }
    if (gutterPx < 380) {
      return {
        fromPanelIndex: fromIdx,
        toPanelIndex: toIdx,
        gutterDistancePx: gutterPx,
        beatType: "dialogue-beat",
        label: "표준 대화/호흡 비트",
        guidance: "인물의 리액션과 대사 교환이 자연스럽게 이어지는 표준 호흡입니다.",
      };
    }
    if (gutterPx < 650) {
      return {
        fromPanelIndex: fromIdx,
        toPanelIndex: toIdx,
        gutterDistancePx: gutterPx,
        beatType: "scene-transition",
        label: "장면/공간 전환 비트",
        guidance: "시간의 경과나 다른 장소로의 이동을 독자에게 체감시키는 여백입니다.",
      };
    }
    if (gutterPx <= 1200) {
      return {
        fromPanelIndex: fromIdx,
        toPanelIndex: toIdx,
        gutterDistancePx: gutterPx,
        beatType: "suspense-cliffhanger",
        label: "클리프행어/서스펜스 비트",
        guidance: "스크롤을 멈추고 심리적 긴장감이나 정적의 여운을 극대화합니다.",
      };
    }
    return {
      fromPanelIndex: fromIdx,
      toPanelIndex: toIdx,
      gutterDistancePx: gutterPx,
      beatType: "excessive-void",
      label: "과도한 공백 (경고)",
      guidance: "독자가 빈 화면으로 오해하거나 지루함을 느낄 수 있으므로 컷 간격을 줄이세요.",
    };
  }
}

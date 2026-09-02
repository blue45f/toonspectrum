/**
 * studio-ai-storyboard-director.ts
 *
 * Webtoon Scenario to Storyboard & Cut Director Engine.
 * Benchmarks Onoma AI (TooNat) and Naver Webtoon AI Rough Sketcher.
 *
 * - Parses raw screenplay, novel dialogue, or story text into sequential comic cuts.
 * - Automatically assigns cinematic shot scales (Close-up, Medium, Full, Bird's eye, Worm's eye).
 * - Suggests character emotional expressions, comic sound effects (SFX), and background prompts.
 * - Computes vertical panel height ratios to create dynamic webtoon scroll rhythm.
 */

export type StoryboardShotScale =
  | "extreme-close-up" // 눈, 입술, 쥐어쥔 주먹 등 극도의 긴장감
  | "close-up" // 인물 얼굴 중심의 감정 전달
  | "medium-shot" // 상반신 대화 및 제스처
  | "full-shot" // 인물 전신과 즉각적인 행동
  | "long-shot" // 전체 전황 및 배경 조망
  | "birds-eye" // 하늘에서 내려다보는 부감
  | "worms-eye"; // 바닥에서 올려다보는 극단적 로우앵글

export type StoryboardCameraAngle = "eye-level" | "low-angle" | "high-angle" | "dutch-tilt";

export type CharacterEmotionalTone =
  | "determination"
  | "shock"
  | "joy"
  | "rage"
  | "sorrow"
  | "calm";

export interface StoryboardCutPlan {
  readonly cutNumber: number;
  readonly summary: string;
  readonly dialogue?: string;
  readonly shotScale: StoryboardShotScale;
  readonly cameraAngle: StoryboardCameraAngle;
  readonly emotion: CharacterEmotionalTone;
  readonly suggestedSfx?: string;
  readonly backgroundPrompt: string;
  readonly panelHeightRatio: number; // 0.7 (compact) ~ 2.0 (massive climax cut)
}

export interface StoryboardDirectingResult {
  readonly rawText: string;
  readonly cuts: readonly StoryboardCutPlan[];
  readonly totalCuts: number;
  readonly estimatedEpisodeReadingSec: number;
  readonly pacingScore: number;
}

export class StudioAiStoryboardDirector {
  /**
   * Directs and compiles text into a sequence of structured webtoon cuts.
   */
  public direct(scriptText: string): StoryboardDirectingResult {
    const lines = scriptText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return {
        rawText: scriptText,
        cuts: [],
        totalCuts: 0,
        estimatedEpisodeReadingSec: 0,
        pacingScore: 100,
      };
    }

    const cuts: StoryboardCutPlan[] = [];

    lines.forEach((line, index) => {
      const cutNum = index + 1;
      const parsed = this.analyzeLineDirectives(line, cutNum, lines.length);
      cuts.push(parsed);
    });

    // Estimate read time: ~6 seconds per cut average on mobile scroll
    const estSec = cuts.length * 6;
    const pacingScore = Math.min(100, Math.max(50, 95 - Math.abs(cuts.length - 8) * 3));

    return {
      rawText: scriptText,
      cuts,
      totalCuts: cuts.length,
      estimatedEpisodeReadingSec: estSec,
      pacingScore,
    };
  }

  private analyzeLineDirectives(line: string, cutNum: number, totalCuts: number): StoryboardCutPlan {
    let shotScale: StoryboardShotScale = "medium-shot";
    let cameraAngle: StoryboardCameraAngle = "eye-level";
    let emotion: CharacterEmotionalTone = "calm";
    let suggestedSfx: string | undefined;
    let heightRatio = 1.0;

    // Detect dialogue (lines with quotes or colon)
    let dialogue: string | undefined;
    const quoteMatch = line.match(/["“](.+?)["”]/) || line.match(/:(.+)/);
    if (quoteMatch) {
      dialogue = quoteMatch[1]?.trim();
    }

    // Shot scale & emotion heuristics
    if (/결투|공격|타격|검|주먹|때리|폭발|쾅|쿵/.test(line)) {
      shotScale = "full-shot";
      cameraAngle = "low-angle";
      emotion = "rage";
      suggestedSfx = "콰앙";
      heightRatio = 1.5;
    } else if (/눈빛|숨결|동공|입술|바라보|경악|놀라|충격/.test(line)) {
      shotScale = "extreme-close-up";
      cameraAngle = "eye-level";
      emotion = "shock";
      suggestedSfx = "두근";
      heightRatio = 0.9;
    } else if (/눈물|울|슬픔|비탄|절망|주저앉/.test(line)) {
      shotScale = "close-up";
      cameraAngle = "high-angle";
      emotion = "sorrow";
      suggestedSfx = "주룩주룩";
      heightRatio = 1.2;
    } else if (/웃|미소|행복|기쁨|환호/.test(line)) {
      shotScale = "medium-shot";
      cameraAngle = "eye-level";
      emotion = "joy";
      heightRatio = 1.0;
    } else if (cutNum === totalCuts) {
      // Climax or cliffhanger at the end
      shotScale = "worms-eye";
      cameraAngle = "low-angle";
      emotion = "determination";
      suggestedSfx = "스윽";
      heightRatio = 1.8;
    }

    const bgPrompt = `Webtoon background setting for ${line.slice(0, 30)}, cinematic lighting, clean manhwa cel aesthetic`;

    return {
      cutNumber: cutNum,
      summary: line,
      dialogue,
      shotScale,
      cameraAngle,
      emotion,
      suggestedSfx,
      backgroundPrompt: bgPrompt,
      panelHeightRatio: heightRatio,
    };
  }
}

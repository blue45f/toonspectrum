/**
 * studio-ai-emotion-bubble-matcher.ts
 *
 * Dialogue Emotion Analysis & Speech Bubble Auto-Matcher.
 * Benchmarks Toonsquare Tooning Text-to-Webtoon and Clip Studio Comic Balloon Styles.
 *
 * - Analyzes emotional sentiments of character dialogue lines.
 * - Recommends optimal comic balloon shapes (spiky shout, dashed whisper, cloud thought, wobbly distress).
 * - Suggests stroke width, tail direction, font weight, and character emote icons.
 */

export type SpeechEmotionKind =
  | "rage-shout"
  | "shock-gasp"
  | "whisper-secret"
  | "thought-monologue"
  | "romance-blush"
  | "neutral-calm";

export type BubbleShapePreset =
  | "shout-spiky"
  | "wobbly-distress"
  | "whisper-dashed"
  | "cloud-thought"
  | "soft-blush"
  | "standard-oval";

export interface EmotionBubbleRecommendation {
  readonly dialogue: string;
  readonly detectedEmotion: SpeechEmotionKind;
  readonly confidenceScore: number; // 0..100%
  readonly recommendedBubbleShape: BubbleShapePreset;
  readonly strokeWidthPx: number;
  readonly strokeColor: string;
  readonly fillColor: string;
  readonly textColor: string;
  readonly isDashedBorder: boolean;
  readonly recommendedFontWeight: "bold" | "black" | "normal" | "medium";
  readonly suggestedEmoteIcon: string;
}

export class StudioAiEmotionBubbleMatcher {
  /**
   * Analyzes dialogue sentence and returns complete speech bubble design recommendation.
   */
  public match(dialogueText: string): EmotionBubbleRecommendation {
    const text = dialogueText.trim();
    if (!text) {
      return this.defaultNeutral("");
    }

    // 1. Rage / Shout (외침 / 분노 / 비명)
    if (/!{2,}|\?{2,}|으아|닥쳐|죽어|용서|안 돼|비켜|꺼져|괴물|미친/.test(text)) {
      return {
        dialogue: text,
        detectedEmotion: "rage-shout",
        confidenceScore: 92,
        recommendedBubbleShape: "shout-spiky",
        strokeWidthPx: 3.5,
        strokeColor: "#000000",
        fillColor: "#ffffff",
        textColor: "#000000",
        isDashedBorder: false,
        recommendedFontWeight: "black",
        suggestedEmoteIcon: "Flame",
      };
    }

    // 2. Thought / Monologue (괄호 독백 / 생각)
    if (/^\((.+)\)$|^'(.+)'$|생각|겠지|일까|모르겠/.test(text)) {
      return {
        dialogue: text,
        detectedEmotion: "thought-monologue",
        confidenceScore: 88,
        recommendedBubbleShape: "cloud-thought",
        strokeWidthPx: 2.0,
        strokeColor: "#475569",
        fillColor: "#f8fafc",
        textColor: "#1e293b",
        isDashedBorder: false,
        recommendedFontWeight: "medium",
        suggestedEmoteIcon: "Cloud",
      };
    }

    // 3. Shock / Gasp (경악 / 충격 / 당황)
    if (/설마|거짓말|어떻게|말도 안|히익|헉|헉!|헐/.test(text)) {
      return {
        dialogue: text,
        detectedEmotion: "shock-gasp",
        confidenceScore: 88,
        recommendedBubbleShape: "wobbly-distress",
        strokeWidthPx: 2.5,
        strokeColor: "#1e293b",
        fillColor: "#ffffff",
        textColor: "#0f172a",
        isDashedBorder: false,
        recommendedFontWeight: "bold",
        suggestedEmoteIcon: "Zap",
      };
    }

    // 4. Whisper / Secret (속삭임 / 비밀 / 침묵)
    if (/\.{3,}|쉿|조용히|몰래|비밀|소근|들키면/.test(text)) {
      return {
        dialogue: text,
        detectedEmotion: "whisper-secret",
        confidenceScore: 85,
        recommendedBubbleShape: "whisper-dashed",
        strokeWidthPx: 1.5,
        strokeColor: "#64748b",
        fillColor: "#f8fafc",
        textColor: "#334155",
        isDashedBorder: true,
        recommendedFontWeight: "normal",
        suggestedEmoteIcon: "VolumeX",
      };
    }

    // 5. Romance / Blush (설렘 / 고백 / 호감)
    if (/좋아|사랑|예쁘|두근|반했|보고 싶|고마워|설레/.test(text)) {
      return {
        dialogue: text,
        detectedEmotion: "romance-blush",
        confidenceScore: 89,
        recommendedBubbleShape: "soft-blush",
        strokeWidthPx: 2.0,
        strokeColor: "#f43f5e",
        fillColor: "#fff1f2",
        textColor: "#881337",
        isDashedBorder: false,
        recommendedFontWeight: "bold",
        suggestedEmoteIcon: "Heart",
      };
    }

    return this.defaultNeutral(text);
  }

  private defaultNeutral(text: string): EmotionBubbleRecommendation {
    return {
      dialogue: text,
      detectedEmotion: "neutral-calm",
      confidenceScore: 75,
      recommendedBubbleShape: "standard-oval",
      strokeWidthPx: 2.0,
      strokeColor: "#000000",
      fillColor: "#ffffff",
      textColor: "#000000",
      isDashedBorder: false,
      recommendedFontWeight: "normal",
      suggestedEmoteIcon: "MessageCircle",
    };
  }
}

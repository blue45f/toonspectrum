export {
  VOICE_GUIDE_DEFAULT_RATE,
  VOICE_GUIDE_MAX_RATE,
  VOICE_GUIDE_MIN_RATE,
  VOICE_GUIDE_PITCH,
  clampVoiceGuideRate,
  hasSeenVoiceGuidePrompt,
  isVoiceGuideSupported,
  markVoiceGuidePromptSeen,
  pickKoreanVoice,
  readVoiceGuidePreferences,
  voiceGuideEngine,
  VoiceGuideEngine,
  writeVoiceGuideAutoGuide,
  writeVoiceGuideEnabled,
  writeVoiceGuideRate,
  type SpeakSegmentsOptions,
  type SpeakWithCharacterOptions,
  type VoiceCandidate,
  type VoiceGuidePreferences,
  type VoiceGuideState,
  type VoiceSegmentProgress,
} from "./voice-guide";
export {
  getVoiceGuideScript,
  VOICE_GUIDE_SCRIPT_IDS,
  VOICE_GUIDE_SCRIPTS,
  type VoiceGuideScript,
  type VoiceGuideScriptId,
} from "./voice-guide-texts";
export { usePageVoiceGuide, type PageVoiceGuide } from "./usePageVoiceGuide";
export {
  unwireVoiceBgmDucking,
  VOICE_BGM_DUCK_RATIO,
  wireVoiceBgmDucking,
} from "./voice-bgm-ducking";
export { VoiceGuideButton, type VoiceGuideButtonProps, type VoiceGuideButtonVariant } from "./VoiceGuideButton";
export { VoiceGuidePrompt, type VoiceGuidePromptProps } from "./VoiceGuidePrompt";
export { VoiceGuideSettingsSection } from "./VoiceGuideSettingsSection";
export {
  DEFAULT_VOICE_CHARACTER_PRESET_ID,
  getVoiceCharacterPreset,
  getVoiceCharacterPreviewText,
  readVoiceCharacterPreset,
  VOICE_CHARACTER_PRESET_IDS,
  VOICE_CHARACTER_PRESETS,
  writeVoiceCharacterPreset,
  type VoiceCharacterPreset,
  type VoiceCharacterPresetId,
} from "./voice-character-presets";
export {
  hasEmotionMarkup,
  parseEmotionMarkup,
  stripEmotionMarkup,
  type VoiceEmotion,
  type VoiceSegment,
} from "./voice-emotion-markup";
export {
  buildSsml,
  isSsmlSupportedByWebSpeech,
  ssmlToPlainText,
} from "./voice-ssml";
export {
  describeVoiceQuality,
  pickBestVoice,
  scoreVoiceLanguage,
  scoreVoiceQuality,
  type PickBestVoiceOptions,
} from "./voice-quality";
export { useVoiceSegmentProgress } from "./useVoiceSegmentProgress";
/**
 * Edge TTS 실험 어댑터 — 비공식 API이므로 기본 비활성화.
 * 프로덕션 경로에 연결하지 말고, 실험실에서만 opt-in으로 사용한다.
 */
// Edge TTS(비공식 API, 실험실 opt-in)는 barrel에서 제외한다.
// VoiceGuideSettingsSection이 ./voice-edge-tts를 직접 import하므로 기능은 유지된다.
export type { EdgeTtsResult, EdgeTtsSynthesizeOptions, EdgeTtsVoice } from "./voice-edge-tts";

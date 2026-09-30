/**
 * 모션 웹툰 한/영 라벨.
 */

export interface MotionWebtoonLabels {
  readonly titleKo: string;
  readonly titleEn: string;
}

function label(ko: string, en: string): MotionWebtoonLabels {
  return { titleKo: ko, titleEn: en };
}

export const MOTION_SCENE_MOOD_LABELS: Record<string, MotionWebtoonLabels> = {
  battle: label("전투", "Battle"),
  tension: label("긴장", "Tension"),
  romance: label("로맨스", "Romance"),
  daily: label("일상", "Daily"),
  sad: label("슬픔", "Sad"),
  mystery: label("미스터리", "Mystery"),
  comedy: label("코미디", "Comedy"),
  horror: label("호러", "Horror"),
};

export const CAMERA_MOVE_LABELS: Record<string, MotionWebtoonLabels> = {
  "zoom-in": label("줌인", "Zoom in"),
  "zoom-out": label("줌아웃", "Zoom out"),
  "pan-left": label("왼쪽 패닝", "Pan left"),
  "pan-right": label("오른쪽 패닝", "Pan right"),
  "pan-up": label("위쪽 패닝", "Pan up"),
  "pan-down": label("아래쪽 패닝", "Pan down"),
  shake: label("흔들림", "Shake"),
  static: label("고정", "Static"),
};

export const CUT_TRANSITION_LABELS: Record<string, MotionWebtoonLabels> = {
  cut: label("컷", "Cut"),
  fade: label("페이드", "Fade"),
  "wipe-left": label("와이프 ←", "Wipe left"),
  "wipe-right": label("와이프 →", "Wipe right"),
  blur: label("블러", "Blur"),
  flash: label("플래시", "Flash"),
};

export const DETECTED_EMOTION_LABELS: Record<string, MotionWebtoonLabels> = {
  anger: label("분노", "Anger"),
  sorrow: label("슬픔", "Sorrow"),
  joy: label("기쁨", "Joy"),
  tension: label("긴장", "Tension"),
  romance: label("설렘", "Romance"),
  fear: label("공포", "Fear"),
  surprise: label("놀람", "Surprise"),
  neutral: label("중립", "Neutral"),
};

export const MOTION_WEBTOON_UI_LABELS = {
  playerTitle: label("모션 웹툰 플레이어", "Motion webtoon player"),
  play: label("재생", "Play"),
  pause: label("일시정지", "Pause"),
  stop: label("정지", "Stop"),
  prevCut: label("이전 컷", "Previous cut"),
  nextCut: label("다음 컷", "Next cut"),
  bgmOn: label("BGM 켜기", "Turn BGM on"),
  bgmOff: label("BGM 끄기", "Turn BGM off"),
  voiceOn: label("음성 켜기", "Turn voice on"),
  voiceOff: label("음성 끄기", "Turn voice off"),
  editorTitle: label("모션 웹툰 에디터", "Motion webtoon editor"),
  aiDirect: label("AI 자동 연출", "AI auto-direct"),
  aiDirectDone: label("AI가 연출·BGM·음성을 입혔습니다. 각 항목을 확인하고 수정하세요.", "AI applied direction, BGM, and voice. Review and tweak each item."),
  addCut: label("컷 추가", "Add cut"),
  removeCut: label("컷 삭제", "Delete cut"),
  addDialogue: label("대사 추가", "Add dialogue"),
  addCharacter: label("캐릭터 추가", "Add character"),
  timelineTitle: label("타임라인", "Timeline"),
  previewTitle: label("미리보기", "Preview"),
  cutLabel: label("컷", "Cut"),
  directionLabel: label("연출", "Direction"),
  bgmLabel: label("BGM", "BGM"),
  dialogueLabel: label("대사", "Dialogue"),
  characterLabel: label("캐릭터", "Character"),
  durationLabel: label("재생 길이(초)", "Duration (sec)"),
  intensityLabel: label("연출 강도", "Direction intensity"),
  transitionLabel: label("전환 효과", "Transition"),
  imageUrlLabel: label("컷 이미지 URL", "Cut image URL"),
  voicePresetLabel: label("음성 프리셋", "Voice preset"),
  shareLabel: label("공유 링크 복사", "Copy share link"),
  shareCopied: label("공유 링크가 복사되었습니다.", "Share link copied."),
  emptyEpisode: label("컷을 추가해 모션 웹툰을 만들어 보세요.", "Add cuts to create your motion webtoon."),
  endedMessage: label("끝까지 감상해 주셔서 감사합니다.", "Thanks for watching to the end."),
  // 히어로
  heroBadge: label("MOTION WEBTOON", "MOTION WEBTOON"),
  heroTitle: label("컷이, 영상이 되는 순간", "The moment cuts become cinema"),
  heroSubtitle: label(
    "컷 이미지를 올리면 AI가 카메라·BGM·대사 음성을 입혀줍니다. 한 번의 클릭으로 완성하세요.",
    "Upload your cuts and AI adds camera work, BGM, and dialogue voices. Finish it in one click.",
  ),
  heroCta: label("✨ AI 자동 연출로 완성하기", "✨ Finish with AI auto-direction"),
  heroCtaHint: label(
    "컷이 없어도 괜찮아요 — 샘플 컷으로 바로 시작합니다.",
    "No cuts yet? We'll start you with sample cuts.",
  ),
  heroSecondary: label("샘플 컷으로 맛보기", "Try with sample cuts"),
  // 3단계 안내
  step1Title: label("컷 올리기", "Upload cuts"),
  step1Desc: label("웹툰 컷 이미지 URL을 순서대로 등록하세요.", "Register your webtoon cut image URLs in order."),
  step2Title: label("AI 자동 연출", "AI auto-direction"),
  step2Desc: label("대사 감정을 읽어 BGM·카메라·음성을 한 번에 입힙니다.", "AI reads dialogue emotion and adds BGM, camera, and voices at once."),
  step3Title: label("미리보기·공유", "Preview & share"),
  step3Desc: label("바로 재생해 보고 링크로 공유하세요.", "Play it right away and share the link."),
  // 빈 상태 · 다음 행동
  emptyEpisodeTitle: label("아직 컷이 없어요", "No cuts yet"),
  emptyEpisodeAction: label("첫 컷 추가하기", "Add your first cut"),
  emptyEpisodeAlt: label("또는 위의 ✨ AI 자동 연출 버튼을 눌러 샘플로 시작하세요.", "Or press the ✨ AI auto-direct button above to start with samples."),
  emptyDialogueTitle: label("대사가 없어요", "No dialogue yet"),
  emptyDialogueAction: label("첫 대사 추가하기", "Add the first line"),
  noCharacterHint: label("캐릭터를 먼저 등록하면 대사에 음성이 입혀집니다.", "Register a character first to give dialogue a voice."),
  addCharacterFirst: label("캐릭터 등록하기", "Register a character"),
  // 고급 설정 접기
  advancedSettings: label("고급 설정", "Advanced settings"),
  cameraSection: label("카메라 연출", "Camera direction"),
  // 검증 배너
  issuesFound: label("고칠 점이 있어요", "Things to fix"),
  jumpToCut: label("컷으로 이동", "Go to cut"),
  // 플레이어 스플래시
  splashPlay: label("▶ 지금 재생하기", "▶ Play now"),
  splashMeta: label("컷 {cuts}개 · {seconds}초", "{cuts} cuts · {seconds}s"),
  replay: label("↺ 다시 보기", "↺ Replay"),
  // 타임라인
  totalDuration: label("총 재생 시간", "Total duration"),
  secondsUnit: label("초", "s"),
  // 공유 안내
  shareNote: label(
    "링크를 열면 이 브라우저에 저장된 회차가 열립니다.",
    "Opening the link restores the saved episode in this browser.",
  ),
  // 페이지 (공유 링크 복원)
  pageRestoredNotice: label(
    "공유 링크의 회차를 불러왔습니다. 이어서 편집하거나 바로 재생해 보세요.",
    "Loaded the episode from the share link. Continue editing or play it right away.",
  ),
  pageShareNotFound: label(
    "링크의 회차를 이 브라우저에서 찾을 수 없어요. 저장된 마지막 회차를 엽니다.",
    "Couldn't find the linked episode in this browser. Opening your last saved episode instead.",
  ),
  pageResumeNotice: label(
    "마지막으로 작업하던 회차를 이어서 엽니다.",
    "Resuming your last edited episode.",
  ),
} as const;

export type MotionWebtoonUiLabelKey = keyof typeof MOTION_WEBTOON_UI_LABELS;

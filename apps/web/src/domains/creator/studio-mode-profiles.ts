import type { StudioDocumentKind } from "./studio-project-document-store";
import type { StudioProjectKind } from "./studio-project-library-store";
import type { StudioModeProfile } from "./studio-mode-profile";

const stage = (id: string, labelKo: string, labelEn: string) =>
  Object.freeze({ id, labelKo, labelEn });

function mode(profile: StudioModeProfile): StudioModeProfile {
  return Object.freeze(profile);
}

export const STUDIO_MODE_PROFILES = Object.freeze({
  webtoon: mode({
    id: "webtoon",
    document: { kind: "webtoon", workspace: "comic", taskWorkspace: "pro-comic" },
    launch: { density: "simple", primaryTool: "draw", shell: "comic" },
    chrome: { left: ["pages", "scenes"], right: ["layers", "characters", "bubbles", "properties"], bottom: [] },
    ai: { actions: ["script-to-panels", "panel-direction", "continuity-check", "bubble-layout", "mobile-flow-check"] },
    preview: { kind: "mobile-scroll" },
    export: { presets: ["webtoon-long-image", "episode-package", "platform-preview"] },
    handoffs: ["webtoon-to-animation", "webtoon-to-design", "webtoon-to-slides"],
    workflow: [stage("storyboard", "콘티", "Storyboard"), stage("manuscript", "원고", "Manuscript"), stage("lettering", "레터링", "Lettering"), stage("review", "모바일 검수", "Mobile review")],
    creationPreview: {
      headlineKo: "세로 원고부터 모바일 독자 화면까지 한 흐름으로 제작합니다.",
      headlineEn: "Build vertical episodes from panels to the mobile reader flow.",
      keyToolsKo: ["컷", "말풍선", "펜", "캐릭터", "페이지"],
      keyToolsEn: ["Panels", "Balloons", "Pen", "Characters", "Pages"],
      aiHighlightsKo: ["대본→컷", "연속성 검사", "말풍선 정리"],
      aiHighlightsEn: ["Script to panels", "Continuity check", "Bubble layout"],
      outputKo: "모바일 웹툰 원고",
      outputEn: "Mobile webtoon episode",
    },
  }),
  illustration: mode({
    id: "illustration",
    document: { kind: "illustration", workspace: "draw", taskWorkspace: "lineart" },
    launch: { density: "simple", primaryTool: "draw", shell: "drawing" },
    chrome: { left: ["references", "assets", "history"], right: ["brushes", "layers", "colors", "properties"], bottom: [] },
    ai: { actions: ["rough-to-line", "pose-reference", "inpaint-selection", "colorize", "lighting-pass"] },
    preview: { kind: "canvas" },
    export: { presets: ["png", "jpeg", "high-resolution"] },
    handoffs: ["illustration-to-design"],
    workflow: [stage("rough", "러프", "Rough"), stage("line", "선화", "Line art"), stage("color", "채색", "Color"), stage("finish", "마감", "Finish")],
    creationPreview: {
      headlineKo: "레이어·브러시·색과 레퍼런스에 집중한 단일 캔버스입니다.",
      headlineEn: "A focused canvas built around layers, brushes, color and references.",
      keyToolsKo: ["브러시", "레이어", "색", "레퍼런스"],
      keyToolsEn: ["Brushes", "Layers", "Color", "References"],
      aiHighlightsKo: ["러프→선화", "부분 수정", "채색·광원"],
      aiHighlightsEn: ["Rough to line", "Selection edits", "Color and light"],
      outputKo: "고해상도 일러스트",
      outputEn: "High-resolution illustration",
    },
  }),
  image: mode({
    id: "image",
    document: { kind: "image", workspace: "image", taskWorkspace: "photo-edit" },
    launch: { density: "simple", primaryTool: "select", shell: "image" },
    chrome: { left: ["history", "assets"], right: ["adjustments", "masks", "layers", "properties"], bottom: [] },
    ai: { actions: ["remove-background", "object-remove", "generative-fill", "expand-image", "cleanup", "color-match"] },
    preview: { kind: "before-after" },
    export: { presets: ["image-original", "image-flattened", "png", "jpeg"] },
    handoffs: [],
    workflow: [stage("source", "원본", "Source"), stage("mask", "선택·마스크", "Select & mask"), stage("retouch", "보정·합성", "Retouch & composite"), stage("compare", "전후 비교", "Before / after")],
    creationPreview: {
      headlineKo: "원본을 보존하며 마스크·보정·합성을 중심으로 편집합니다.",
      headlineEn: "Edit non-destructively with masks, adjustments and compositing.",
      keyToolsKo: ["선택", "마스크", "보정", "합성", "전후 비교"],
      keyToolsEn: ["Select", "Mask", "Adjust", "Composite", "Before/after"],
      aiHighlightsKo: ["배경 제거", "개체 제거", "생성 채우기"],
      aiHighlightsEn: ["Remove background", "Remove object", "Generative fill"],
      outputKo: "보정·합성 이미지",
      outputEn: "Edited and composited image",
    },
  }),
  design: mode({
    id: "design",
    document: { kind: "design", workspace: "design", taskWorkspace: "vector-design" },
    launch: { density: "simple", primaryTool: "select", shell: "layout" },
    chrome: { left: ["templates", "components", "assets"], right: ["properties", "layers"], bottom: [] },
    ai: { actions: ["cover-layout", "promo-variants", "copy-suggest", "smart-resize", "background-compose"] },
    preview: { kind: "artboard" },
    export: { presets: ["cover", "episode-thumbnail", "social-promo"] },
    handoffs: [],
    workflow: [stage("template", "규격·템플릿", "Format & template"), stage("layout", "레이아웃", "Layout"), stage("variants", "규격별 변형", "Variants"), stage("export", "배포용 출력", "Export")],
    creationPreview: {
      headlineKo: "표지·썸네일·홍보물을 아트보드와 템플릿 중심으로 만듭니다.",
      headlineEn: "Create covers, thumbnails and promotions with artboards and templates.",
      keyToolsKo: ["선택", "변형", "도형", "텍스트", "정렬"],
      keyToolsEn: ["Select", "Transform", "Shapes", "Text", "Align"],
      aiHighlightsKo: ["표지 레이아웃", "홍보 변형", "스마트 리사이즈"],
      aiHighlightsEn: ["Cover layout", "Promo variants", "Smart resize"],
      outputKo: "표지·SNS·썸네일 패키지",
      outputEn: "Cover, social and thumbnail package",
    },
  }),
  slides: mode({
    id: "slides",
    document: { kind: "slides", workspace: "slides", taskWorkspace: "slides-deck" },
    launch: { density: "simple", primaryTool: "select", shell: "slides" },
    chrome: { left: ["slides"], right: ["properties", "components"], bottom: ["speaker-notes"] },
    ai: { actions: ["pitch-outline", "slide-layout", "speaker-notes", "pitch-copy", "deck-consistency-check"] },
    preview: { kind: "presentation" },
    export: { presets: ["pitch-pdf", "presentation"] },
    handoffs: [],
    workflow: [stage("outline", "구성", "Outline"), stage("slides", "슬라이드 제작", "Build slides"), stage("notes", "발표 노트", "Speaker notes"), stage("present", "발표 검수", "Present & review")],
    creationPreview: {
      headlineKo: "슬라이드 목록·본문·발표 노트를 분리한 피칭 전용 작업공간입니다.",
      headlineEn: "A pitch workspace with separate slide navigation, canvas and speaker notes.",
      keyToolsKo: ["슬라이드", "레이아웃", "텍스트", "테마", "발표 노트"],
      keyToolsEn: ["Slides", "Layout", "Text", "Theme", "Speaker notes"],
      aiHighlightsKo: ["피치 구성", "슬라이드 레이아웃", "발표 노트"],
      aiHighlightsEn: ["Pitch outline", "Slide layout", "Speaker notes"],
      outputKo: "작품 피치덱·제작 공유 자료",
      outputEn: "Series pitch or production deck",
    },
  }),
  storyboard: mode({
    id: "storyboard",
    document: { kind: "storyboard", workspace: "storyboard", taskWorkspace: "storyboard" },
    launch: { density: "simple", primaryTool: "draw", shell: "storyboard" },
    chrome: { left: ["scenes", "shots"], right: ["camera", "properties"], bottom: ["timeline"] },
    ai: { actions: ["script-to-scenes", "scene-to-shots", "camera-suggest", "shot-duration", "animatic-draft"] },
    preview: { kind: "animatic" },
    export: { presets: ["storyboard-pdf", "shot-list", "animatic"] },
    handoffs: ["storyboard-to-webtoon"],
    workflow: [stage("script", "대본", "Script"), stage("scenes", "장면 분해", "Scenes"), stage("shots", "샷 설계", "Shots"), stage("timing", "타이밍·애니매틱", "Timing & animatic")],
    creationPreview: {
      headlineKo: "대본을 Scene과 Shot으로 나누고 카메라와 타이밍을 설계합니다.",
      headlineEn: "Break a script into scenes and shots, then design camera and timing.",
      keyToolsKo: ["Scene", "Shot", "카메라", "대사", "타이밍"],
      keyToolsEn: ["Scenes", "Shots", "Camera", "Dialogue", "Timing"],
      aiHighlightsKo: ["대본→장면", "샷 분해", "카메라 제안"],
      aiHighlightsEn: ["Script to scenes", "Shot breakdown", "Camera suggestions"],
      outputKo: "콘티·Shot list·Animatic",
      outputEn: "Storyboard, shot list and animatic",
    },
  }),
  "three-d": mode({
    id: "three-d",
    document: { kind: "three-d", workspace: "3d", taskWorkspace: "pose-3d" },
    launch: { density: "simple", primaryTool: "select", shell: "spatial" },
    chrome: { left: ["outliner", "assets", "characters"], right: ["properties", "camera", "lighting", "pose"], bottom: [] },
    ai: { actions: ["pose-from-text", "camera-suggest", "composition-suggest", "lighting-preset", "scene-layout"] },
    preview: { kind: "render" },
    export: { presets: ["render-reference", "background-render", "camera-snapshot"] },
    handoffs: ["three-d-to-webtoon", "three-d-to-illustration"],
    workflow: [stage("block", "장면 배치", "Block scene"), stage("pose", "포즈", "Pose"), stage("camera", "카메라·조명", "Camera & light"), stage("render", "참고 렌더", "Reference render")],
    creationPreview: {
      headlineKo: "Outliner·3D Viewport·카메라·포즈를 원고 참고 제작에 맞춥니다.",
      headlineEn: "Use an outliner, 3D viewport, camera and posing for production reference.",
      keyToolsKo: ["오브젝트", "이동·회전", "카메라", "포즈", "조명"],
      keyToolsEn: ["Objects", "Transform", "Camera", "Pose", "Lighting"],
      aiHighlightsKo: ["텍스트 포즈", "카메라 제안", "장면 배치"],
      aiHighlightsEn: ["Text pose", "Camera suggestions", "Scene layout"],
      outputKo: "배경·포즈·카메라 참고 렌더",
      outputEn: "Background, pose and camera reference render",
    },
  }),
  animation: mode({
    id: "animation",
    document: { kind: "animation", workspace: "animation", taskWorkspace: "animation" },
    launch: { density: "simple", primaryTool: "select", shell: "timeline" },
    chrome: { left: ["scenes", "assets", "characters"], right: ["properties", "camera"], bottom: ["timeline", "audio-tracks"] },
    ai: { actions: ["panel-to-motion", "auto-keyframe", "camera-motion", "lip-sync", "caption-align", "music-cue"] },
    preview: { kind: "playback" },
    export: { presets: ["mp4", "webm", "gif", "vertical-short"] },
    handoffs: [],
    workflow: [stage("scenes", "장면", "Scenes"), stage("timeline", "타임라인", "Timeline"), stage("audio", "음성·자막", "Voice & captions"), stage("playback", "재생·출력", "Playback & export")],
    creationPreview: {
      headlineKo: "Preview와 Timeline을 중심으로 장면·카메라·음성·자막을 편집합니다.",
      headlineEn: "Edit scenes, camera, voice and captions around preview and timeline surfaces.",
      keyToolsKo: ["타임라인", "키프레임", "카메라", "음성", "자막"],
      keyToolsEn: ["Timeline", "Keyframes", "Camera", "Voice", "Captions"],
      aiHighlightsKo: ["컷→모션", "자동 키프레임", "립싱크·자막"],
      aiHighlightsEn: ["Panel to motion", "Auto keyframes", "Lip sync & captions"],
      outputKo: "모션 웹툰·영상",
      outputEn: "Motion comic or video",
    },
  }),
} satisfies Readonly<Record<StudioProjectKind, StudioModeProfile>>);

export function studioModeProfile(kind: StudioProjectKind): StudioModeProfile {
  return STUDIO_MODE_PROFILES[kind];
}

export function resolveStudioRuntimeMode(
  projectKind: StudioProjectKind,
  documentKind: StudioDocumentKind,
): StudioProjectKind {
  switch (documentKind) {
    case "webtoon":
    case "localization": return "webtoon";
    case "illustration": return "illustration";
    case "image": return "image";
    case "design": return "design";
    case "slides": return "slides";
    case "storyboard":
    case "whiteboard": return "storyboard";
    case "three-d": return "three-d";
    case "animation":
    case "motion":
    case "audio": return "animation";
    default: return projectKind;
  }
}

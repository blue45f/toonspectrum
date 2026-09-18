import type {
  StudioDocumentKind,
  StudioDocumentWorkspace,
  StudioProjectDocumentEntry,
} from "./studio-project-document-store";
import type { StudioProjectKind, StudioProjectLibraryEntry } from "./studio-project-library-store";
import type { StudioDefaultWorkspaceId } from "./studio-workspaces";

export type StudioModeShell =
  | "comic"
  | "drawing"
  | "image"
  | "layout"
  | "slides"
  | "storyboard"
  | "spatial"
  | "timeline";

export type StudioModePanelId =
  | "pages"
  | "scenes"
  | "shots"
  | "layers"
  | "assets"
  | "references"
  | "brushes"
  | "colors"
  | "bubbles"
  | "characters"
  | "templates"
  | "components"
  | "slides"
  | "speaker-notes"
  | "history"
  | "adjustments"
  | "masks"
  | "outliner"
  | "camera"
  | "lighting"
  | "pose"
  | "timeline"
  | "audio-tracks"
  | "properties";

export type StudioModePreviewKind =
  | "mobile-scroll"
  | "canvas"
  | "artboard"
  | "presentation"
  | "shot-board"
  | "before-after"
  | "viewport-3d"
  | "playback";

export type StudioModeAiActionId =
  | "script-to-panels"
  | "panel-direction"
  | "continuity-check"
  | "bubble-layout"
  | "rough-to-line"
  | "pose-reference"
  | "inpaint-selection"
  | "colorize"
  | "lighting-pass"
  | "cover-layout"
  | "promo-variants"
  | "copy-suggest"
  | "smart-resize"
  | "pitch-outline"
  | "slide-layout"
  | "speaker-notes"
  | "script-to-scenes"
  | "scene-to-shots"
  | "camera-suggest"
  | "shot-duration"
  | "object-remove"
  | "generative-fill"
  | "expand-image"
  | "cleanup"
  | "pose-from-text"
  | "composition-suggest"
  | "lighting-preset"
  | "scene-layout"
  | "panel-to-motion"
  | "auto-keyframe"
  | "camera-motion"
  | "lip-sync"
  | "caption-align"
  | "music-cue";

export type StudioModeExportPresetId =
  | "webtoon-long-image"
  | "episode-package"
  | "platform-preview"
  | "png"
  | "jpeg"
  | "high-resolution"
  | "cover"
  | "episode-thumbnail"
  | "social-square"
  | "vertical-promo"
  | "pitch-pdf"
  | "presentation"
  | "shot-list"
  | "animatic"
  | "edited-image"
  | "layered-image"
  | "render-reference"
  | "background-render"
  | "camera-snapshot"
  | "mp4"
  | "webm"
  | "gif"
  | "vertical-short";

export interface StudioModeCopy {
  readonly ko: string;
  readonly en: string;
}

export interface StudioModeWorkflowStage {
  readonly id: string;
  readonly label: StudioModeCopy;
}

export interface StudioModeProfile {
  readonly id: StudioProjectKind;
  readonly shell: StudioModeShell;
  readonly headline: StudioModeCopy;
  readonly description: StudioModeCopy;
  readonly document: {
    readonly kind: StudioDocumentKind;
    readonly workspace: StudioDocumentWorkspace;
    readonly taskWorkspace: StudioDefaultWorkspaceId;
  };
  readonly launch: {
    readonly density: "focus" | "simple" | "full";
    readonly primaryTool: "draw" | "select";
  };
  readonly panels: {
    readonly left: readonly StudioModePanelId[];
    readonly right: readonly StudioModePanelId[];
    readonly bottom: readonly StudioModePanelId[];
  };
  readonly keyTools: readonly StudioModeCopy[];
  readonly aiActions: readonly StudioModeAiActionId[];
  readonly preview: StudioModePreviewKind;
  readonly exports: readonly StudioModeExportPresetId[];
  readonly workflow: readonly StudioModeWorkflowStage[];
}

const copy = (ko: string, en: string): StudioModeCopy => Object.freeze({ ko, en });
const stage = (id: string, ko: string, en: string): StudioModeWorkflowStage => Object.freeze({
  id,
  label: copy(ko, en),
});

const modeProfile = (value: StudioModeProfile): StudioModeProfile => Object.freeze(value);

export const STUDIO_MODE_PROFILES = Object.freeze({
  webtoon: modeProfile({
    id: "webtoon",
    shell: "comic",
    headline: copy("연재 원고를 컷 단위로 완성", "Finish episodes panel by panel"),
    description: copy("세로 원고, 컷, 말풍선, 캐릭터 연속성과 모바일 흐름을 한 제작선에서 다룹니다.", "Work with vertical pages, panels, balloons, character continuity and mobile reading flow in one production line."),
    document: { kind: "webtoon", workspace: "comic", taskWorkspace: "pro-comic" },
    launch: { density: "simple", primaryTool: "draw" },
    panels: { left: ["pages", "scenes", "shots"], right: ["layers", "characters", "bubbles", "properties"], bottom: [] },
    keyTools: [copy("펜", "Pen"), copy("컷", "Panels"), copy("말풍선", "Balloons"), copy("캐릭터", "Characters")],
    aiActions: ["script-to-panels", "panel-direction", "continuity-check", "bubble-layout"],
    preview: "mobile-scroll",
    exports: ["webtoon-long-image", "episode-package", "platform-preview"],
    workflow: [stage("storyboard", "콘티", "Storyboard"), stage("draw", "원고", "Drawing"), stage("lettering", "레터링", "Lettering"), stage("review", "모바일 검수", "Mobile review")],
  }),
  illustration: modeProfile({
    id: "illustration",
    shell: "drawing",
    headline: copy("브러시와 레이어에 집중", "Focus on brushes and layers"),
    description: copy("단일 캔버스를 넓게 쓰고 레퍼런스, 색, 브러시와 레이어를 가까이 둡니다.", "Keep a spacious canvas with references, color, brushes and layers close at hand."),
    document: { kind: "illustration", workspace: "draw", taskWorkspace: "lineart" },
    launch: { density: "simple", primaryTool: "draw" },
    panels: { left: ["references", "assets", "history"], right: ["brushes", "layers", "colors", "properties"], bottom: [] },
    keyTools: [copy("브러시", "Brush"), copy("레이어", "Layers"), copy("색", "Color"), copy("레퍼런스", "Reference")],
    aiActions: ["rough-to-line", "pose-reference", "inpaint-selection", "colorize", "lighting-pass"],
    preview: "canvas",
    exports: ["png", "jpeg", "high-resolution"],
    workflow: [stage("rough", "러프", "Rough"), stage("line", "선화", "Line art"), stage("color", "채색", "Color"), stage("finish", "마감", "Finish")],
  }),
  image: modeProfile({
    id: "image",
    shell: "image",
    headline: copy("원본을 보존하며 정밀 편집", "Edit precisely while preserving the original"),
    description: copy("선택, 마스크, 보정, 리터치와 Before/After 비교에 집중합니다.", "Focus on selections, masks, adjustments, retouching and before/after comparison."),
    document: { kind: "image", workspace: "image", taskWorkspace: "photo-edit" },
    launch: { density: "simple", primaryTool: "select" },
    panels: { left: ["history", "assets"], right: ["adjustments", "masks", "layers", "properties"], bottom: [] },
    keyTools: [copy("선택", "Select"), copy("마스크", "Mask"), copy("리터치", "Retouch"), copy("보정", "Adjust")],
    aiActions: ["object-remove", "generative-fill", "expand-image", "cleanup", "colorize"],
    preview: "before-after",
    exports: ["edited-image", "layered-image", "png", "jpeg"],
    workflow: [stage("source", "원본 확인", "Inspect source"), stage("retouch", "리터치", "Retouch"), stage("grade", "보정", "Grade"), stage("compare", "비교", "Compare")],
  }),
  design: modeProfile({
    id: "design",
    shell: "layout",
    headline: copy("표지와 홍보물을 규격별로 제작", "Create covers and promotions by format"),
    description: copy("아트보드, 템플릿, 타이포그래피, 정렬과 변형을 중심으로 구성합니다.", "Work around artboards, templates, typography, alignment and transforms."),
    document: { kind: "design", workspace: "design", taskWorkspace: "vector-design" },
    launch: { density: "simple", primaryTool: "select" },
    panels: { left: ["templates", "components", "assets"], right: ["layers", "properties", "colors"], bottom: [] },
    keyTools: [copy("선택", "Select"), copy("변형", "Transform"), copy("텍스트", "Text"), copy("도형", "Shape")],
    aiActions: ["cover-layout", "promo-variants", "copy-suggest", "smart-resize"],
    preview: "artboard",
    exports: ["cover", "episode-thumbnail", "social-square", "vertical-promo"],
    workflow: [stage("template", "규격 선택", "Choose format"), stage("layout", "레이아웃", "Layout"), stage("variant", "변형본", "Variants"), stage("deliver", "납품", "Deliver")],
  }),
  slides: modeProfile({
    id: "slides",
    shell: "slides",
    headline: copy("작품 피칭을 슬라이드 흐름으로 설계", "Shape the pitch as a slide narrative"),
    description: copy("슬라이드 목록, 본문 편집, 발표 흐름과 노트를 중심으로 작업합니다.", "Work around slide navigation, content, presentation flow and notes."),
    document: { kind: "slides", workspace: "slides", taskWorkspace: "vector-design" },
    launch: { density: "simple", primaryTool: "select" },
    panels: { left: ["slides"], right: ["properties", "layers", "colors"], bottom: ["speaker-notes"] },
    keyTools: [copy("슬라이드", "Slides"), copy("레이아웃", "Layout"), copy("텍스트", "Text"), copy("발표", "Present")],
    aiActions: ["pitch-outline", "slide-layout", "speaker-notes", "copy-suggest"],
    preview: "presentation",
    exports: ["pitch-pdf", "presentation"],
    workflow: [stage("outline", "구성", "Outline"), stage("slides", "슬라이드", "Slides"), stage("notes", "발표 노트", "Notes"), stage("present", "발표 검수", "Presentation review")],
  }),
  storyboard: modeProfile({
    id: "storyboard",
    shell: "storyboard",
    headline: copy("대본을 장면과 샷으로 분해", "Break scripts into scenes and shots"),
    description: copy("Scene, Shot, 카메라, 대사와 타이밍을 콘티 흐름으로 연결합니다.", "Connect scenes, shots, camera, dialogue and timing into a storyboard flow."),
    document: { kind: "storyboard", workspace: "storyboard", taskWorkspace: "storyboard" },
    launch: { density: "simple", primaryTool: "draw" },
    panels: { left: ["scenes", "shots"], right: ["camera", "properties"], bottom: ["timeline"] },
    keyTools: [copy("씬", "Scene"), copy("샷", "Shot"), copy("카메라", "Camera"), copy("타이밍", "Timing")],
    aiActions: ["script-to-scenes", "scene-to-shots", "camera-suggest", "shot-duration"],
    preview: "shot-board",
    exports: ["shot-list", "animatic"],
    workflow: [stage("script", "대본", "Script"), stage("scene", "씬 분해", "Scenes"), stage("shot", "샷 설계", "Shots"), stage("timing", "애니매틱", "Animatic")],
  }),
  "three-d": modeProfile({
    id: "three-d",
    shell: "spatial",
    headline: copy("카메라와 포즈를 3D에서 설계", "Design cameras and poses in 3D"),
    description: copy("Outliner, 3D Viewport, 카메라, 조명과 포즈를 원고 레퍼런스로 연결합니다.", "Connect the outliner, 3D viewport, cameras, lights and poses to drawing references."),
    document: { kind: "three-d", workspace: "3d", taskWorkspace: "pose-3d" },
    launch: { density: "simple", primaryTool: "select" },
    panels: { left: ["outliner", "assets", "characters"], right: ["properties", "camera", "lighting", "pose"], bottom: [] },
    keyTools: [copy("오브젝트", "Object"), copy("카메라", "Camera"), copy("포즈", "Pose"), copy("조명", "Light")],
    aiActions: ["pose-from-text", "camera-suggest", "composition-suggest", "lighting-preset", "scene-layout"],
    preview: "viewport-3d",
    exports: ["render-reference", "background-render", "camera-snapshot"],
    workflow: [stage("block", "장면 배치", "Block scene"), stage("pose", "포즈", "Pose"), stage("camera", "카메라", "Camera"), stage("render", "레퍼런스 렌더", "Reference render")],
  }),
  animation: modeProfile({
    id: "animation",
    shell: "timeline",
    headline: copy("장면과 시간축을 함께 편집", "Edit scenes and time together"),
    description: copy("Preview, Timeline, 키프레임, 카메라, 음성, 자막과 오디오 트랙을 한 화면에서 다룹니다.", "Work with preview, timeline, keyframes, cameras, voice, captions and audio tracks on one screen."),
    document: { kind: "animation", workspace: "animation", taskWorkspace: "animation" },
    launch: { density: "simple", primaryTool: "select" },
    panels: { left: ["scenes", "assets", "characters"], right: ["properties", "camera"], bottom: ["timeline", "audio-tracks"] },
    keyTools: [copy("타임라인", "Timeline"), copy("키프레임", "Keyframe"), copy("카메라", "Camera"), copy("오디오", "Audio")],
    aiActions: ["panel-to-motion", "auto-keyframe", "camera-motion", "lip-sync", "caption-align", "music-cue"],
    preview: "playback",
    exports: ["mp4", "webm", "gif", "vertical-short"],
    workflow: [stage("scene", "장면", "Scene"), stage("motion", "모션", "Motion"), stage("audio", "음성·오디오", "Voice & audio"), stage("review", "재생 검수", "Playback review")],
  }),
} satisfies Record<StudioProjectKind, StudioModeProfile>);

export function studioModeProfile(kind: StudioProjectKind): StudioModeProfile {
  return STUDIO_MODE_PROFILES[kind];
}

export function resolveStudioRuntimeMode(
  project: Pick<StudioProjectLibraryEntry, "kind">,
  document: Pick<StudioProjectDocumentEntry, "kind">,
): StudioProjectKind {
  switch (document.kind) {
    case "webtoon": return "webtoon";
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
    case "localization": return "webtoon";
    default: return project.kind;
  }
}

export function studioModeLabel(profile: StudioModeProfile, locale: "ko" | "en"): string {
  const labels: Readonly<Record<StudioProjectKind, StudioModeCopy>> = {
    webtoon: copy("웹툰", "Webtoon"),
    illustration: copy("일러스트", "Illustration"),
    image: copy("이미지 편집", "Image editing"),
    design: copy("표지·홍보 디자인", "Cover & promotion"),
    slides: copy("발표 자료", "Presentation"),
    storyboard: copy("스토리보드", "Storyboard"),
    "three-d": copy("3D 장면", "3D scene"),
    animation: copy("애니메이션·모션", "Animation & motion"),
  };
  return labels[profile.id][locale];
}

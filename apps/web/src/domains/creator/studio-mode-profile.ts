import type { StudioProjectKind } from "./studio-project-library-store";
import type { StudioDocumentKind, StudioDocumentWorkspace } from "./studio-project-document-store";
import type { StudioUiDensityMode } from "./studio-ui-density";
import type { StudioDefaultWorkspaceId } from "./studio-workspaces";

export type StudioCreationMode = StudioProjectKind;

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

export type StudioModeAiActionId =
  | "script-to-panels"
  | "panel-direction"
  | "continuity-check"
  | "bubble-layout"
  | "mobile-flow-check"
  | "rough-to-line"
  | "pose-reference"
  | "inpaint-selection"
  | "colorize"
  | "lighting-pass"
  | "remove-background"
  | "object-remove"
  | "generative-fill"
  | "expand-image"
  | "cleanup"
  | "color-match"
  | "cover-layout"
  | "promo-variants"
  | "copy-suggest"
  | "smart-resize"
  | "background-compose"
  | "pitch-outline"
  | "slide-layout"
  | "speaker-notes"
  | "pitch-copy"
  | "deck-consistency-check"
  | "script-to-scenes"
  | "scene-to-shots"
  | "camera-suggest"
  | "shot-duration"
  | "animatic-draft"
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

export type StudioModePreviewKind =
  | "mobile-scroll"
  | "canvas"
  | "before-after"
  | "artboard"
  | "presentation"
  | "animatic"
  | "render"
  | "playback";

export type StudioModeExportPresetId =
  | "webtoon-long-image"
  | "episode-package"
  | "platform-preview"
  | "png"
  | "jpeg"
  | "high-resolution"
  | "image-original"
  | "image-flattened"
  | "cover"
  | "episode-thumbnail"
  | "social-promo"
  | "pitch-pdf"
  | "presentation"
  | "storyboard-pdf"
  | "shot-list"
  | "animatic"
  | "render-reference"
  | "background-render"
  | "camera-snapshot"
  | "mp4"
  | "webm"
  | "gif"
  | "vertical-short";

export type StudioModeHandoffId =
  | "storyboard-to-webtoon"
  | "webtoon-to-animation"
  | "webtoon-to-design"
  | "illustration-to-design"
  | "three-d-to-webtoon"
  | "three-d-to-illustration"
  | "webtoon-to-slides";

export interface StudioModeWorkflowStage {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioModeLocalizedPreview {
  readonly headlineKo: string;
  readonly headlineEn: string;
  readonly keyToolsKo: readonly string[];
  readonly keyToolsEn: readonly string[];
  readonly aiHighlightsKo: readonly string[];
  readonly aiHighlightsEn: readonly string[];
  readonly outputKo: string;
  readonly outputEn: string;
}

export interface StudioModeProfile {
  readonly id: StudioCreationMode;
  readonly document: {
    readonly kind: StudioDocumentKind;
    readonly workspace: StudioDocumentWorkspace;
    readonly taskWorkspace: StudioDefaultWorkspaceId;
  };
  readonly launch: {
    readonly density: StudioUiDensityMode;
    readonly primaryTool: "draw" | "select";
    readonly shell: StudioModeShell;
  };
  readonly chrome: {
    readonly left: readonly StudioModePanelId[];
    readonly right: readonly StudioModePanelId[];
    readonly bottom: readonly StudioModePanelId[];
  };
  readonly ai: { readonly actions: readonly StudioModeAiActionId[] };
  readonly preview: { readonly kind: StudioModePreviewKind };
  readonly export: { readonly presets: readonly StudioModeExportPresetId[] };
  readonly handoffs: readonly StudioModeHandoffId[];
  readonly workflow: readonly StudioModeWorkflowStage[];
  readonly creationPreview: StudioModeLocalizedPreview;
}

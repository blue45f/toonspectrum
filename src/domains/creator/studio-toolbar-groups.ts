import type { StudioMenu } from "./studio-editor-tool-model";

export type StudioToolbarGroupId = "bgGroup" | "assetGroup" | "styleGroup" | "aiGroup";

// Menu state doubles as the open group and active subtab. Modal-only actions are intentionally
// absent because they close the popover and open their dedicated surface instead.
export const STUDIO_TOOLBAR_GROUP_OF: Readonly<
  Partial<Record<StudioMenu, StudioToolbarGroupId>>
> = {
  bgScene: "bgGroup",
  bgFill: "bgGroup",
  tone: "bgGroup",
  template: "assetGroup",
  collage: "assetGroup",
  emeres: "assetGroup",
  scene: "assetGroup",
  clip: "assetGroup",
  sticker: "assetGroup",
  elements: "assetGroup",
  asset: "assetGroup",
  palette: "styleGroup",
  brandKit: "styleGroup",
  aiAssist: "aiGroup",
  stockImage: "aiGroup",
  integrations: "aiGroup",
};

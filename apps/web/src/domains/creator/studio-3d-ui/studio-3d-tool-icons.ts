export const STUDIO_3D_TOOL_ICON_NAMES = [
  "face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair",
  "body", "top", "bottom", "shoes", "accessory", "expression", "pose", "hand-pose",
  "camera", "scene", "surface-ink", "layers", "export", "orbit",
] as const;

export type Studio3dToolIconName = (typeof STUDIO_3D_TOOL_ICON_NAMES)[number];

import { createElement, forwardRef } from "react";

import { Studio3dToolIcon } from "./Studio3dToolIcon";

import type { Studio3dToolIconName } from "./studio-3d-tool-icons";
import type { LucideIcon, LucideProps } from "lucide-react";

function createSlotIcon(name: Studio3dToolIconName): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, Omit<LucideProps, "ref">>(function Studio3dSlotIcon(props, ref) {
    return createElement(Studio3dToolIcon, { ...props, name, ref });
  });
  Icon.displayName = `Studio3dToolIcon(${name})`;
  return Icon;
}

/** 명시적 메타 이름과 슬롯 fallback이 같은 컴포넌트를 가리킨다. */
export const STUDIO_3D_TOOL_ICONS = Object.freeze({
  "face-shape": createSlotIcon("face-shape"), eyes: createSlotIcon("eyes"),
  irises: createSlotIcon("irises"), nose: createSlotIcon("nose"),
  mouth: createSlotIcon("mouth"), ears: createSlotIcon("ears"), hair: createSlotIcon("hair"),
  body: createSlotIcon("body"), top: createSlotIcon("top"), bottom: createSlotIcon("bottom"),
  shoes: createSlotIcon("shoes"), accessory: createSlotIcon("accessory"),
  expression: createSlotIcon("expression"), pose: createSlotIcon("pose"),
  "hand-pose": createSlotIcon("hand-pose"), camera: createSlotIcon("camera"),
  scene: createSlotIcon("scene"), "surface-ink": createSlotIcon("surface-ink"),
  layers: createSlotIcon("layers"), export: createSlotIcon("export"), orbit: createSlotIcon("orbit"),
} satisfies Readonly<Record<Studio3dToolIconName, LucideIcon>>);

export { STUDIO_3D_TOOL_ICON_NAMES } from "./studio-3d-tool-icons";

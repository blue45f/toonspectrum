import { createLucideIcon } from "lucide-react";
import { forwardRef } from "react";

import type { Studio3dToolIconName } from "./studio-3d-tool-icons";
import type { LucideProps } from "lucide-react";
import type { ReactNode } from "react";

import "./studio-3d-tool-icons.css";

export type { Studio3dToolIconName } from "./studio-3d-tool-icons";

/** 작은 터치 도구에서도 형태로 구별되는 3D 편집 전용 벡터 아이콘이다. */
const GLYPHS: Readonly<Record<Studio3dToolIconName, ReactNode>> = {
  "face-shape": <><path d="M12 3C7 3 5 5.5 5 9v4c0 3.5 4.5 8 7 8s7-4.5 7-8V9c0-3.5-2-6-7-6Z" /><path d="M8 10h1m6 0h1m-6 6h4" /></>,
  eyes: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  irises: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v2m8 6h-2m-6 8v-2m-8-6h2" /></>,
  nose: <><path d="M10 3c0 4-1 7-3 10-2 3 0 5 2 5m5-15c0 4 1 7 3 10 2 3 0 5-2 5" /><path d="M9 16c0 4 6 4 6 0" /></>,
  mouth: <><path d="M3 12 8 8.5c1.5-1 2.5-.5 4 .5 1.5-1 2.5-1.5 4-.5l5 3.5-5 5c-2.5 2-5.5 2-8 0Z" /><path d="M3 12c5 2 13 2 18 0" /></>,
  ears: <><path d="M7 8a6 6 0 1 1 11 3c-1.5 2-4 2.5-4 5.5a3.5 3.5 0 0 1-7 0" /><path d="M10 8a3 3 0 1 1 5.5 1.5c-1 1.5-4.5 1-4.5 3.5" /></>,
  hair: <><path d="m3.5 20 1-10a7.5 7.5 0 0 1 15 0l1 10-4-1-4 2-4-2Z" /><path d="M12 4c-1 4-3.5 6-6 7m6-7c.5 4 3.5 5 6 6M7 14l-1 4m11-4 1 4" /></>,
  body: <><circle cx="12" cy="4.5" r="2.5" /><path d="M8 9h8l2 6-3 1v5H9v-5l-3-1 2-6Zm4 7v5" /></>,
  top: <><path d="m8 4-6 4 3 5 3-2v10h8V11l3 2 3-5-6-4c-1 3-7 3-8 0Z" /></>,
  bottom: <><path d="M6 3h12l1 18h-6l-1-10-1 10H5Z" /><path d="M6 7h12m-6-4v4" /></>,
  shoes: <><path d="m3 8 4 2 3-3 3 2v4l7 3 1 2v3H3Z" /><path d="M3 18h18m-8-5-2 2" /></>,
  accessory: <path d="m4 4 8 9 8-9m-8 8 4 4-4 5-4-5Z" />,
  expression: <><circle cx="12" cy="12" r="9" /><path d="m7 9 2-1 2 1m2 0 2-1 2 1m-9 5c2 3 6 3 8 0" /></>,
  pose: <><circle cx="13" cy="4" r="2" /><path d="m5 10 5-2 5 2 5-3m-10 1 1 5 4 3 3 5m-7-8-4 4-4 1" /></>,
  "hand-pose": <><path d="M8 11V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-12 0l-4-4a1.5 1.5 0 0 1 2-2l2 2Z" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v14H3Z" /><circle cx="12" cy="13" r="4" /><path d="M18 10h.01" /></>,
  scene: <><path d="m3 7 9-5 9 5v10l-9 5-9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  "surface-ink": <><path d="m3 16 9 5 9-5" /><path d="m9 14 1-4 8-8 3 3-8 8-4 1Zm7-10 3 3" /></>,
  layers: <><path d="m3 7 9-5 9 5-9 5Z" /><path d="m3 12 9 5 9-5m-18 5 9 5 9-5" /></>,
  export: <path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" />,
  orbit: <><path d="M19 4v5h-5M5 20v-5h5" /><path d="M19 9A7.5 7.5 0 0 0 5 6m0 9a7.5 7.5 0 0 0 14 3" /><circle cx="12" cy="12" r="2" /></>,
};

export interface Studio3dToolIconProps extends Omit<LucideProps, "ref" | "name"> {
  readonly name: Studio3dToolIconName;
}

const Studio3dSvg = createLucideIcon("Studio3dTool", []);

/** Lucide의 SVG props·ref·크기·선 굵기 계약을 그대로 재사용한다. */
export const Studio3dToolIcon = forwardRef<SVGSVGElement, Studio3dToolIconProps>(function Studio3dToolIcon(
  { name, size = 20, className, children, ...props }, ref,
) {
  return <Studio3dSvg ref={ref} data-studio-3d-tool-icon={name} size={size} strokeWidth={2}
    className={["studio-3d-tool-icon", className].filter(Boolean).join(" ")}
    aria-hidden="true" focusable="false" {...props}>{GLYPHS[name]}{children}</Studio3dSvg>;
});

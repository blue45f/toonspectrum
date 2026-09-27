import { useId } from "react";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { studioExperienceAssetUrl, studioExperienceAtlas, type StudioExperienceAtlasKind } from "./studio-virtual-space-experience-art";
import "./studio-virtual-space-experience-art-preview.css";

/** 가구·건물 선택과 배치 지도는 장면 렌더러와 같은 원본 프레임을 표시한다. */
export function StudioVirtualExperienceArtPreview({ kind, artStyle, frame: index, className, x, y, width, height, preserveAspectRatio = "xMidYMid meet" }: {
  readonly kind: StudioExperienceAtlasKind;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly frame: number;
  readonly className?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly preserveAspectRatio?: string;
}) {
  const clipId = useId(), atlas = studioExperienceAtlas(kind, artStyle);
  const frame = studioCharacterAtlasGridFrames(atlas)[index];
  return <svg className={["studio-experience-art-preview", className].filter(Boolean).join(" ")}
    x={x} y={y} width={width} height={height} viewBox={frame ? `${frame.x} ${frame.y} ${frame.width} ${frame.height}` : "0 0 1 1"}
    preserveAspectRatio={preserveAspectRatio} overflow="hidden" aria-hidden="true" focusable="false"
    data-experience-atlas={kind} data-experience-frame={index} data-art-style={artStyle}>
    {frame ? <>
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} /></clipPath></defs>
      <image href={studioExperienceAssetUrl(kind, artStyle)} x="0" y="0" width={atlas.width} height={atlas.height} clipPath={`url(#${clipId})`} />
    </> : null}
  </svg>;
}

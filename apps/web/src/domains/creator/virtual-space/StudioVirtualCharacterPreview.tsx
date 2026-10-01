import { useId, type CSSProperties } from "react";
import { studioCharacterStaticAsset } from "./studio-virtual-space-character-assets";
import { studioCharacterPreviewFrame } from "./studio-virtual-space-character-preview";
import type { StudioCharacterMotionState, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import "./studio-virtual-space-character-preview.css";

export function StudioVirtualCharacterPreview({ skin, facing = "down", motion = "idle", frameIndex, className, style, alt = "" }: {
  readonly skin: StudioCharacterSkin;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly motion?: StudioCharacterMotionState;
  /**
   * 표시할 시트 프레임 인덱스 강제 지정 (예: 프로시저럴 시트의 idle 호흡 프레임).
   * 생략하면 skin의 idleFrames/클립에서 계산된 기본 프레임을 사용한다.
   */
  readonly frameIndex?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly alt?: string;
}) {
  const clipId = useId();
  const base = studioCharacterStaticAsset(skin, facing, motion);
  const asset = frameIndex !== undefined && Number.isSafeInteger(frameIndex) && frameIndex >= 0
    ? { ...base, frame: frameIndex }
    : base;
  const classes = ["studio-character-preview", className].filter(Boolean).join(" ");
  if (asset.type === "image" && !skin.sharedAtlas) return <img className={classes} style={style} src={asset.url} alt={alt} draggable={false} decoding="async" />;
  const frame = studioCharacterPreviewFrame(asset);
  return <svg className={classes} style={style} viewBox={frame ? `${frame.x} ${frame.y} ${frame.width} ${frame.height}` : "0 0 1 1"}
    preserveAspectRatio="xMidYMax meet" overflow="hidden" focusable="false" role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined}
    data-character-sheet={skin.key} data-character-art-style={skin.nativeArtStyle} data-character-frame={frame?.index} data-character-invalid={!frame || undefined}>
    {frame && asset.atlas ? <>
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} /></clipPath></defs>
      <image href={asset.url} x="0" y="0" width={asset.atlas.width} height={asset.atlas.height} clipPath={`url(#${clipId})`} />
    </> : null}
  </svg>;
}

import { useId, type CSSProperties } from "react";
import { studioCharacterStaticAsset } from "./studio-virtual-space-character-assets";
import { studioCharacterPreviewFrame } from "./studio-virtual-space-character-preview";
import type { StudioCharacterMotionState, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import "./studio-virtual-space-character-preview.css";

export function StudioVirtualCharacterPreview({ skin, facing = "down", motion = "idle", className, style, alt = "" }: {
  readonly skin: StudioCharacterSkin;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly motion?: StudioCharacterMotionState;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly alt?: string;
}) {
  const clipId = useId();
  const asset = studioCharacterStaticAsset(skin, facing, motion);
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

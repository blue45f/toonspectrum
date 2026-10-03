import { useId, type CSSProperties } from "react";
import { studioCharacterStaticAsset } from "./studio-virtual-space-character-assets";
import { studioCharacterBustFrame, studioCharacterPreviewFrame } from "./studio-virtual-space-character-preview";
import type { StudioCharacterMotionState, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import "./studio-virtual-space-character-preview.css";

export function StudioVirtualCharacterPreview({ skin, facing = "down", motion = "idle", frameIndex, crop = "frame", className, style, alt = "" }: {
  readonly skin: StudioCharacterSkin;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly motion?: StudioCharacterMotionState;
  /**
   * 표시할 시트 프레임 인덱스 강제 지정 (예: 프로시저럴 시트의 idle 호흡 프레임).
   * 생략하면 skin의 idleFrames/클립에서 계산된 기본 프레임을 사용한다.
   */
  readonly frameIndex?: number;
  /**
   * "bust"면 프레임 전체가 아니라 머리·어깨만 잘라 보여 준다(NPC 대화 초상화).
   * atlas형은 viewBox 크롭, 단일 이미지형은 CSS 확대 크롭(studio-character-preview--bust)으로 처리한다.
   */
  readonly crop?: "frame" | "bust";
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly alt?: string;
}) {
  const clipId = useId();
  const base = studioCharacterStaticAsset(skin, facing, motion);
  const asset = frameIndex !== undefined && Number.isSafeInteger(frameIndex) && frameIndex >= 0
    ? { ...base, frame: frameIndex }
    : base;
  const bust = crop === "bust";
  const classes = ["studio-character-preview", bust ? "studio-character-preview--bust" : undefined, className].filter(Boolean).join(" ");
  if (asset.type === "image" && !skin.sharedAtlas) return <img className={classes} style={style} src={asset.url} alt={alt} draggable={false} decoding="async" data-character-crop={bust ? "bust" : undefined} />;
  const frame = studioCharacterPreviewFrame(asset);
  const viewFrame = bust ? studioCharacterBustFrame(asset) : frame;
  return <svg className={classes} style={style} viewBox={viewFrame ? `${viewFrame.x} ${viewFrame.y} ${viewFrame.width} ${viewFrame.height}` : "0 0 1 1"}
    preserveAspectRatio={bust ? "xMidYMid slice" : "xMidYMax meet"} overflow="hidden" focusable="false" role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined}
    data-character-sheet={skin.key} data-character-art-style={skin.nativeArtStyle} data-character-pixel-art={skin.pixelArt}
    data-character-frame={frame?.index} data-character-crop={bust ? "bust" : undefined} data-character-invalid={!frame || undefined}>
    {viewFrame && asset.atlas ? <>
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={viewFrame.x} y={viewFrame.y} width={viewFrame.width} height={viewFrame.height} /></clipPath></defs>
      <image href={asset.url} x="0" y="0" width={asset.atlas.width} height={asset.atlas.height} clipPath={`url(#${clipId})`} />
    </> : null}
  </svg>;
}

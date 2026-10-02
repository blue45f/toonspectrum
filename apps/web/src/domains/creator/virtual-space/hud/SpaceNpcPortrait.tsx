import { memo, useEffect, useState } from "react";

import { StudioVirtualCharacterPreview } from "../StudioVirtualCharacterPreview";
import type { StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import { studioNpcCastSkinByKey } from "../studio-virtual-space-npc-cast";
import { studioNpcPortrait, useSpaceNpcPortraitManifest, type SpaceNpcExpression } from "./space-npc-portrait";

/** 표정 교차 페이드 시간. CSS(.space-npc-portrait__layer)와 같아야 한다. reduced-motion이면 즉시 바뀐다. */
export const SPACE_NPC_PORTRAIT_FADE_MS = 120;

/**
 * NPC 대화 초상화. portraits-v1 이미지를 우선 쓰고, 표정이 바뀌면 이전 표정 위로 새 표정을 교차 페이드한다.
 * 이미지가 없거나 내려받지 못하면 기본 초상화 → 절차(스프라이트) 초상화 순으로 대체한다.
 * alt는 'NPC 초상화'가 아니라 이름·역할이다.
 */
export const SpaceNpcPortrait = memo(function SpaceNpcPortrait({ skinKey, expression, alt, artStyle, size = "lg" }: {
  readonly skinKey: string;
  readonly expression: SpaceNpcExpression;
  readonly alt: string;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly size?: "sm" | "md" | "lg";
}) {
  const manifest = useSpaceNpcPortraitManifest();
  const resolved = studioNpcPortrait(skinKey, expression, manifest);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const src = !resolved ? null : !failed.has(resolved.src) ? resolved.src : !failed.has(resolved.fallbackSrc) ? resolved.fallbackSrc : null;
  // 표정이 바뀐 바로 그 렌더에서 이전 이미지를 아래 층으로 남긴다. 효과(useEffect)로 미루면 새 표정이
  // 한 프레임 불투명하게 보였다가 다시 투명해지며 깜빡인다. 내려받지 못한 이미지는 아래 층으로 남기지 않는다.
  const [layers, setLayers] = useState<{ readonly current: string | null; readonly previous: string | null }>(() => ({ current: src, previous: null }));
  if (layers.current !== src) {
    setLayers({ current: src, previous: src && layers.current && !failed.has(layers.current) ? layers.current : null });
  }
  const previous = layers.current === src ? layers.previous : null;
  useEffect(() => {
    if (!previous) return undefined;
    const timer = globalThis.setTimeout(() => setLayers((value) => value.previous ? { ...value, previous: null } : value), SPACE_NPC_PORTRAIT_FADE_MS + 40);
    return () => globalThis.clearTimeout(timer);
  }, [previous]);
  const markFailed = (value: string) => setFailed((current) => current.has(value) ? current : new Set(current).add(value));
  return <span className="space-npc-portrait" data-size={size} data-expression={resolved?.expression ?? "procedural"}>
    {src ? <>
      {previous ? <img key={`previous:${previous}`} className="space-npc-portrait__layer" data-leaving="true"
        src={previous} alt="" aria-hidden draggable={false} /> : null}
      <img key={src} className="space-npc-portrait__layer" data-entering={previous ? true : undefined}
        src={src} alt={alt} draggable={false} decoding="async" onError={() => markFailed(src)} />
    </> : <StudioVirtualCharacterPreview skin={studioNpcCastSkinByKey(skinKey, artStyle)} alt={alt} className="space-npc-portrait__procedural" />}
  </span>;
});

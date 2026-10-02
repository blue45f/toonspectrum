import { memo } from "react";

import { StudioVirtualCharacterPreview } from "../StudioVirtualCharacterPreview";
import type { StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import { studioNpcCastSkinByKey } from "../studio-virtual-space-npc-cast";
import type { SpaceNpcExpression } from "./space-npc-portrait";

/**
 * NPC 대화 초상화. 별도 일러스트 파일이 아니라, 그 NPC 본인 스프라이트의 정면 프레임을
 * 흉상(머리·어깨)으로 잘라 보여 준다 — 대화창 얼굴이 월드에서 걷는 캐릭터와 항상 같다.
 * 표정은 아트를 바꾸지 않고 data-expression + CSS 몸짓(bounce/pop/tilt)으로만 전한다.
 * alt는 'NPC 초상화'가 아니라 이름·역할이다.
 */
export const SpaceNpcPortrait = memo(function SpaceNpcPortrait({ skinKey, expression, alt, artStyle, size = "lg" }: {
  readonly skinKey: string;
  readonly expression: SpaceNpcExpression;
  readonly alt: string;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly size?: "sm" | "md" | "lg";
}) {
  return <span className="space-npc-portrait" data-size={size} data-expression={expression}>
    <StudioVirtualCharacterPreview skin={studioNpcCastSkinByKey(skinKey, artStyle)} crop="bust" alt={alt} className="space-npc-portrait__bust" />
  </span>;
});

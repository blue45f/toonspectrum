/**
 * 인월드 앱 근접 프레즌스 바인딩 (죽은 동선 배선).
 *
 * `stepStudioAppEmbedPresence` 상태 모델을 아바타 위치에 연결한다.
 * - app 타일 위에 올라가면 그 앱이 열리고, 타일을 벗어나면 닫힌다.
 * - 사용자가 직접 닫으면 같은 타일에 머무는 동안은 다시 열지 않는다
 *   (타일을 벗어나면 억제가 풀린다).
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  CLOSED_STUDIO_APP_EMBED_PRESENCE,
  stepStudioAppEmbedPresence,
  type StudioAppEmbedPresence,
} from "./studio-virtual-space-app-embed";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  STUDIO_TILE_EFFECT_TILE_SIZE,
  studioTileEffectContains,
  type StudioTileEffectDefinition,
  type StudioTileEffectOf,
} from "./studio-virtual-space-tile-effects";

export interface StudioVirtualSpaceAppPresenceBinding {
  /** 지금 열려 있는 app 이펙트. 없으면 null. */
  readonly openEffect: StudioTileEffectOf<"app"> | null;
  /** 사용자가 패널을 직접 닫는다. 같은 타일에서는 다시 열지 않는다. */
  readonly close: () => void;
}

export function useStudioVirtualSpaceAppPresence(
  effects: readonly StudioTileEffectDefinition[],
  position: StudioVirtualSpacePoint | null,
): StudioVirtualSpaceAppPresenceBinding {
  const [presence, setPresence] = useState<StudioAppEmbedPresence>(CLOSED_STUDIO_APP_EMBED_PRESENCE);
  const presenceRef = useRef(presence);
  presenceRef.current = presence;
  /** 사용자가 직접 닫은 이펙트 id. 그 타일 안에 머무는 동안 재오픈을 막는다. */
  const dismissedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!position) return;
    const dismissedId = dismissedIdRef.current;
    if (dismissedId) {
      const dismissed = effects.find((effect) => effect.id === dismissedId);
      if (dismissed && studioTileEffectContains(dismissed, position, STUDIO_TILE_EFFECT_TILE_SIZE)) return;
      dismissedIdRef.current = null;
    }
    const step = stepStudioAppEmbedPresence(presenceRef.current, effects, position, STUDIO_TILE_EFFECT_TILE_SIZE);
    if (step.presence !== presenceRef.current) setPresence(step.presence);
  }, [effects, position]);

  const openEffect = useMemo(() => {
    if (!presence.openEffectId) return null;
    return effects.find(
      (effect): effect is StudioTileEffectOf<"app"> => effect.id === presence.openEffectId && effect.kind === "app",
    ) ?? null;
  }, [effects, presence.openEffectId]);

  return {
    openEffect,
    close: () => {
      if (presenceRef.current.openEffectId) dismissedIdRef.current = presenceRef.current.openEffectId;
      setPresence(CLOSED_STUDIO_APP_EMBED_PRESENCE);
    },
  };
}

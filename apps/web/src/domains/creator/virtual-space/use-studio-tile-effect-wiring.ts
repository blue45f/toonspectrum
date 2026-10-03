import { useCallback, useMemo, useState } from "react";

import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  STUDIO_TILE_EFFECT_TILE_SIZE,
  type StudioTileEffectDefinition,
  type StudioTileEffectTrigger,
} from "./studio-virtual-space-tile-effects";
import { readStudioTileEffects, writeStudioTileEffects } from "./studio-virtual-space-tile-effects-storage";
import { createSilentZone, type StudioSilentZone } from "./studio-virtual-space-silent-zone";

/**
 * 타일 이펙트 배치·실행 배선. 저작은 꾸미기 패널의 타일 이펙트 편집기,
 * 저장은 스코프별 로컬 저장소가 맡는다. 스코프가 바뀌면 저장된 배치를 다시 읽는다.
 * zone(silent)은 silent 구역 파생으로, portal·youtube·weblink 트리거는
 * 캔버스 실행기가 여기로 올려 보낸다. bgm은 기존 BGM 시스템과 충돌해 다루지 않는다.
 */
export function useStudioTileEffectWiring(input: {
  readonly decorationScope: string;
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
}) {
  const { decorationScope, engineBridge } = input;
  const [tileEffectState, setTileEffectState] = useState<{ readonly scope: string; readonly effects: readonly StudioTileEffectDefinition[] }>(
    () => ({ scope: decorationScope, effects: readStudioTileEffects(decorationScope) }),
  );
  const tileEffects = useMemo<readonly StudioTileEffectDefinition[]>(
    () => (tileEffectState.scope === decorationScope ? tileEffectState.effects : readStudioTileEffects(decorationScope)),
    [tileEffectState, decorationScope],
  );
  const changeTileEffects = useCallback((next: readonly StudioTileEffectDefinition[]) => {
    setTileEffectState({ scope: decorationScope, effects: next });
    writeStudioTileEffects(next, decorationScope);
  }, [decorationScope]);
  // 타일 편집기로 배치한 silent 구역도 같은 음소 파이프라인에 태운다.
  const tileSilentZones = useMemo<readonly StudioSilentZone[]>(() => tileEffects.flatMap((effect) => {
    if (effect.kind !== "zone" || effect.zoneTag !== "silent") return [];
    const zone = createSilentZone({
      id: `tile:${effect.id}`,
      name: effect.name,
      rect: {
        x: effect.tileX * STUDIO_TILE_EFFECT_TILE_SIZE.width,
        y: effect.tileY * STUDIO_TILE_EFFECT_TILE_SIZE.height,
        width: effect.width * STUDIO_TILE_EFFECT_TILE_SIZE.width,
        height: effect.height * STUDIO_TILE_EFFECT_TILE_SIZE.height,
      },
    });
    return zone ? [zone] : [];
  }), [tileEffects]);
  const [tileMedia, setTileMedia] = useState<{ readonly title: string; readonly embedUrl: string } | null>(null);
  const handleTileEffectTrigger = useCallback((trigger: StudioTileEffectTrigger) => {
    if (trigger.kind === "portal") {
      if (trigger.tileX === undefined || trigger.tileY === undefined) return;
      const { width, height } = STUDIO_TILE_EFFECT_TILE_SIZE;
      engineBridge.requestTeleport({ x: trigger.tileX * width + width / 2, y: trigger.tileY * height + height / 2 });
      return;
    }
    if (trigger.kind === "youtube") {
      if (trigger.embedUrl) setTileMedia({ title: trigger.effect.name, embedUrl: trigger.embedUrl });
      return;
    }
    if (trigger.kind === "weblink") {
      window.open(trigger.url, "_blank", "noopener,noreferrer");
    }
  }, [engineBridge, setTileMedia]);

  return { tileEffects, changeTileEffects, tileSilentZones, tileMedia, setTileMedia, handleTileEffectTrigger };
}

/**
 * 타일 이펙트 실행 트래커 (죽은 동선 배선).
 *
 * 캔버스 프레임 루프가 매 프레임 호출하는 순수 판정기. 상태는 "직전에 발동한
 * 트리거"와 "직전에 머문 오피스 존"만 들고 있고, 바뀐 순간만 결과를 돌려준다.
 * - 타일 트리거: `resolveTileEffectTrigger` 결과를 키(kind+effect id)로 비교해
 *   진입 시 한 번만 알린다. 같은 타일에 머무는 동안은 반복하지 않는다.
 * - 오피스 존 입장 파티클: `zoneAtPoint`로 존이 바뀌는 순간
 *   `zoneEntryParticles` 스펙을 한 번 돌려준다. 첫 판정은 기준선이라
 *   파티클을 내지 않는다(입장 연출은 "들어오는 순간"에만).
 * 렌더링 자체는 캔버스(Phaser)가 맡고, 이 모듈은 Phaser를 모른다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  zoneAtPoint,
  type StudioOfficeZone,
} from "./studio-virtual-space-office-zones";
import {
  resolveTileEffectTrigger,
  zoneEntryParticles,
  STUDIO_TILE_EFFECT_TILE_SIZE,
  type StudioTileEffectDefinition,
  type StudioTileEffectTrigger,
  type StudioTilePixelSize,
  type StudioZoneEntryParticle,
} from "./studio-virtual-space-tile-effects";

export interface StudioTileEffectRuntimeStep {
  /** 이번 스텝에서 새로 진입한 타일 트리거. 변화가 없으면 null. */
  readonly trigger: StudioTileEffectTrigger | null;
  /** 오피스 존 입장에 붙는 파티클 스펙. 존 진입이 아니거나 reduced motion이면 null. */
  readonly zoneEntryParticle: StudioZoneEntryParticle | null;
  /** 파티클을 재생할 위치(현재 아바타 위치). */
  readonly point: StudioVirtualSpacePoint;
}

export class StudioTileEffectRuntimeTracker {
  private readonly effects: readonly StudioTileEffectDefinition[];
  private readonly officeZones: readonly StudioOfficeZone[];
  private readonly tileSize: StudioTilePixelSize;
  private lastTriggerKey: string | null | undefined;
  private lastOfficeZoneId: string | null | undefined;

  constructor(input: {
    readonly effects: readonly StudioTileEffectDefinition[];
    readonly officeZones: readonly StudioOfficeZone[];
    readonly tileSize?: StudioTilePixelSize;
  }) {
    this.effects = input.effects;
    this.officeZones = input.officeZones;
    this.tileSize = input.tileSize ?? STUDIO_TILE_EFFECT_TILE_SIZE;
  }

  /** 아바타 위치 한 스텝을 판정한다. */
  next(point: StudioVirtualSpacePoint, options: { readonly reducedMotion: boolean }): StudioTileEffectRuntimeStep {
    const trigger = resolveTileEffectTrigger(this.effects, point, this.tileSize);
    const triggerKey = trigger ? `${trigger.kind}:${trigger.effect.id}` : null;
    const triggerChanged = this.lastTriggerKey !== undefined && triggerKey !== this.lastTriggerKey;
    this.lastTriggerKey = triggerKey;

    const officeZone = zoneAtPoint(this.officeZones, point);
    const officeZoneId = officeZone?.id ?? null;
    const zoneEntered = this.lastOfficeZoneId !== undefined && officeZone !== null && officeZoneId !== this.lastOfficeZoneId;
    this.lastOfficeZoneId = officeZoneId;

    return {
      trigger: triggerChanged ? trigger : null,
      zoneEntryParticle: zoneEntered && officeZone
        ? zoneEntryParticles(officeZone.type, { reducedMotion: options.reducedMotion })
        : null,
      point,
    };
  }

  /** 월드·이펙트 구성이 바뀌면 다음 판정을 새 기준선으로 삼는다. */
  reset(): void {
    this.lastTriggerKey = undefined;
    this.lastOfficeZoneId = undefined;
  }
}

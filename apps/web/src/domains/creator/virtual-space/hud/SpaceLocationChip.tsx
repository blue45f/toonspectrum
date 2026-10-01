import { ArrowLeft, Lock } from "lucide-react";
import { memo, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioVirtualCampusZoneMeta } from "../studio-virtual-space-campus-world";
import { SPACE_ZONE_FALLBACK_ICON, SPACE_ZONE_FALLBACK_TONE, SPACE_ZONE_ICONS, SPACE_ZONE_TONE_TOKENS } from "./space-zone-visuals";
import type { SpaceConnectionStatus } from "./use-space-connection-status";

export interface SpaceLocationZone {
  readonly roomId: string | null;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly privateZone: boolean;
}

/**
 * 좌상단 위치 칩: 나가기 · 공간명 · 현재 구역 · 프라이빗 배지 · (프로젝트) 연결 상태.
 * 모바일에서는 같은 정보를 한 줄 알약으로 줄여 보여 준다.
 */
export const SpaceLocationChip = memo(function SpaceLocationChip({ spaceName, zone, connection, compact = false, onExit }: {
  readonly spaceName: string;
  readonly zone: SpaceLocationZone;
  readonly connection?: SpaceConnectionStatus | null;
  readonly compact?: boolean;
  readonly onExit: () => void;
}) {
  const bt = useBilingual("SpaceLocationChip");
  const meta = zone.roomId ? studioVirtualCampusZoneMeta(zone.roomId) : null;
  const Icon = meta ? SPACE_ZONE_ICONS[meta.icon] : SPACE_ZONE_FALLBACK_ICON;
  const tone = meta ? SPACE_ZONE_TONE_TOKENS[meta.tone] : SPACE_ZONE_FALLBACK_TONE;
  const zoneLabel = bt(zone.labelKo, zone.labelEn);
  return <div className="space-location" data-compact={compact || undefined} data-space-interactive="true"
    style={{ "--space-zone-tone": tone } as CSSProperties}>
    <button type="button" className="space-icon-button space-location__exit" onClick={onExit}
      aria-label={bt("가상 스튜디오 나가기", "Leave the virtual studio")} title={bt("나가기", "Leave")}>
      <ArrowLeft size={18} aria-hidden />
    </button>
    <div className="space-location__text">
      {compact ? null : <span className="space-location__space">{spaceName}</span>}
      <strong className="space-location__zone">
        <span className="space-location__zone-icon" aria-hidden><Icon size={14} /></span>
        <span className="sr-only">{bt("현재 위치", "Current location")}: </span>
        {meta?.signEn && !compact ? <span className="space-location__sign" aria-hidden>{meta.signEn}</span> : null}
        <span className="space-location__zone-name">{zoneLabel}</span>
      </strong>
    </div>
    {zone.privateZone ? <span className="space-location__private">
      <Lock size={13} aria-hidden />{bt("프라이빗", "Private")}
    </span> : null}
    {connection && !compact ? <span className="space-location__connection" data-tone={connection.tone}>
      <span className="space-location__dot" aria-hidden />{connection.label}
    </span> : null}
  </div>;
});

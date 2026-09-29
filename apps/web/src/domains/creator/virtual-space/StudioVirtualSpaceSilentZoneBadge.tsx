import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioSilentZone } from "./studio-virtual-space-silent-zone";

export interface StudioVirtualSpaceSilentZoneBadgeProps {
  /** 현재 속한 조용한 구역. null이면 뱃지를 숨긴다. */
  readonly zone: StudioSilentZone | null;
  /** 구역 때문에 음소된 상태인지. */
  readonly mutedByZone: boolean;
}

/**
 * 조용한 구역 안에 있을 때 표시되는 뱃지.
 * 마이크가 자동으로 꺼졌음을 안내한다.
 */
export function StudioVirtualSpaceSilentZoneBadge({ zone, mutedByZone }: StudioVirtualSpaceSilentZoneBadgeProps) {
  const bt = useBilingual("StudioVirtualSpaceSilentZoneBadge");
  if (!zone) return null;
  return (
    <div role="status" aria-label={bt("조용한 구역", "Silent zone")}>
      <strong>{bt("조용한 구역", "Silent zone")}</strong>
      <span> · {zone.name}</span>
      {mutedByZone ? (
        <small>{bt("마이크가 자동으로 꺼졌어요. 구역을 나가면 원래대로 돌아와요.", "Your mic is muted automatically. It restores when you leave.")}</small>
      ) : null}
    </div>
  );
}

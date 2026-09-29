import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  resolveStudioShareBandwidthHint,
  STUDIO_SHARE_BANDWIDTH_HINTS,
  type StudioShareBandwidth,
  type StudioShareRoute,
} from "./studio-virtual-space-bubble-share";

export interface StudioVirtualSpaceShareIndicatorProps {
  readonly sharerLabel: string;
  readonly route: StudioShareRoute;
  readonly bandwidth: StudioShareBandwidth;
  readonly onBandwidthChange?: (bandwidth: StudioShareBandwidth) => void;
}

function routeCopy(route: StudioShareRoute, bt: (ko: string, en: string) => string): string {
  return route === "broadcast" ? bt("전체 방송", "Broadcast") : bt("버블 공유", "Bubble share");
}

function bandwidthCopy(id: StudioShareBandwidth, bt: (ko: string, en: string) => string): string {
  switch (id) {
    case "full": return bt("고화질", "Full quality");
    case "low": return bt("저대역폭", "Low bandwidth");
    default: return bt("표준", "Balanced");
  }
}

/**
 * 화면 공유 중 아바타 상단에 표시되는 말풍선 스타일 표시자.
 * 공유 경로(버블/방송)와 대역폭 스로틀 옵션을 함께 보여준다.
 */
export function StudioVirtualSpaceShareIndicator({
  sharerLabel,
  route,
  bandwidth,
  onBandwidthChange,
}: StudioVirtualSpaceShareIndicatorProps) {
  const bt = useBilingual("StudioVirtualSpaceShareIndicator");
  const hint = resolveStudioShareBandwidthHint(bandwidth);
  return (
    <div role="status" aria-label={bt("화면 공유 중", "Screen sharing")}>
      <strong>{bt("화면 공유 중", "Sharing screen")}</strong>
      <span> · {sharerLabel}</span>
      <span> · {routeCopy(route, bt)}</span>
      <span> · {bandwidthCopy(bandwidth, bt)} ({hint.maxWidth}p/{hint.maxFps}fps)</span>
      {onBandwidthChange ? (
        <label>{bt("대역폭", "Bandwidth")}
          <select
            value={bandwidth}
            onChange={(event) => onBandwidthChange(event.target.value as StudioShareBandwidth)}
            aria-label={bt("대역폭 선택", "Choose bandwidth")}
          >
            {STUDIO_SHARE_BANDWIDTH_HINTS.map((option) => (
              <option key={option.id} value={option.id}>{bandwidthCopy(option.id, bt)}</option>
            ))}
          </select>
        </label>
      ) : null}
      <small>{bt("로컬 미리보기 상태예요. 실제 송출은 연결되지 않았어요.", "Local preview only. Not actually streaming.")}</small>
    </div>
  );
}

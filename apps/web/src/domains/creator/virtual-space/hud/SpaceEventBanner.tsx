import { Sparkles, X } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { SpaceUiBanner } from "./use-space-ui-events";

/** 이벤트 디렉터 배너(환영·타운 이벤트 예고 등). 닫거나 잠시 뒤 스스로 숨는다. */
export const SpaceEventBanner = memo(function SpaceEventBanner({ banner, onDismiss }: {
  readonly banner: SpaceUiBanner | null;
  readonly onDismiss: () => void;
}) {
  const bt = useBilingual("SpaceEventBanner");
  if (!banner) return null;
  return <div key={banner.key} className="space-banner" data-kind="event" data-space-interactive="true" role="status">
    <Sparkles size={16} aria-hidden />
    <strong>{banner.title}</strong>
    {banner.body ? <span>{banner.body}</span> : null}
    <button type="button" className="space-icon-button" onClick={onDismiss} aria-label={bt("배너 닫기", "Dismiss banner")}>
      <X size={16} aria-hidden />
    </button>
  </div>;
});

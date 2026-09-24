import { useEffect, useState } from "react";

import type { EngagementNotification } from "./engagement-model";

/** Keep snoozed notification projections current without reading the clock during render. */
export function useNotificationClock(
  notifications: readonly EngagementNotification[],
): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    let timeoutId: number | undefined;
    const refresh = () => {
      const current = Date.now();
      setNow(current);
      const nextWake = notifications
        .map((item) => item.snoozedUntil ? Date.parse(item.snoozedUntil) : Number.NaN)
        .filter((timestamp) => Number.isFinite(timestamp) && timestamp > current)
        .sort((left, right) => left - right)[0];
      if (nextWake !== undefined) {
        timeoutId = window.setTimeout(refresh, Math.max(100, nextWake - current + 50));
      }
    };
    refresh();
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [notifications]);

  return now;
}

import { EngagementNotificationBell } from "./EngagementNotificationBell";
import { useEngagementNotificationSync } from "./use-engagement-notification-sync";

/** Load the server-backed notification sources in a lazy header chunk. */
export function EngagementHeaderNotifications() {
  useEngagementNotificationSync();
  return <EngagementNotificationBell />;
}

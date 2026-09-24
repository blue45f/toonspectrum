import { useEffect, useState } from "react";

import {
  getAuthUserId,
  listeners,
  type Session,
} from "./auth-session-state";

/**
 * Subscribes directly to the in-memory authentication publication boundary.
 * This makes account switches, logout, token expiry, and cross-tab logout part
 * of the same render that removes private review, share, and delivery state.
 */
export function useAuthActorId(): string | null {
  const [actorId, setActorId] = useState<string | null>(() => getAuthUserId());

  useEffect(() => {
    const published = (next: Session) => setActorId(next?.user.id ?? null);
    listeners.add(published);
    setActorId(getAuthUserId());
    return () => { listeners.delete(published); };
  }, []);

  return actorId;
}

import { useEffect, useRef } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import {
  endGuestSession,
  getGuestIdentity,
} from "@/domains/auth/public/session/guest-session";
import { migrateGuestDataToAccount } from "@/domains/auth/public/session/guest-data-migration";

/**
 * Guest → account handoff.
 *
 * Mounted once near the app root. When an anonymous guest finishes signing
 * in, this moves the browser's guest-namespaced local data
 * (`toonstudio-guest-data:<guestId>:*`) into the new account's namespace
 * (`toonstudio-user-data:<userId>:*`) and then ends the guest session — so
 * nothing the guest made is lost at signup.
 *
 * It never touches the auth flow itself: no redirects, no token handling,
 * no server calls. When there is no guest session (the normal case) it is a
 * no-op.
 */
export function GuestMigrationBridge() {
  const { status, data } = useSession();
  const migratedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || migratedRef.current) return;
    const guest = getGuestIdentity();
    const userId = data.user.id;
    if (!guest || !userId || userId.startsWith("guest_")) return;
    migratedRef.current = true;
    try {
      migrateGuestDataToAccount({ guestId: guest.id, userId });
    } finally {
      endGuestSession();
    }
  }, [status, data]);

  return null;
}

import { useEffect, useRef } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import {
  endGuestSession,
  getGuestIdentity,
} from "@/domains/auth/public/session/guest-session";
import { migrateGuestDataToAccount } from "@/domains/auth/public/session/guest-data-migration";
import { toast } from "@/shared/lib/toast-store";

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
      endGuestSession();
    } catch {
      // 이관이 실패했는데 게스트 세션까지 끝내면 남은 게스트 데이터가 고아가
      // 되고 재시도도 일어나지 않는다. 세션을 유지하고 다시 시도할 수 있게
      // 되돌린 뒤, 실패를 사용자에게 알린다.
      migratedRef.current = false;
      toast("게스트로 만든 내용을 계정으로 옮기지 못했어요. 잠시 뒤 다시 시도해 주세요.", {
        tone: "error",
      });
    }
  }, [status, data]);

  return null;
}

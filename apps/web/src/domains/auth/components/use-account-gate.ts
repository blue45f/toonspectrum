import { useCallback } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useGuestSession } from "@/domains/auth/public/session/guest-session";

import {
  requestAccountNudge,
  type AccountNudgeAction,
} from "./account-nudge-bus";

/**
 * Gate for ownership-requiring actions. Returns true when the caller may
 * proceed (signed in); otherwise shows the nudge dialog and returns false.
 */
export function useAccountGate(): {
  readonly ensureAccount: (action: AccountNudgeAction) => boolean;
} {
  const { status } = useSession();
  const { isGuest } = useGuestSession();

  const ensureAccount = useCallback(
    (action: AccountNudgeAction): boolean => {
      if (status === "authenticated") return true;
      requestAccountNudge({ action, isGuest });
      return false;
    },
    [status, isGuest],
  );

  return { ensureAccount };
}

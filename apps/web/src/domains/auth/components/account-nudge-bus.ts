/**
 * Account-nudge event bus (no components — keeps react-refresh happy).
 *
 * Ownership-requiring actions (save, publish, payment, …) call
 * `requestAccountNudge()` when the visitor isn't signed in; the
 * `AccountNudgeHost` dialog listens on this bus.
 */

export type AccountNudgeAction = "save" | "publish" | "payment" | "comment" | "sync";

export interface AccountNudgeDetail {
  readonly action: AccountNudgeAction;
  readonly isGuest: boolean;
}

export const ACCOUNT_NUDGE_EVENT = "toonstudio:account-nudge-request";

export function requestAccountNudge(detail: AccountNudgeDetail): void {
  if (typeof globalThis.dispatchEvent !== "function") return;
  globalThis.dispatchEvent(
    new CustomEvent<AccountNudgeDetail>(ACCOUNT_NUDGE_EVENT, {
      detail: Object.freeze({ ...detail }),
    }),
  );
}

export function subscribeAccountNudge(
  listener: (detail: AccountNudgeDetail) => void,
): () => void {
  if (typeof globalThis.addEventListener !== "function") return () => undefined;
  const handle = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    listener((event.detail ?? {}) as AccountNudgeDetail);
  };
  globalThis.addEventListener(ACCOUNT_NUDGE_EVENT, handle);
  return () => globalThis.removeEventListener(ACCOUNT_NUDGE_EVENT, handle);
}

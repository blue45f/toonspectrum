export const AUTH_MODAL_REQUEST_EVENT = "toonspectrum:auth-modal-request";

export interface AuthModalRequestDetail {
  readonly reason?: "free-ai" | "protected-action";
  readonly source?: string;
}

export function requestAuthModalOpen(
  detail: AuthModalRequestDetail = { reason: "protected-action" },
): void {
  if (typeof globalThis.dispatchEvent !== "function") return;
  globalThis.dispatchEvent(
    new CustomEvent<AuthModalRequestDetail>(AUTH_MODAL_REQUEST_EVENT, {
      detail: Object.freeze({ ...detail }),
    }),
  );
}

export function subscribeAuthModalRequests(
  listener: (detail: AuthModalRequestDetail) => void,
): () => void {
  if (typeof globalThis.addEventListener !== "function") return () => undefined;
  const handle = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    listener((event.detail ?? {}) as AuthModalRequestDetail);
  };
  globalThis.addEventListener(AUTH_MODAL_REQUEST_EVENT, handle);
  return () => globalThis.removeEventListener(AUTH_MODAL_REQUEST_EVENT, handle);
}

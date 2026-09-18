export const STUDIO_P2P_HUDDLE_OPEN_EVENT = "toonspectrum:studio-p2p-huddle:open";

export interface StudioP2pHuddleOpenDetail {
  readonly peerIds?: readonly string[];
  readonly source?: "virtual-space" | "toolbar" | "unknown";
}

function normalizePeerIds(peerIds: readonly string[] | undefined): readonly string[] | undefined {
  if (!peerIds) return undefined;
  const normalized = [...new Set(
    peerIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => /^[A-Za-z0-9:_-]{1,200}$/u.test(value)),
  )].slice(0, 3);
  return Object.freeze(normalized);
}

export function openStudioP2pHuddle(detail: StudioP2pHuddleOpenDetail = {}): void {
  if (typeof globalThis.dispatchEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent<StudioP2pHuddleOpenDetail>(
    STUDIO_P2P_HUDDLE_OPEN_EVENT,
    {
      detail: {
        ...detail,
        peerIds: normalizePeerIds(detail.peerIds),
        source: detail.source ?? "unknown",
      },
    },
  ));
}

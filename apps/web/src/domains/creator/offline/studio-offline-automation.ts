import type { StudioOfflinePreparationReport } from "@/shared/lib/studio-offline-protocol";

export const STUDIO_OFFLINE_AUTOMATION_EVENT =
  "toonspectrum:studio-offline-automation";
export const STUDIO_OFFLINE_AUTOMATIC_STORAGE_LIMIT = 0.9;

export type StudioOfflineAutomationSkipReason =
  | "already-ready"
  | "data-saver"
  | "document-hidden"
  | "offline"
  | "storage-pressure"
  | "uncontrolled"
  | "unsupported";

export interface StudioOfflineAutomationDecisionInput {
  readonly browserOnline: boolean;
  readonly controlled: boolean;
  readonly documentVisible: boolean;
  readonly offlineReady: boolean | null;
  readonly quota: number | null;
  readonly saveData: boolean;
  readonly supported: boolean;
  readonly usage: number | null;
}

export type StudioOfflineAutomationDecision =
  | { readonly action: "prepare" }
  | { readonly action: "skip"; readonly reason: StudioOfflineAutomationSkipReason };
export function studioOfflineStorageRatio(
  usage: number | null,
  quota: number | null,
): number | null {
  if (usage === null || quota === null || quota <= 0) return null;
  const ratio = usage / quota;
  return Number.isFinite(ratio) && ratio >= 0 ? ratio : null;
}

export function decideStudioOfflineAutomaticPreparation(
  input: StudioOfflineAutomationDecisionInput,
): StudioOfflineAutomationDecision {
  if (!input.supported) return { action: "skip", reason: "unsupported" };
  if (!input.controlled) return { action: "skip", reason: "uncontrolled" };
  if (input.offlineReady === true) return { action: "skip", reason: "already-ready" };
  if (!input.browserOnline) return { action: "skip", reason: "offline" };
  if (!input.documentVisible) return { action: "skip", reason: "document-hidden" };
  if (input.saveData) return { action: "skip", reason: "data-saver" };
  const storageRatio = studioOfflineStorageRatio(input.usage, input.quota);
  if (storageRatio !== null && storageRatio >= STUDIO_OFFLINE_AUTOMATIC_STORAGE_LIMIT) {
    return { action: "skip", reason: "storage-pressure" };
  }
  return { action: "prepare" };
}

export type StudioOfflineAutomationPhase =
  | "checking"
  | "error"
  | "partial"
  | "preparing"
  | "ready"
  | "skipped";
export interface StudioOfflineAutomationDetail {
  readonly message: string;
  readonly phase: StudioOfflineAutomationPhase;
  readonly report?: StudioOfflinePreparationReport;
}

export function isStudioOfflineAutomationDetail(
  value: unknown,
): value is StudioOfflineAutomationDetail {
  if (!value || typeof value !== "object") return false;
  const detail = value as Partial<StudioOfflineAutomationDetail>;
  return typeof detail.message === "string"
    && typeof detail.phase === "string"
    && ["checking", "error", "partial", "preparing", "ready", "skipped"]
      .includes(detail.phase);
}

export function publishStudioOfflineAutomation(
  detail: StudioOfflineAutomationDetail,
): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent<StudioOfflineAutomationDetail>(
    STUDIO_OFFLINE_AUTOMATION_EVENT,
    { detail },
  ));
}

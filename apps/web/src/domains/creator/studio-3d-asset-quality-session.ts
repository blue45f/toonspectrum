/** Admission preference only. Never persist an opt-in or change renderer/device limits. */
export type Studio3dAssetQualityMode = "auto" | "high";

export interface Studio3dAssetQualitySnapshot {
  readonly mode: Studio3dAssetQualityMode;
  readonly notice: string | null;
}

const RISK_MARKER = "toonstudio:bg3d:high-asset-quality-active:v1";
const INITIAL_SNAPSHOT: Studio3dAssetQualitySnapshot = Object.freeze({ mode: "auto", notice: null });
let snapshot = INITIAL_SNAPSHOT;
let initialized = false;
const listeners = new Set<() => void>();

function publish(mode: Studio3dAssetQualityMode, notice: string | null): void {
  if (snapshot.mode === mode && snapshot.notice === notice) return;
  snapshot = Object.freeze({ mode, notice });
  for (const listener of listeners) listener();
}

function writeRiskMarker(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (active) window.sessionStorage.setItem(RISK_MARKER, "1");
    else window.sessionStorage.removeItem(RISK_MARKER);
  } catch {
    // Storage is only a recovery notice. Module state still starts in auto on every page load.
  }
}

export function initializeStudio3dAssetQualitySession(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    if (window.sessionStorage.getItem(RISK_MARKER) === "1") {
      publish("auto", "이전 실행의 고품질 설정을 복원하지 않고 자동 모드로 시작했습니다. 필요하면 저장한 장면 사본을 불러오세요.");
    }
  } catch {
    // Restricted storage must not prevent the safe default.
  }
  writeRiskMarker(false);
}

export function getStudio3dAssetQualityMode(): Studio3dAssetQualityMode {
  return snapshot.mode;
}

export function getStudio3dAssetQualitySnapshot(): Studio3dAssetQualitySnapshot {
  return snapshot;
}

export function getStudio3dAssetQualityServerSnapshot(): Studio3dAssetQualitySnapshot {
  return INITIAL_SNAPSHOT;
}

export function subscribeStudio3dAssetQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The UI must await its scene checkpoint and explicit warning acknowledgement first. */
export function enableStudio3dHighAssetQuality(): void {
  initializeStudio3dAssetQualitySession();
  writeRiskMarker(true);
  publish("high", "현재 실행에서만 고품질 모델 허용 한도를 적용합니다. 새로고침하거나 3D 편집기를 닫으면 자동 모드로 돌아갑니다.");
}

export function resetStudio3dAssetQualityMode(reason?: string): void {
  writeRiskMarker(false);
  publish("auto", reason ?? null);
}

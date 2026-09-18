import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
/** Controlled XR entry. Browser sessions never become document, OPFS or undo data. */
import { Box, Glasses, Loader2, LockKeyhole, ShieldCheck, Square, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { STUDIO_BG3D_CONTROL_BUTTON, studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import type { StudioWebXrMode, StudioWebXrSessionErrorCode, StudioWebXrSessionState, StudioWebXrSupportLevel, StudioWebXrSupportSnapshot } from "../studio-webxr-session";

export interface StudioBg3dImmersivePanelProps {
  readonly support: StudioWebXrSupportSnapshot | null;
  readonly sessionState: StudioWebXrSessionState;
  readonly onStart: (mode: StudioWebXrMode) => void | Promise<unknown>;
  readonly onEnd: () => void | Promise<unknown>;
  readonly supportPending?: boolean;
  readonly disabledReason?: string | null;
  readonly savedShotCount?: number;
}
const MODE_LABELS: Readonly<Record<StudioWebXrMode, string>> = Object.freeze({ "immersive-ar": "AR 미니어처 미리보기", "immersive-vr": "VR 장면 미리보기" });
function modeSupport(support: StudioWebXrSupportSnapshot | null, mode: StudioWebXrMode): StudioWebXrSupportLevel {
  if (!support) return "unknown";
  return mode === "immersive-ar" ? support.immersiveAr : support.immersiveVr;
}
function errorMessage(code: StudioWebXrSessionErrorCode, mode: StudioWebXrMode | null): string {
  switch (code) {
    case "insecure-context": return "HTTPS 보안 연결이 필요합니다. 장면은 그대로 두고 기존 3D 보기에서 계속 작업해 주세요.";
    case "unavailable": return "이 브라우저에는 WebXR API가 없습니다. 최신 지원 브라우저 또는 기기에서 다시 열어 주세요.";
    case "unsupported": return `${mode ? MODE_LABELS[mode] : "선택한 몰입형 모드"}를 이 기기에서 지원하지 않습니다. 기존 3D 보기는 계속 사용할 수 있습니다.`;
    case "busy": return "다른 AR·VR 전환이 진행 중입니다. 전환이 끝난 뒤 다시 시도해 주세요.";
    case "request-failed": return "카메라·헤드셋 권한이 거절됐거나 기기 세션을 시작하지 못했습니다. 브라우저 권한을 확인한 뒤 다시 시도해 주세요.";
    case "renderer-failed": return "3D 렌더러가 WebXR 세션에 연결되지 않아 기존 보기로 돌아왔습니다. 장면 데이터는 바뀌지 않았습니다.";
    case "disposed": return "닫힌 3D 장면에서는 몰입형 미리보기를 시작할 수 없습니다. 편집기를 다시 열어 주세요.";
  }
}
function sessionStatusMessage(sessionState: StudioWebXrSessionState, support: StudioWebXrSupportSnapshot | null, supportPending: boolean, disabledReason: string | null): string {
  if (sessionState.status === "requesting") return `${MODE_LABELS[sessionState.mode]}를 여는 중입니다. 기기의 권한 요청을 확인해 주세요.`;
  if (sessionState.status === "presenting") return `${MODE_LABELS[sessionState.mode]}가 실행 중입니다. 종료하면 기존 3D 편집 보기로 돌아옵니다.`;
  if (sessionState.status === "ending") return `${MODE_LABELS[sessionState.mode]}를 종료하고 기존 3D 보기로 돌아가는 중입니다.`;
  if (sessionState.status === "error") {
    const message = errorMessage(sessionState.code, sessionState.mode);
    if (disabledReason) return `${message} 현재 작업 잠금: ${disabledReason}`;
    if (supportPending) return `${message} 기기 지원 여부를 다시 확인하는 중입니다.`;
    return message;
  }
  if (disabledReason) return disabledReason;
  if (supportPending) return "이 브라우저와 기기의 WebXR 지원 여부를 확인하는 중입니다.";
  if (support && !support.secureContext) return "HTTPS 보안 연결이 없어 AR·VR 미리보기를 시작할 수 없습니다.";
  if (!support) return "아직 기기 지원을 확인하지 않았습니다. 실행하면 브라우저가 선택한 모드를 직접 확인합니다.";
  if (support.immersiveAr === "unsupported" && support.immersiveVr === "unsupported") return "이 기기는 몰입형 AR·VR 모드를 지원하지 않습니다. 기존 3D 미리보기는 그대로 사용할 수 있습니다.";
  if (support.immersiveAr === "unknown" || support.immersiveVr === "unknown") return "일부 모드의 지원 여부를 확인하지 못했습니다. 실행 시 브라우저가 다시 판정합니다.";
  return "사용할 모드를 선택하세요. 브라우저의 카메라·헤드셋 권한 요청은 실행할 때만 표시됩니다.";
}
function supportLabel(level: StudioWebXrSupportLevel): string { return level === "supported" ? "사용 가능" : level === "unsupported" ? "지원 안 함" : "실행 시 확인"; }
function invokeControlledAction(action: () => void | Promise<unknown>): void {
  try { void Promise.resolve(action()).catch(() => undefined); } catch { /* Session authority announces failures. */ }
}
export function StudioBg3dImmersivePanel({ support, sessionState, onStart, onEnd, supportPending = false, disabledReason = null, savedShotCount }: StudioBg3dImmersivePanelProps) {
  const titleId = useId(); const authorityId = useId(); const arDescriptionId = useId(); const vrDescriptionId = useId(); const statusId = useId();
  const [slowProbe, setSlowProbe] = useState(false);
  useEffect(() => {
    if (!supportPending) { setSlowProbe(false); return; }
    const timer = window.setTimeout(() => setSlowProbe(true), 5000);
    return () => window.clearTimeout(timer);
  }, [supportPending]);
  // A stalled capability hint must not trap a user. Known denials and edit/session locks still win.
  // start() invokes requestSession synchronously inside the original click, never from this timer.
  const blockingProbe = supportPending && !slowProbe;
  const arSupport = modeSupport(support, "immersive-ar");
  const vrSupport = modeSupport(support, "immersive-vr");
  const normalizedShotCount = savedShotCount === undefined ? null : Number.isFinite(savedShotCount) ? Math.max(0, Math.floor(savedShotCount)) : 0;
  const transitionActive = sessionState.status === "requesting" || sessionState.status === "ending";
  const sessionActive = sessionState.status === "presenting" || sessionState.status === "ending";
  const activeMode = sessionState.status === "idle" ? null : sessionState.mode;
  const secureContextBlocked = support?.secureContext === false || (sessionState.status === "error" && sessionState.code === "insecure-context");
  const terminalSessionBlocked = sessionState.status === "error" && (sessionState.code === "unavailable" || sessionState.code === "disposed");
  const unsupportedErrorMode = sessionState.status === "error" && sessionState.code === "unsupported" ? sessionState.mode : null;
  const startLocked = blockingProbe || transitionActive || sessionActive || Boolean(disabledReason) || secureContextBlocked || terminalSessionBlocked;
  const arCapabilityBlocked = arSupport === "unsupported" || unsupportedErrorMode === "immersive-ar";
  const vrCapabilityBlocked = vrSupport === "unsupported" || unsupportedErrorMode === "immersive-vr";
  const arDisabled = startLocked || arCapabilityBlocked;
  const vrDisabled = startLocked || vrCapabilityBlocked;
  const liveMessage = sessionStatusMessage(sessionState, support, blockingProbe, disabledReason);
  const alertState = sessionState.status === "error" || secureContextBlocked;
  return (
    <section aria-labelledby={titleId} aria-describedby={authorityId} aria-busy={blockingProbe || transitionActive} className="space-y-4" data-testid="studio-bg3d-immersive-panel">
      <header className="flex items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent/35 bg-accent-soft text-accent" aria-hidden><Glasses size={17} /></span><div className="min-w-0 flex-1"><h3 id={titleId} className="text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "몰입형 장면 미리보기")}</h3><p id={authorityId} className="mt-1 text-[0.7rem] leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "카메라·헤드셋·추적 공간은 현재 브라우저 세션에서만 사용합니다. 프로젝트, OPFS, Undo 기록에는 기기 세션을 저장하지 않으며 3D 장면 원본은 그대로 유지됩니다.")}</p></div></header>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "몰입형 미리보기 모드")}>
        <button type="button" aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "AR 미니어처 미리보기")} aria-describedby={`${arDescriptionId} ${statusId}`} aria-busy={sessionState.status === "requesting" && activeMode === "immersive-ar"} aria-disabled={arDisabled} disabled={startLocked} className={cx("group min-h-28 rounded-xl border p-3 text-left transition-colors", "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", "aria-disabled:cursor-not-allowed aria-disabled:opacity-45 disabled:cursor-not-allowed disabled:opacity-45", activeMode === "immersive-ar" && sessionActive ? "border-accent/60 bg-accent-soft" : "border-line bg-card hover:border-accent/45 hover:bg-raised")} onClick={() => { if (!arDisabled) invokeControlledAction(() => onStart("immersive-ar")); }}>
          <span className="flex items-start justify-between gap-3"><Box size={18} className="shrink-0 text-accent" aria-hidden /><span className={cx("rounded-full border px-2 py-0.5 text-[0.6rem] font-bold", arSupport === "supported" ? "border-good/35 bg-[oklch(0.80_0.15_150/0.10)] text-good" : arSupport === "unsupported" ? "border-bad/35 bg-[oklch(0.66_0.20_25/0.10)] text-bad" : "border-line bg-panel text-fg-3")} aria-hidden>{supportLabel(arSupport)}</span></span>
          <span className="mt-3 block text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "AR 미니어처 미리보기")}</span><span id={arDescriptionId} className="mt-1 block text-[0.68rem] leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "현재 시점 앞 약 2m에 장면을 미니어처로 자동 맞춰 배치합니다.")}{arCapabilityBlocked ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", " 이 기기에서는 AR을 열 수 없습니다.") : ""}</span>
        </button>
        <button type="button" aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "VR 장면 미리보기")} aria-describedby={`${vrDescriptionId} ${statusId}`} aria-busy={sessionState.status === "requesting" && activeMode === "immersive-vr"} aria-disabled={vrDisabled} disabled={startLocked} className={cx("group min-h-28 rounded-xl border p-3 text-left transition-colors", "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", "aria-disabled:cursor-not-allowed aria-disabled:opacity-45 disabled:cursor-not-allowed disabled:opacity-45", activeMode === "immersive-vr" && sessionActive ? "border-accent/60 bg-accent-soft" : "border-line bg-card hover:border-accent/45 hover:bg-raised")} onClick={() => { if (!vrDisabled) invokeControlledAction(() => onStart("immersive-vr")); }}>
          <span className="flex items-start justify-between gap-3"><Glasses size={18} className="shrink-0 text-accent" aria-hidden /><span className={cx("rounded-full border px-2 py-0.5 text-[0.6rem] font-bold", vrSupport === "supported" ? "border-good/35 bg-[oklch(0.80_0.15_150/0.10)] text-good" : vrCapabilityBlocked ? "border-bad/35 bg-[oklch(0.66_0.20_25/0.10)] text-bad" : "border-line bg-panel text-fg-3")} aria-hidden>{supportLabel(vrSupport)}</span></span>
          <span className="mt-3 block text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "VR 장면 미리보기")}</span><span id={vrDescriptionId} className="mt-1 block text-[0.68rem] leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "현재 canonical 카메라 구도를 실제 스케일로 검토합니다.")}{normalizedShotCount !== null && normalizedShotCount > 0 ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", " 저장된 컷 {v0}개는 편집기로 돌아와 전환할 수 있습니다."), { v0: String(normalizedShotCount) }) : translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", " 컷 순회와 공간 Story Stop은 후속 기능입니다.")}{vrCapabilityBlocked ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", " 이 기기에서는 VR을 열 수 없습니다.") : ""}</span>
        </button>
      </div>
      <div id={statusId} role={alertState ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "en", "alert") : translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "en", "status")} aria-live={alertState ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "en", "assertive") : translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "en", "polite")} aria-atomic="true" className={cx("flex min-h-11 items-start gap-2 rounded-lg border px-3 py-2 text-[0.7rem] leading-relaxed", alertState ? "border-bad/40 bg-[oklch(0.66_0.20_25/0.10)] text-fg" : sessionState.status === "presenting" ? "border-accent/45 bg-accent-soft text-fg" : "border-line bg-panel/75 text-fg-2")}>
        {transitionActive || blockingProbe ? <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden /> : alertState ? <TriangleAlert size={14} className="mt-0.5 shrink-0 text-bad" aria-hidden /> : sessionState.status === "presenting" ? <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden /> : <LockKeyhole size={14} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />}
        <span>{liveMessage}</span>
      </div>
      {supportPending && slowProbe && !startLocked && <p className="text-[0.7rem] leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "기기 지원 확인이 지연되고 있습니다. 사용 가능하다는 뜻은 아닙니다. 버튼을 누르면 브라우저가 직접 확인하며, 미지원 기기에서는 기존 3D 보기를 계속 사용할 수 있습니다.")}</p>}
      <details className="rounded-lg border border-line p-3 text-[0.7rem] leading-relaxed text-fg-2"><summary className="cursor-pointer font-semibold">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "편안하게 감상하기")}</summary><p className="mt-2">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "주변 공간을 확보하고 앉은 상태에서 현재 컷부터 확인하세요. 어지러우면 즉시 종료하세요. 이 미리보기는 자동 카메라 이동이나 컷 순회를 시작하지 않습니다. 기기 미지원은 원본 프로젝트에 영향을 주지 않습니다.")}</p></details>
      {sessionActive ? <button type="button" aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "몰입형 미리보기 종료")} aria-describedby={statusId} disabled={sessionState.status === "ending"} className={cx(STUDIO_BG3D_CONTROL_BUTTON, "min-h-11 w-full border-line bg-card text-fg hover:bg-raised")} onClick={() => invokeControlledAction(onEnd)}>{sessionState.status === "ending" ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Square size={13} fill="currentColor" aria-hidden />}{sessionState.status === "ending" ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "종료 중") : translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dImmersivePanel", "ko", "몰입형 미리보기 종료")}</button> : null}
    </section>
  );
}

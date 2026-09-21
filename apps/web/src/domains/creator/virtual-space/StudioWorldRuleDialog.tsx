import { useId, useLayoutEffect, useRef } from "react";
import type { StudioWorldInteractionRule } from "@toonspectrum/studio-project-model/world-publication";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function StudioWorldRuleDialog({ rule, onCancel, onConfirm }: { readonly rule: StudioWorldInteractionRule; readonly onCancel: () => void; readonly onConfirm: () => void }) {
  const bt = useBilingual("StudioWorldRuleDialog"), id = useId(), dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement, element = dialog.current;
    element?.showModal(); cancel.current?.focus();
    const hide = () => { if (document.visibilityState === "hidden") onCancel(); };
    document.addEventListener("visibilitychange", hide);
    return () => { element?.close(); document.removeEventListener("visibilitychange", hide); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [onCancel]);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} className="max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-line bg-card p-5 text-fg backdrop:bg-black/50" data-space-interactive="true" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id={`${id}-title`} className="text-lg font-semibold">{bt("공간 도구 실행 확인", "Confirm world tool action")}</h2>
    <p className="my-3 whitespace-pre-wrap break-words text-sm">{bt(rule.messageKo, rule.messageEn)}</p>
    <p className="mb-3 text-xs text-fg-2">{bt("등록된 도구 화면만 엽니다. 마이크·녹음·AI 실행·공유·결제·권한 변경은 수행하지 않습니다.", "Opens the registered tool only. No microphone, recording, AI execution, sharing, purchase or permission changes are performed.")} · {rule.action}</p>
    <div className="flex flex-wrap gap-2"><button ref={cancel} type="button" className="min-h-11 rounded-lg border border-line px-4" onClick={onCancel}>{bt("취소", "Cancel")}</button>
      <button type="button" className="min-h-11 rounded-lg border border-line px-4" onClick={onConfirm}>{bt("확인하고 도구 열기", "Confirm and open tool")}</button></div>
  </dialog>;
}

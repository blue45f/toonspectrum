import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_WEBGL_RECOVERY_EVENT,
  type StudioBg3dWebglRecoveryNoticeDetail,
} from "./studio-bg3d-webgl-context-recovery";

export function StudioBg3dWebglRecoveryNotice({ hidden = false }: { readonly hidden?: boolean }) {
  const copy = useBilingual("scene3d-webgl-recovery-notice");
  const [notice, setNotice] = useState<StudioBg3dWebglRecoveryNoticeDetail | null>(null);
  useEffect(() => {
    const onRecovery = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as StudioBg3dWebglRecoveryNoticeDetail;
      if (!detail?.owner || typeof detail.retry !== "function") return;
      setNotice((current) => detail.snapshot
        ? detail
        : current?.owner === detail.owner ? null : current);
    };
    window.addEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, onRecovery);
    return () => window.removeEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, onRecovery);
  }, []);
  const phase = notice?.snapshot?.phase;
  if (hidden || !notice || !phase || phase === "healthy" || phase === "restored") return null;
  return (
    <section className="m-2 rounded-lg border border-line bg-panel p-3 text-sm text-fg" aria-label={copy("3D 화면 복구", "3D viewport recovery")}>
      <p role={phase === "failed" ? "alert" : "status"}>
        {phase === "failed"
          ? copy("3D 렌더러 초기화에 실패했습니다. 원본을 유지한 상태로 화면 복구를 다시 시도하세요.", "Renderer initialization failed. Retry viewport recovery with the source preserved.")
          : copy("3D 그래픽 연결이 끊어져 브라우저 복구를 기다리고 있습니다.", "The graphics context was lost. Waiting for browser recovery.")}
      </p>
      {phase === "failed" ? (
        <button type="button" className="mt-2 min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => notice.retry()}>
          {copy("화면 복구 다시 시도", "Retry viewport recovery")}
        </button>
      ) : null}
    </section>
  );
}

import { Camera, CheckCircle2, CircleHelp, LockKeyhole, Mic, Network, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import type { StudioLiveCollaborationContextValue } from "../live/studio-live-collaboration-context";
import { STUDIO_HUDDLE_AVAILABILITY_COPY } from "../live/huddle/studio-p2p-huddle-availability";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { readStudioMediaDiagnostics, studioRtcLiveStatus, type StudioMediaPermission } from "./studio-virtual-space-rtc-diagnostics";

function permissionCopy(value: StudioMediaPermission, bt: (ko: string, en: string) => string): string {
  switch (value) {
    case "granted": return bt("허용됨", "Allowed");
    case "denied": return bt("브라우저에서 차단됨", "Blocked by browser");
    case "prompt": return bt("사용할 때 물어봄", "Ask when used");
    case "unsupported": return bt("지원하지 않음", "Unsupported");
    case "unknown": return bt("아직 요청하지 않음", "Not requested yet");
  }
}

export function StudioVirtualSpaceRtcPanel({ live, entryOnly = false }: { readonly live?: StudioLiveCollaborationContextValue; readonly entryOnly?: boolean }) {
  const bt = useBilingual("StudioVirtualSpaceRtcPanel");
  const [media, setMedia] = useState<Awaited<ReturnType<typeof readStudioMediaDiagnostics>> | null>(null);
  const refresh = () => { void readStudioMediaDiagnostics().then(setMedia); };
  useEffect(refresh, []);
  const status = live ? studioRtcLiveStatus(live) : null;
  const copy = status && status !== "ready" ? STUDIO_HUDDLE_AVAILABILITY_COPY[status] : null;
  return <section className="vs2-panel studio-vspace-rtc-panel" aria-label={bt("실시간 협업 진단", "Live collaboration diagnostics")} data-space-interactive="true">
    <header><div><p><Network size={15} aria-hidden /> LIVE CONNECTION</p><h2>{bt("연결과 장치 상태", "Connection & device status")}</h2></div>
      <button type="button" onClick={refresh} aria-label={bt("상태 다시 확인", "Check again")}><RefreshCw size={15} aria-hidden /></button></header>
    <p>{bt("공간 입장 권한, 실시간 전송 연결, 브라우저 미디어 권한은 서로 다른 상태입니다. 입장만으로 마이크나 카메라 권한을 요청하지 않습니다.", "Space admission, live transport and browser media permission are separate. Entering never requests microphone or camera access.")}</p>
    <div className="studio-vspace-rtc-grid">
      <span data-ok={media?.secureContext || undefined}><LockKeyhole size={15} aria-hidden /><b>HTTPS</b><small>{media?.secureContext ? bt("안전한 주소", "Secure context") : bt("HTTPS 필요", "HTTPS required")}</small></span>
      <span data-ok={media?.webRtcSupported || undefined}><Network size={15} aria-hidden /><b>WebRTC</b><small>{media?.webRtcSupported ? bt("브라우저 지원", "Browser supported") : bt("지원하지 않음", "Unsupported")}</small></span>
      <span data-ok={media?.microphone === "granted" || undefined}><Mic size={15} aria-hidden /><b>{bt("마이크", "Microphone")}</b><small>{media ? permissionCopy(media.microphone, bt) : "…"}</small></span>
      <span data-ok={media?.camera === "granted" || undefined}><Camera size={15} aria-hidden /><b>{bt("카메라", "Camera")}</b><small>{media ? permissionCopy(media.camera, bt) : "…"}</small></span>
    </div>
    {!entryOnly && status ? <div className="studio-vspace-live-status" data-status={status}>
      {status === "ready" ? <CheckCircle2 size={17} aria-hidden /> : status === "connecting" ? <CircleHelp size={17} aria-hidden /> : <TriangleAlert size={17} aria-hidden />}
      <div><strong>{status === "ready" ? bt("실시간 팀 연결 준비됨", "Live team connection ready") : bt(copy?.[0] ?? "연결 상태를 확인해 주세요.", copy?.[1] ?? "Check the connection status.")}</strong>
        {status === "ready" ? <small>{bt("텍스트·P2P 데이터는 준비됐습니다. 회의 참여와 미디어 장치는 각각 명시적으로 선택합니다.", "Text and P2P data are ready. Meeting participation and media devices remain explicit choices.")}</small> : null}</div>
    </div> : null}
  </section>;
}

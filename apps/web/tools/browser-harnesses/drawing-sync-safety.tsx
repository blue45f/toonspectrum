import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext } from "../../src/domains/creator/live/studio-live-collaboration-context";
import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT } from "../../src/domains/creator/live/studio-live-sync-safety";
import { StudioDraftOperationSyncAssistant } from "../../src/domains/creator/StudioDraftOperationSyncAssistant";
import "../../src/app/styles/globals.css";

// 실제 UI만 검증하는 로컬 상태 픽스처이며 계정·원고·서버를 변경하지 않는다.
function Harness() {
  const params = new URL(window.location.href).searchParams;
  const local = params.get("mode") === "local";
  const mobile = params.get("mobile") === "1";
  const [exports, setExports] = useState(0);
  const finish = useRef<(() => void) | null>(null);
  const exportBackup = () => {
    setExports((count) => count + 1);
    return new Promise<void>((resolve) => { finish.current = resolve; });
  };
  return <StudioLiveCollaborationContext.Provider value={{
    ...EMPTY_STUDIO_LIVE_CONTEXT,
    availability: "error",
    mode: local ? "local" : "server",
    sync: {
      ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
      phase: "offline-queued", pendingCount: 3,
      persistenceDurability: "durable", editsDurablyProtected: true,
      operationSyncReady: true, mode: local ? "local" : "server",
    },
  }}>
    <main className="min-h-screen bg-canvas p-3 text-fg">
      <h1 className="text-sm font-bold">드로잉 동기화 UI 회귀 검증</h1>
      <p className="text-xs text-fg-3">테스트 상태 · 실제 서버 승인 검증이 아닙니다.</p>
      <output data-backup-count>{exports}</output>
      <button type="button" className="ml-3 min-h-11 rounded border p-2"
        onClick={() => finish.current?.()}>백업 완료</button>
    </main>
    <StudioDraftOperationSyncAssistant serverRevision={7} hasServerDocument
      localCheckpointCount={3} localRole={local ? "follower" : "leader"}
      collaborationSyncPending={false} hydrated hydrationFailed={false}
      saving={false} mobileImmersive={mobile} onOpenVersions={() => undefined}
      onExportBackup={exportBackup} />
  </StudioLiveCollaborationContext.Provider>;
}

const mount = document.getElementById("test-root");
if (!mount) throw new Error("검증 화면 루트가 없습니다.");
createRoot(mount).render(<Harness />);

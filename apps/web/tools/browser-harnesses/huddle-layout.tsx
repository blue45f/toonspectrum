import { createRoot } from "react-dom/client";

import StudioP2pHuddleLauncher from "../../src/domains/creator/live/huddle/StudioP2pHuddleLauncher";
import { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext } from "../../src/domains/creator/live/studio-live-collaboration-context";

import type { StudioLiveRoom } from "../../src/domains/creator/live/studio-live-collaboration-room";
import "../../src/styles/globals.css";
import "../../src/domains/creator/virtual-space/studio-workspace-live.css";

// Real launcher and workspace CSS; inert transport, no server or device access.
const room = {
  workId: "layout-regression", ready: true, mode: "server",
  participant: { sessionId: "self", role: "editor", displayName: "레이아웃 검증" },
  direct: { getPeers: () => [], send: () => false, subscribe: () => () => undefined },
  subscribe: () => () => undefined, subscribeVoice: () => () => undefined,
} as unknown as StudioLiveRoom;
const failed = new URLSearchParams(location.search).has("failed");
createRoot(document.getElementById("root")!).render(
  <StudioLiveCollaborationContext.Provider value={{ ...EMPTY_STUDIO_LIVE_CONTEXT, room: failed ? null : room,
    canChat: true, serverAvailable: true, mode: "server", availability: failed ? "error" : "ready",
    connectionRecovery: failed ? "waiting" : "idle" }}>
    <div className="vs2-shell vs2-shell--project">
      <header className="vs2-topbar">작업실 · 버튼 배치 검증</header>
      <main className="vs2-world-wrap--live" style={{ gridArea: "world" }} />
      <footer className="workspace-live-status">
        <div className="workspace-live-state">개인 작업실</div>
        <div className="workspace-live-actions" data-space-interactive="true">
          <button type="button">사람·대화</button><button type="button">공간·꾸미기</button>
          <a data-workspace-primary-action="true" href="#new-work">새 작품 만들기</a>
          <StudioP2pHuddleLauncher placement="inline" />
        </div>
      </footer>
    </div>
  </StudioLiveCollaborationContext.Provider>,
);

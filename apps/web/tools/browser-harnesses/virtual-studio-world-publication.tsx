import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { persistSession, SessionContext } from "../../src/compat/auth-session-store";
import { VirtualSpaceExperience } from "../../src/domains/creator/virtual-space/StudioVirtualSpacePage";
import { useStudioWorldPublication } from "../../src/domains/creator/virtual-space/world-publication/use-studio-world-publication";
import "../../src/styles/globals.css";

// Real product experience/Phaser and publication hook; synthetic actor and HTTP only.
// The absent live provider deliberately makes no claim about WAN media or server leases.
if (!import.meta.env.DEV) throw new Error("World publication fixture is development-only");
persistSession({ user: { id: "world-owner", name: "개발 예시 관리자" } });
const host = document.getElementById("test-root");
if (!host) throw new Error("Missing fixture root");
function Fixture() {
  const [actor, setActor] = useState("world-owner");
  const publication = useStudioWorldPublication("world-qa", actor, true);
  return <SessionContext.Provider value={{ data: { user: { id: actor }, token: null }, ready: true, status: "authenticated", update: async () => null }}>
    <BrowserRouter>
      <div className="bg-card p-3 text-sm text-fg">개발용 합성 인증·HTTP 기록 / 실제 공간 화면·이미지·Phaser 전환
        <button type="button" className="ml-3 min-h-11 rounded-lg border border-line px-3" onClick={() => {
          persistSession({ user: { id: "other-actor" } }); setActor("other-actor");
        }}>예시 계정 전환</button>
      </div>
      <VirtualSpaceExperience key={JSON.stringify(["world-qa", actor, publication.snapshot.active?.scope ?? "bundled"])}
        projectId="world-qa" preparing={false} signedIn publication={publication} />
      <output id="fixture-state" className="sr-only">{JSON.stringify({ phase: publication.snapshot.phase,
        revision: publication.snapshot.active?.publication.revisionId ?? null, scope: publication.snapshot.active?.scope ?? null })}</output>
    </BrowserRouter>
  </SessionContext.Provider>;
}
createRoot(host).render(<Fixture />);

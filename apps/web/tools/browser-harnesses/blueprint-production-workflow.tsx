import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { persistSession } from "../../src/domains/auth/public/session/auth-session-state";
import { SessionContext } from "../../src/domains/auth/public/session/auth-session-store";
import { createEmptyProductionWorkspace, type ProductionWorkspace } from "../../src/domains/creator/studio-production/studio-production-workspace-runtime";
import { StudioProductionTaskBoard } from "../../src/domains/creator/studio-production/StudioProductionTaskBoard";
import "../../src/app/styles/globals.css";

// Synthetic task data; only saved view preferences use real local SQLite/OPFS.
// This is neither a real login nor evidence of server authorization or concurrent DB transactions.
const actor = { id: "blueprint-browser", name: "Local fixture", email: null, image: null, role: "creator" as const };
function initial(scopeKey = "work:blueprint-fixture-a"): ProductionWorkspace {
  return { ...createEmptyProductionWorkspace(scopeKey, "2026-09-21T00:00:00Z"), hierarchy: [{id:"episode",parentId:null,kind:"episode",title:"1화",order:0,pageId:null}], tasks: [
    { id:"lineart", title:"선화 원고",owner:"작가",due:"2026-09-21",progress:20,status:"doing",stage:"lineart",hierarchyNodeId:"episode" },
    { id:"color", title:"채색 원고",owner:"채색",due:"2026-09-24",progress:0,status:"todo",stage:"color-background",dependencyIds:["lineart"],hierarchyNodeId:"episode" },
  ] };
}
function Fixture() {
  const [workspace,setWorkspace]=useState(initial), [notice,setNotice]=useState("");
  const commit = async (update: (current: ProductionWorkspace) => ProductionWorkspace) => {
    setWorkspace((current) => ({...update(current),revision:current.revision+1}));
  };
  return <main className="mx-auto max-w-5xl p-3 text-fg">
    <h1 className="mb-2 text-xl font-bold">제작 워크플로 · 로컬 예시</h1>
    <p className="mb-3 text-xs">원고·계정은 합성 예시이며 보기 설정은 실제 기기 저장소에 저장합니다.</p>
    <div className="mb-3 flex flex-wrap gap-2">
      <button type="button" className="min-h-11 border px-3 text-sm" onClick={()=>setWorkspace((w)=>({...w,revision:w.revision+1,tasks:w.tasks.map(t=>({...t}))}))}>동일 작업 새로고침</button>
      <button type="button" className="min-h-11 border px-3 text-sm" onClick={()=>setWorkspace((w)=>({...w,revision:w.revision+1,tasks:w.tasks.map(t=>t.id==="lineart"?{...t,owner:"외부 담당자"}:t)}))}>외부 변경 시뮬레이션</button>
      <button type="button" className="min-h-11 border px-3 text-sm" onClick={()=>{setWorkspace(initial("work:blueprint-fixture-b"));setNotice("다른 작품");}}>다른 작품으로</button>
    </div>
    <p role="status">{notice}</p>
    <StudioProductionTaskBoard workspace={workspace} canEdit canApprove={false} canPublish={false} onCommit={commit} />
  </main>;
}
const host=document.getElementById("test-root"); if(!host) throw new Error("Missing fixture root");
persistSession({user:actor,token:null});
createRoot(host).render(<MemoryRouter><SessionContext.Provider value={{data:{user:actor,token:null},ready:true,status:"authenticated",update:async()=>null}}><Fixture /></SessionContext.Provider></MemoryRouter>);

import { createProductionWorkflowProfile, transitionProductionTaskBatch } from "@toonstudio/contracts/production-workflow";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { createProductionDemoProject } from "../../src/domains/creator/production-hub/production-demo";
import { ProductionReviewWorkspace } from "../../src/domains/creator/production-hub/ProductionReviewWorkspace";
import { ProductionWorkBoard } from "../../src/domains/creator/production-hub/ProductionWorkBoard";
import { initialPromotionDraft } from "../../src/domains/promotion/promotion-draft";
import { preparePromotionCover } from "../../src/domains/promotion/promotion-media";
import { PromotionCoverDropzone } from "../../src/domains/promotion/PromotionCoverDropzone";
import { PromotionReadiness } from "../../src/domains/promotion/PromotionReadiness";

import type { ProductionClientCommand } from "../../src/domains/creator/production-hub/production-api";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import "../../src/app/styles/globals.css";

function initial(): ProductionProjectAggregate {
  const base = createProductionDemoProject();
  const source = base.tasks[0];
  const assignment = base.assignments.find((entry) => entry.status === "active");
  if (!source || !assignment) throw new Error("검증용 예시가 없습니다.");
  return { ...base, workflowProfile: createProductionWorkflowProfile(base.projectId, "solo", "2026-09-28T10:00:00.000Z"),
    tasks: [{ ...source, id: "interaction-ready", title: "콘티 조작 검증", processKey: "story-lock", status: "ready" as const,
      assignmentIds: [assignment.id], reviewerAssignmentIds: [], dependencyTaskIds: [], outputDeliverableIds: [],
      inputRevisionRefs: [{ id: "fixture-input", revision: 1, lineage: "narrative" as const, digest: `sha256:${"b".repeat(64)}`, createdAt: "2026-09-28T10:00:00.000Z" }], briefBlocks: [] }],
  };
}
function Fixture() {
  const [aggregate, setAggregate] = useState(initial);
  const [view, setView] = useState("board");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(() => ({ ...initialPromotionDraft(), title: "신작의 첫 독자를 찾습니다", seriesTitle: "별의 여행", description: "별을 찾아 떠나는 주인공의 새로운 모험을 소개하는 웹툰입니다." }));
  const [busy, setBusy] = useState(false);
  const execute = async (command: ProductionClientCommand, message: string) => {
    if (command.type === "transition-task-batch") {
      const changed = transitionProductionTaskBatch(aggregate, command.transitions, new Date().toISOString());
      setAggregate({ ...aggregate, revision: aggregate.revision + 1, tasks: aggregate.tasks.map((task) => changed.find((next) => next.id === task.id) ?? task) });
    } else if (command.type === "configure-workflow") setAggregate({ ...aggregate, workflowProfile: command.profile, revision: aggregate.revision + 1 });
    else if (command.type === "upsert-clarification") setAggregate({ ...aggregate, clarifications: [...aggregate.clarifications, command.clarification], revision: aggregate.revision + 1 });
    else if (command.type !== "upsert-operations-record") throw new Error("이 조작은 예시 하네스에서 지원하지 않습니다.");
    setNotice(message);
  };
  const upload = async (file: File) => {
    if (busy) return; setBusy(true);
    try { const cover = await preparePromotionCover(file); setDraft((current) => ({ ...current, cover })); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "표지 변환 실패"); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-7xl p-4 text-fg">
    <h1 className="text-xl font-bold">검수·협업·홍보 조작 검증</h1>
    <p className="my-3 text-sm">합성 예시입니다. 로컬 메모리만 변경하며 서버 저장·실제 권한 검증의 증거가 아닙니다.</p>
    <nav aria-label="검증 화면" className="mb-4 flex flex-wrap gap-2">
      {[["board", "협업"], ["review", "검수"], ["promotion", "홍보"]].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} className="min-h-11 rounded-xl border border-line px-4" onClick={() => setView(key!)}>{label}</button>)}
      <button type="button" className="min-h-11 rounded-xl border border-line px-4" onClick={() => { setAggregate(initial()); setNotice(""); }}>예시 초기화</button>
    </nav>
    <p role="status" className="mb-3 text-sm">{notice}</p>
    {view === "board" ? <ProductionWorkBoard aggregate={aggregate} canEdit canManage execute={execute} /> : null}
    {view === "review" ? <ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} /> : null}
    {view === "promotion" ? <section className="mx-auto max-w-2xl">
      <PromotionCoverDropzone cover={draft.cover} busy={busy} disabled={false} onSelect={(file) => void upload(file)} onRemove={() => setDraft({ ...draft, cover: "" })} />
      <label className="mt-4 flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.rightsConfirmed} onChange={(event) => setDraft({ ...draft, rightsConfirmed: event.target.checked })} />예시 게시 권한 확인</label>
      <PromotionReadiness draft={draft} tags="신작,모험" />
    </section> : null}
  </main>;
}
const host = document.getElementById("test-root");
if (!host) throw new Error("검증 화면 컨테이너가 없습니다.");
createRoot(host).render(<MemoryRouter><Fixture /></MemoryRouter>);

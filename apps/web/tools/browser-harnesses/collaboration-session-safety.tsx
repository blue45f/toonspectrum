import { useState } from "react";
import { createRoot } from "react-dom/client";

import { createProductionDemoProject } from "../../src/domains/creator/production-hub/production-demo";
import { ProductionReviewWorkspace } from "../../src/domains/creator/production-hub/ProductionReviewWorkspace";
import { ProductionSessionStatus } from "../../src/domains/creator/production-hub/ProductionSessionStatus";
import { useProductionProjectSession } from "../../src/domains/creator/production-hub/use-production-project-session";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import "../../src/app/styles/globals.css";

// 실제 프로젝트 훅과 HTTP client를 사용하지만 브라우저 검사는 합성 API 응답을 주입한다.
const demo = { create: createProductionDemoProject, reduce: (value: ProductionProjectAggregate) => value };
function Fixture() {
  const [projectId, setProjectId] = useState("qa-project-a"), [actor, setActor] = useState<string | null>("qa-owner");
  const project = useProductionProjectSession(projectId, actor, demo);
  return <main className="mx-auto max-w-7xl p-4 text-fg">
    <h1 className="text-xl font-bold">협업 세션·오류 복구 검증</h1>
    <p className="my-3 text-sm">합성 API 응답 검증입니다. 실제 계정·운영 저장 검증으로 간주하지 않습니다.</p>
    <nav aria-label="검증 조작" className="my-4 flex flex-wrap gap-2">
      <button type="button" className="min-h-11 rounded-xl border border-line px-3" onClick={() => setActor(null)}>계정 로그아웃</button>
      <button type="button" className="min-h-11 rounded-xl border border-line px-3" onClick={() => setProjectId("qa-project-b")}>다른 프로젝트</button>
    </nav>
    <p data-testid="session-state">{project.aggregate ? `${project.aggregate.projectId} r${project.aggregate.revision}` : "프로젝트 데이터 없음"}</p>
    {project.error ? <p role="alert">{project.error}</p> : null}
    {project.notice ? <p role="status">{project.notice}</p> : null}
    {!project.loading && project.aggregate ? <>
      <ProductionSessionStatus revision={project.aggregate.revision} refreshing={project.refreshing} saving={project.saveState === "saving"} onRefresh={project.refresh} />
      <ProductionReviewWorkspace aggregate={project.aggregate} execute={project.executeStrict} canEdit={project.access.edit} roleLens="art" />
    </> : null}
  </main>;
}
const host = document.getElementById("test-root");
if (!host) throw new Error("검증 컨테이너가 없습니다.");
createRoot(host).render(<Fixture />);

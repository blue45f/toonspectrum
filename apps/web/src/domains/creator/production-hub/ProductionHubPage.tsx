import "../studio-shell/creator-workflow-surfaces.css";
import { ChevronDown, Gauge, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { ProductionProcurementSurface, ProductionRightsSurface } from "./ProductionCommercialSurfaces";
import { ProductionActivityWorkspace } from "./ProductionActivityWorkspace";
import { ProductionEpisodeOperationsWorkspace } from "./ProductionEpisodeOperationsWorkspace";
import { ProductionHandoffSurface } from "./ProductionHandoffSurface";
import { ProductionManagementWorkspace } from "./ProductionManagementWorkspace";
import { ProductionManuscriptWorkspace } from "./ProductionManuscriptWorkspace";
import { ProductionOperationsControlWorkspace } from "./ProductionOperationsControlWorkspace";
import { ProductionPlanningSurface } from "./ProductionPlanningSurface";
import { ProductionProjectDashboard } from "./ProductionProjectDashboard";
import { ProductionProjectHeader } from "./ProductionProjectHeader";
import { ProductionProjectNav } from "./ProductionProjectNav";
import { ProductionReviewSurface } from "./ProductionReviewSurface";
import { ProductionRoleWorkspace } from "./ProductionRoleWorkspace";
import { ProductionSampleJourneyGuide } from "./ProductionSampleJourneyGuide";
import { ProductionScheduleWorkspace } from "./ProductionScheduleWorkspace";
import { ProductionSessionStatus } from "./ProductionSessionStatus";
import { ProductionStudioRevisionBridgePanel } from "./ProductionStudioRevisionBridgePanel";
import { ProductionSurfaceHeader } from "./ProductionSurfaceHeader";
import { ProductionTeamSurface } from "./ProductionTeamSurface";
import { ProductionWorkBoard } from "./ProductionWorkBoard";
import type { ProductionClientCommand } from "./production-api";
import type { ProductionProjectAccess } from "./production-dashboard-api";
import { productionDemoAdapter } from "./production-demo-adapter";
import type { ProductionProjectSurface } from "./production-project-surfaces";
import { usePreferredRoleLens } from "./use-preferred-role-lens";
import { useProductionProjectSession } from "./use-production-project-session";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { SitePageArt } from "@/domains/legal/public/site-page-art";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

export type { ProductionProjectSurface } from "./production-project-surfaces";
export { ProductionEpisodeRoomPage } from "./ProductionEpisodeRoomPage";

type ExecuteCommand = (command: ProductionClientCommand, message: string) => Promise<void>;

interface SurfaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
  readonly roleLens: CreatorRoleLens;
  readonly execute: ExecuteCommand;
  readonly executeStrict: ExecuteCommand;
  readonly isDemo: boolean;
  readonly viewerAssignmentIds: readonly string[];
  readonly viewerUserId: string | null;
}

function viewerAssignmentIdsFor(aggregate: ProductionProjectAggregate, userId: string | null): readonly string[] {
  if (!userId) return [];
  const partyIds = new Set(aggregate.parties.filter((party) => party.accountUserId === userId).map((party) => party.id));
  return aggregate.assignments.filter((assignment) => partyIds.has(assignment.partyId)).map((assignment) => assignment.id);
}

/**
 * 개요: 첫 화면은 네 가지 판단(진행률·마감 임박 회차·내 할 일·최근 피드백)만 보여 주고,
 * 위험 예측·복구 시나리오·추천 배정 같은 운영 상세는 펼칠 때만 계산해 그린다.
 */
function OverviewSurface({ aggregate, access, roleLens, execute, executeStrict, isDemo, viewerAssignmentIds }: SurfaceProps) {
  const bt = useBilingual("ProductionOverviewSurface");
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <div className="space-y-4">
      <ProductionProjectDashboard aggregate={aggregate} roleLens={roleLens} viewerAssignmentIds={viewerAssignmentIds} />
      <details
        className="group rounded-2xl border border-line bg-card"
        onToggle={(event) => setDetailOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Gauge className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-fg">{bt("운영 상세 보기", "Operations detail")}</span>
              <span className="block truncate text-xs text-fg-3">{bt("운영 안정도 근거·위험 예측·복구 시나리오·추천 배정·팀 작업량", "Health evidence, risk forecast, recovery scenarios, suggested assignments, workload")}</span>
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        {detailOpen ? (
          <div className="space-y-4 border-t border-line p-4">
            <ProductionManagementWorkspace aggregate={aggregate} roleLens={roleLens} execute={execute} executeRecovery={executeStrict} canEdit={access.edit} />
            <ProductionStudioRevisionBridgePanel aggregate={aggregate} execute={execute} canEdit={access.edit} enabled={!isDemo} />
          </div>
        ) : null}
      </details>
    </div>
  );
}

function BoardSurface({ aggregate, access, roleLens, execute, executeStrict, isDemo, viewerAssignmentIds }: SurfaceProps) {
  const bt = useBilingual("ProductionBoardSurface");
  const [params, setParams] = useSearchParams();
  const roleView = params.get("productionView") === "roles" || (params.has("task") && params.get("productionView") !== "board");
  const views = [
    { id: "board", label: bt("팀 공정 보드", "Team board"), active: !roleView },
    { id: "roles", label: bt("역할별 작업실", "Role workspace"), active: roleView },
  ] as const;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={bt("제작 작업 공간 선택", "Choose a workspace")}>
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-pressed={view.active}
            className={buttonClass({ variant: view.active ? "solid" : "outline", className: "min-h-11" })}
            onClick={() => setParams((previous) => {
              const next = new URLSearchParams(previous);
              next.set("productionView", view.id);
              return next;
            })}
          >
            {view.label}
          </button>
        ))}
      </div>
      {roleView
        ? <ProductionRoleWorkspace aggregate={aggregate} execute={execute} canEdit={access.edit} roleLens={roleLens} />
        : (
          <ProductionWorkBoard
            key={aggregate.projectId}
            aggregate={aggregate}
            execute={executeStrict}
            canEdit={access.edit}
            canManage={access.manage}
            viewerAssignmentIds={viewerAssignmentIds}
            roleLens={roleLens}
            persistOrder={!isDemo}
          />
        )}
    </div>
  );
}

function SurfaceContent({ surface, ...props }: SurfaceProps & { readonly surface: ProductionProjectSurface }) {
  const { aggregate, access, execute, executeStrict, roleLens, isDemo } = props;
  switch (surface) {
    case "overview": return <OverviewSurface {...props} />;
    case "planning": return <ProductionPlanningSurface aggregate={aggregate} execute={execute} canEdit={access.edit} />;
    case "episodes": return <ProductionEpisodeOperationsWorkspace aggregate={aggregate} execute={execute} canEdit={access.edit} />;
    case "manuscripts": return <ProductionManuscriptWorkspace aggregate={aggregate} canEdit={access.edit} isDemo={isDemo} execute={execute} />;
    case "production": return <BoardSurface {...props} />;
    case "schedule": return <ProductionScheduleWorkspace aggregate={aggregate} execute={execute} canEdit={access.edit} />;
    case "control": return <ProductionOperationsControlWorkspace aggregate={aggregate} execute={executeStrict} canEdit={access.edit} canManage={access.manage} />;
    case "handoff": return <ProductionHandoffSurface aggregate={aggregate} roleLens={roleLens} execute={execute} canEdit={access.edit} isDemo={isDemo} />;
    case "review": return <ProductionReviewSurface aggregate={aggregate} execute={executeStrict} canEdit={access.edit} roleLens={roleLens} />;
    case "activity": return <ProductionActivityWorkspace aggregate={aggregate} viewerUserId={props.viewerUserId} viewerAssignmentIds={props.viewerAssignmentIds} />;
    case "procurement": return <ProductionProcurementSurface aggregate={aggregate} />;
    case "rights": return <ProductionRightsSurface aggregate={aggregate} />;
    case "settings": return <ProductionTeamSurface aggregate={aggregate} access={access} />;
  }
}

function ProjectLoading() {
  const bt = useBilingual("ProductionProjectPage");
  return (
    <div data-route-pending="production-project" className="min-h-dvh bg-canvas p-6 text-fg" role="status">
      <div className="mx-auto max-w-5xl animate-pulse space-y-3 rounded-3xl border border-line bg-card p-8 motion-reduce:animate-none">
        <div className="h-4 w-40 rounded bg-raised" />
        <div className="h-8 w-72 rounded bg-raised" />
        <p className="text-sm text-fg-2">{bt("제작 프로젝트를 불러오는 중…", "Loading the production project…")}</p>
      </div>
    </div>
  );
}

function ProjectError({ message, refreshing, onRefresh }: { readonly message: string; readonly refreshing: boolean; readonly onRefresh: () => void }) {
  const bt = useBilingual("ProductionProjectPage");
  return (
    <div data-route-error="production-project" className="min-h-dvh bg-canvas p-6 text-fg">
      <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-bad/30 bg-bad/10 p-6">
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <div>
            <h1 className="font-bold">{bt("프로젝트를 열 수 없습니다", "Can't open this project")}</h1>
            <p className="mt-2 text-sm text-fg-2">{message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={refreshing} onClick={onRefresh} className={buttonClass({ variant: "outline", className: "min-h-11 gap-1.5" })}>
                <RefreshCw className="size-4" aria-hidden="true" />
                {bt("다시 불러오기", "Retry")}
              </button>
              <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to="/production">{bt("제작 관리 홈", "Production home")}</Link>
              <Link className={buttonClass({ variant: "ghost", className: "min-h-11" })} to="/production/projects/sample-project/overview">{bt("샘플 프로젝트 보기", "Open the sample project")}</Link>
            </div>
          </div>
          <SitePageArt
            kind="recovery"
            caption={bt("브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다", "Brand concept art · not an editor capture")}
          />
        </div>
      </div>
    </div>
  );
}

export function ProductionProjectPage({ surface }: { readonly surface: ProductionProjectSurface }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const actorId = useApp((state) => state.userId);
  const project = useProductionProjectSession(projectId, actorId, productionDemoAdapter);
  const [roleLens, setRoleLens] = usePreferredRoleLens("producer");
  const bt = useBilingual("ProductionProjectPage");

  if (!projectId) return <Navigate to="/production" replace />;
  if (project.loading) return <ProjectLoading />;
  if (project.error || !project.aggregate) {
    return (
      <ProjectError
        message={project.error ?? bt("프로젝트 데이터가 없습니다.", "No project data.")}
        refreshing={project.refreshing}
        onRefresh={() => void project.refresh()}
      />
    );
  }

  const aggregate = project.aggregate;
  return (
    <div data-creator-workflow="production-project" data-route-ready="production-project" className="min-h-dvh bg-canvas text-fg">
      <ProductionProjectHeader aggregate={aggregate} access={project.access} roleLens={roleLens} onRoleLensChange={setRoleLens} saveState={project.saveState} isDemo={project.isDemo} />
      <div className="mx-auto grid max-w-[100rem] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ProductionProjectNav projectId={aggregate.projectId} surface={surface} />
        <div className="min-w-0 p-4 sm:p-6">
          {!project.isDemo ? <ProductionSessionStatus revision={aggregate.revision} refreshing={project.refreshing} saving={project.saveState === "saving"} onRefresh={project.refresh} /> : null}
          {project.notice ? (
            <div className={cn("mb-4 rounded-xl border px-3 py-2 text-xs", project.saveState === "error" ? "border-bad/30 bg-bad/10 text-fg" : "border-good/30 bg-good/10 text-fg")} role="status">
              {project.notice}
            </div>
          ) : null}
          {project.isDemo ? <ProductionSampleJourneyGuide location={surface} /> : null}
          <ProductionSurfaceHeader aggregate={aggregate} surface={surface} />
          <SurfaceContent
            surface={surface}
            aggregate={aggregate}
            access={project.access}
            roleLens={roleLens}
            execute={project.execute}
            executeStrict={project.executeStrict}
            isDemo={project.isDemo}
            viewerAssignmentIds={viewerAssignmentIdsFor(aggregate, actorId)}
            viewerUserId={actorId}
          />
        </div>
      </div>
    </div>
  );
}

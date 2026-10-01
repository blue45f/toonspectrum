import { ArrowRight, Box, CheckCircle2, CircleDashed, FlaskConical, Search, ServerCog, Workflow, Wrench } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { StudioProductionJobWorkspace } from "./StudioProductionJobWorkspace";
import { StudioToonBridgeConnectionCard } from "./StudioToonBridgeConnectionCard";
import {
  ProfileSelector,
  ToolchainCategoryIcon,
  ToolchainPageHeader,
  ToolStatusBadge,
  type ToolchainPageMode,
} from "./ToolchainParts";
import {
  admitStudioProductionTool,
  groupStudioProductionTools,
  STUDIO_PRODUCTION_CATEGORIES,
  STUDIO_PRODUCTION_TOOLS,
  type StudioProductionTool,
  type StudioToolchainProfileId,
} from "./studio-production-toolchain";
import {
  categoryEnglish,
  commercialUseLabel,
  countToolStates,
  deploymentLabel,
  maturityLabel,
  resolveStudioToolState,
  TOOL_STATE_HINTS,
  TOOL_STATE_LABELS,
  TOOL_STATE_ORDER,
  type StudioToolState,
} from "./studio-production-toolchain-labels";
import {
  loadStudioToolchainProfile,
  saveStudioToolchainProfile,
} from "./studio-production-toolchain-preferences";
import { projectIdFromSearch, withProject } from "./toolchain-links";
import { useStudioToonBridgeConnection, type StudioToonBridgeConnectionState } from "./useStudioToonBridgeConnection";

const PRIMARY_LINK = "inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SECONDARY_LINK = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-sm font-bold text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type StateFilter = "all" | StudioToolState;

function useToolStates(profile: StudioToolchainProfileId, connection: StudioToonBridgeConnectionState) {
  return useMemo(() => {
    const probeByTool = new Map(connection.probes.map((probe) => [probe.toolId, probe]));
    return new Map(STUDIO_PRODUCTION_TOOLS.map((tool) => [
      tool.id,
      { state: resolveStudioToolState(tool, profile, probeByTool.get(tool.id)), probe: probeByTool.get(tool.id) },
    ]));
  }, [connection.probes, profile]);
}

/** 연결 → 설치 확인 → 작업 실행 세 단계를 현재 상태와 함께 보여 준다. */
function ToolchainStartSteps({
  projectId,
  connected,
  readyCount,
}: {
  readonly projectId: string | null;
  readonly connected: boolean;
  readonly readyCount: number;
}) {
  const bt = useBilingual("ToolchainStartSteps");
  const steps = [
    {
      done: connected,
      title: bt("로컬 실행기 연결", "Connect the local runner"),
      status: connected ? bt("연결됨", "Connected") : bt("연결 필요", "Needs connection"),
      body: bt("외부 도구는 이 컴퓨터의 별도 실행기(ToonBridge)에서 돌아가요.", "External tools run in a separate runner (ToonBridge) on this computer."),
      href: withProject("/studio/engines", projectId),
      action: bt("실행기 연결하기", "Connect the runner"),
    },
    {
      done: readyCount > 0,
      title: bt("설치된 도구 확인", "Check installed tools"),
      status: connected ? bt(`실행 준비 ${readyCount}개`, `${readyCount} ready`) : bt("연결 후 확인", "After connecting"),
      body: bt("도구마다 설치·라이선스·상업 이용 조건을 확인해요.", "Review install status, license and commercial terms per tool."),
      href: withProject("/studio/engines", projectId),
      action: bt("설치 상태 보기", "See install status"),
    },
    {
      done: false,
      title: bt("파일로 작업 실행", "Run a job with files"),
      status: readyCount > 0 ? bt("시작할 수 있어요", "Ready to start") : bt("도구 준비 후", "After tools are ready"),
      body: bt("OCR·벡터화·영상 변환 결과와 영수증이 작업 이력에 남아요.", "OCR, vector and video results stay in job history with receipts."),
      href: withProject("/studio/jobs", projectId),
      action: bt("작업 큐 열기", "Open the job queue"),
    },
  ];
  return (
    <section aria-labelledby="toolchain-steps-title">
      <h2 id="toolchain-steps-title" className="font-display text-xl font-bold text-fg sm:text-2xl">{bt("3단계로 시작하기", "Get started in three steps")}</h2>
      <ol className="mt-4 grid gap-3 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className={cn("flex min-w-0 flex-col rounded-2xl border p-4 sm:p-5", step.done ? "border-good/40 bg-good/8" : "border-line bg-panel/65")}>
            <div className="flex items-center justify-between gap-2">
              <span className={cn("grid size-9 place-items-center rounded-full text-sm font-black", step.done ? "bg-good text-canvas" : "bg-accent-soft text-accent")} aria-hidden="true">
                {step.done ? <CheckCircle2 size={17} /> : index + 1}
              </span>
              <span className={cn("rounded-full px-2.5 py-1 text-[0.7rem] font-bold", step.done ? "bg-good/15 text-fg" : "bg-raised text-fg-2")}>{step.status}</span>
            </div>
            <h3 className="mt-3 text-base font-bold text-fg">{step.title}</h3>
            <p className="mt-1 flex-1 text-xs leading-5 text-fg-3">{step.body}</p>
            <Link href={step.href} className="mt-3 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-1 text-sm font-bold text-accent hover:underline">
              {step.action}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OverviewContent({
  profile,
  projectId,
  connection,
  onProfileChange,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly projectId: string | null;
  readonly connection: StudioToonBridgeConnectionState;
  readonly onProfileChange: (profile: StudioToolchainProfileId) => void;
}) {
  const bt = useBilingual("StudioProductionToolchainPage.overview");
  const groups = useMemo(() => groupStudioProductionTools(profile), [profile]);
  const states = useToolStates(profile, connection);
  const admittedCount = groups.reduce((sum, group) => sum + group.tools.length, 0);
  const readyCount = [...states.values()].filter((entry) => entry.state === "available").length;

  return (
    <>
      <ToolchainPageHeader
        mode="overview"
        projectId={projectId}
        eyebrow="Studio production toolchain"
        title={<>{bt("그리기 이후의 제작을", "Everything after drawing,")}<br className="hidden sm:block" /> {bt("한 흐름으로 연결합니다.", "in one connected flow.")}</>}
        lede={bt("필터·OCR·벡터화·애니메이션·영상·3D·출판·오디오 도구를 원본 앱과 분리된 로컬 실행기로 연결합니다. 외부 도구 결과가 작품 원본이 되지 않으며 결과와 재현 영수증만 프로젝트에 남습니다.", "Filters, OCR, vectorizing, animation, video, 3D, publishing and audio tools connect through a local runner kept apart from the app. External output never replaces your original; only results and reproducible receipts stay with the project.")}
        actions={(
          <>
            <Link href={withProject("/studio/jobs", projectId)} className={PRIMARY_LINK}>
              <Workflow size={17} aria-hidden="true" /> {bt("제작 작업 시작", "Start a production job")} <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link href={withProject("/studio/engines", projectId)} className={SECONDARY_LINK}>
              <ServerCog size={17} aria-hidden="true" /> {bt("설치·라이선스 확인", "Check installs & licenses")}
            </Link>
          </>
        )}
      />

      <ToolchainStartSteps projectId={projectId} connected={connection.connected} readyCount={readyCount} />

      <section aria-labelledby="toolchain-areas-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">Connected workflows</p>
            <h2 id="toolchain-areas-title" className="mt-1 font-display text-xl font-bold text-fg sm:text-2xl">
              {bt("제작 영역별 도구", "Tools by production area")}
            </h2>
            <p className="mt-1 text-xs text-fg-3">
              {bt(`현재 프로필에서 ${admittedCount}개 도구 · ${groups.length}개 영역 · 전체 검토 ${STUDIO_PRODUCTION_TOOLS.length}개`, `${admittedCount} tools in ${groups.length} areas for this profile · ${STUDIO_PRODUCTION_TOOLS.length} reviewed in total`)}
            </p>
          </div>
          <Link href={withProject("/studio/engines", projectId)} className="inline-flex min-h-11 items-center text-xs font-bold text-accent hover:underline">
            {bt("전체 상태 보기", "See every status")}
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <article key={group.id} className="rounded-2xl border border-line bg-panel/55 p-4 sm:p-5" aria-labelledby={`toolchain-area-${group.id}`}>
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
                  <ToolchainCategoryIcon categoryId={group.id} />
                </span>
                <div className="min-w-0">
                  <h3 id={`toolchain-area-${group.id}`} className="font-display text-base font-bold text-fg">{bt(group.name, categoryEnglish(group.id, group.name))}</h3>
                  <p className="text-xs text-fg-3">{bt(`${group.tools.length}개 도구`, `${group.tools.length} tools`)}</p>
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {group.tools.map((tool) => {
                  const state = states.get(tool.id)?.state ?? "unchecked";
                  return (
                    <li key={tool.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-fg-2">
                      <span aria-hidden="true" className={cn("size-1.5 rounded-full", state === "available" ? "bg-good" : state === "connector" ? "bg-cool" : "bg-fg-3")} />
                      {tool.name}
                      <span className="sr-only">· {bt(TOOL_STATE_LABELS[state].ko, TOOL_STATE_LABELS[state].en)}</span>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <ProfileSelector profile={profile} onChange={onProfileChange} />
    </>
  );
}

function ToolCard({ tool, state, reason, version }: { readonly tool: StudioProductionTool; readonly state: StudioToolState; readonly reason: string; readonly version: string | null }) {
  const bt = useBilingual("StudioProductionToolchainPage.tool");
  const deployment = deploymentLabel(tool.deployment);
  const commercial = commercialUseLabel(tool.commercialUse);
  const maturity = maturityLabel(tool.maturity);
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-panel/65 p-4 sm:p-5" aria-labelledby={`tool-${tool.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            {tool.category === "research-nc" ? <FlaskConical size={18} aria-hidden="true" /> : tool.deployment === "connector" ? <Box size={18} aria-hidden="true" /> : <Wrench size={18} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h3 id={`tool-${tool.id}`} className="font-display text-base font-bold text-fg">{tool.name}</h3>
            <p className="mt-1 text-xs leading-5 text-fg-3" lang="ko">{tool.description}</p>
          </div>
        </div>
        <ToolStatusBadge state={state} />
      </div>
      <p className="mt-3 text-xs leading-5 text-fg-2">{bt(TOOL_STATE_HINTS[state].ko, TOOL_STATE_HINTS[state].en)}</p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-fg-3">
        <dt className="font-bold text-fg-2">{bt("실행 위치", "Runs via")}</dt><dd>{bt(deployment.ko, deployment.en)}</dd>
        <dt className="font-bold text-fg-2">{bt("상업 이용", "Commercial use")}</dt><dd>{bt(commercial.ko, commercial.en)}</dd>
        <dt className="font-bold text-fg-2">{bt("라이선스", "License")}</dt><dd>{tool.license}</dd>
        <dt className="font-bold text-fg-2">{bt("성숙도", "Maturity")}</dt><dd>{bt(maturity.ko, maturity.en)}</dd>
        <dt className="font-bold text-fg-2">{bt("상태 근거", "Why")}</dt><dd lang="ko">{reason}</dd>
      </dl>
      {version ? (
        <pre className="mt-3 max-h-20 overflow-auto whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 text-[0.66rem] leading-5 text-fg-3">{version}</pre>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={bt(`${tool.name} 작업`, `${tool.name} operations`)}>
        {tool.operations.map((operation) => (
          <li key={operation.id} className="rounded-md bg-raised px-2 py-1 text-[0.68rem] font-semibold text-fg-3">
            {operation.name}{operation.executable ? "" : bt(" · 연결 예정", " · planned")}
          </li>
        ))}
      </ul>
      <a
        href={tool.source}
        target="_blank"
        rel="noreferrer"
        className="mt-auto inline-flex min-h-11 items-center gap-1 self-start pt-2 text-xs font-bold text-accent hover:underline"
      >
        {bt("원본 프로젝트·라이선스 확인", "Upstream project & license")}
        <span className="sr-only">{bt(" (새 탭)", " (new tab)")}</span>
        <ArrowRight size={13} aria-hidden="true" />
      </a>
    </article>
  );
}

function EngineCenterContent({
  profile,
  projectId,
  connection,
  onProfileChange,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly projectId: string | null;
  readonly connection: StudioToonBridgeConnectionState;
  readonly onProfileChange: (profile: StudioToolchainProfileId) => void;
}) {
  const bt = useBilingual("StudioProductionToolchainPage.engines");
  const states = useToolStates(profile, connection);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const counts = countToolStates([...states.values()].map((entry) => entry.state));
  const visible = STUDIO_PRODUCTION_TOOLS.filter((tool) => {
    const state = states.get(tool.id)?.state ?? "unchecked";
    const matchesState = filter === "all" || state === filter;
    const matchesQuery = !deferredQuery
      || `${tool.name} ${tool.description} ${tool.license}`.toLocaleLowerCase().includes(deferredQuery);
    return matchesState && matchesQuery;
  });
  const categories = STUDIO_PRODUCTION_CATEGORIES
    .map((category) => ({ category, tools: visible.filter((tool) => tool.category === category.id) }))
    .filter((entry) => entry.tools.length > 0);

  return (
    <>
      <ToolchainPageHeader
        mode="engines"
        projectId={projectId}
        eyebrow="Engine & license center"
        title={bt("설치·라이선스 상태", "Installs & licenses")}
        lede={bt("실제 실행 파일을 탐지하고, 직접 번들·로컬 프로세스·외부 서비스·비상업 모듈을 구분합니다. 설치 확인만으로 품질 검증이나 완전 지원을 주장하지 않습니다.", "We detect real executables and separate bundled, local-process, external-service and non-commercial modules. An install check alone never claims quality or full support.")}
        actions={(
          <Link href={withProject("/studio/jobs", projectId)} className={PRIMARY_LINK}>
            {bt("작업 큐 열기", "Open the job queue")} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      />

      <StudioToonBridgeConnectionCard connection={connection} />
      <ProfileSelector profile={profile} onChange={onProfileChange} />

      <section aria-labelledby="engine-tools-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="engine-tools-title" className="font-display text-xl font-bold text-fg sm:text-2xl">{bt("제작 도구 상태", "Tool status")}</h2>
            <p className="mt-1 text-xs text-fg-3">{bt(`${visible.length}/${STUDIO_PRODUCTION_TOOLS.length}개 표시`, `Showing ${visible.length} of ${STUDIO_PRODUCTION_TOOLS.length}`)}</p>
          </div>
          <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-accent sm:w-72">
            <Search size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
            <span className="sr-only">{bt("도구 검색", "Search tools")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={bt("도구 이름·라이선스 검색", "Search name or license")}
              className="min-h-10 w-full min-w-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={bt("상태로 거르기", "Filter by status")}>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={bt("전체", "All")} count={STUDIO_PRODUCTION_TOOLS.length} />
          {TOOL_STATE_ORDER.map((state) => (
            <FilterChip
              key={state}
              active={filter === state}
              onClick={() => setFilter(state)}
              label={bt(TOOL_STATE_LABELS[state].ko, TOOL_STATE_LABELS[state].en)}
              count={counts[state]}
            />
          ))}
        </div>
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-panel/40 px-5 py-10 text-center">
            <CircleDashed size={22} className="mx-auto text-fg-3" aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-fg">{bt("조건에 맞는 도구가 없어요.", "No tools match.")}</p>
            <button type="button" onClick={() => { setFilter("all"); setQuery(""); }} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold text-fg-2 hover:text-fg">
              {bt("필터 초기화", "Reset filters")}
            </button>
          </div>
        ) : categories.map(({ category, tools }) => (
          <section key={category.id} aria-labelledby={`engine-category-${category.id}`}>
            <h3 id={`engine-category-${category.id}`} className="mb-2 flex items-center gap-2 text-sm font-black text-fg-2">
              <span className="text-accent"><ToolchainCategoryIcon categoryId={category.id} size={16} /></span>
              {bt(category.name, categoryEnglish(category.id, category.name))}
              <span className="font-semibold text-fg-3">{tools.length}</span>
            </h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {tools.map((tool) => {
                const entry = states.get(tool.id);
                const state = entry?.state ?? "unchecked";
                return <ToolCard key={tool.id} tool={tool} state={state} reason={toolReason(tool, profile, entry?.probe?.reason)} version={entry?.probe?.version ?? null} />;
              })}
            </div>
          </section>
        ))}
      </section>
    </>
  );
}

function toolReason(tool: StudioProductionTool, profile: StudioToolchainProfileId, probeReason: string | undefined): string {
  return probeReason ?? admitStudioProductionTool(tool, profile).reason;
}

function FilterChip({ active, onClick, label, count }: { readonly active: boolean; readonly onClick: () => void; readonly label: string; readonly count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      <span>{label}</span>
      <span className={cn("rounded-full px-1.5 text-[0.68rem] tabular-nums", active ? "bg-accent text-on-accent" : "bg-raised text-fg-3")}>{count}</span>
    </button>
  );
}

function JobsContent({
  profile,
  projectId,
  connection,
  onProfileChange,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly projectId: string | null;
  readonly connection: StudioToonBridgeConnectionState;
  readonly onProfileChange: (profile: StudioToolchainProfileId) => void;
}) {
  const bt = useBilingual("StudioProductionToolchainPage.jobs");
  return (
    <>
      <ToolchainPageHeader
        mode="jobs"
        projectId={projectId}
        eyebrow="Production queue"
        title={bt("제작 작업 큐", "Production job queue")}
        lede={bt("파일을 현재 컴퓨터의 로컬 실행기로 보내고 결과·해시·라이선스 영수증을 프로젝트별로 보관합니다.", "Send files to the local runner on this computer and keep results, hashes and license receipts per project.")}
      />
      <StudioToonBridgeConnectionCard connection={connection} />
      <StudioProductionJobWorkspace projectId={projectId} profile={profile} connection={connection} />
      <ProfileSelector profile={profile} onChange={onProfileChange} />
    </>
  );
}

function StudioProductionToolchainRoute({ mode }: { readonly mode: ToolchainPageMode }) {
  const location = useLocation();
  const projectId = projectIdFromSearch(location.search);
  const [profile, setProfile] = useState<StudioToolchainProfileId>(loadStudioToolchainProfile);
  const connection = useStudioToonBridgeConnection();

  const changeProfile = (next: StudioToolchainProfileId) => {
    saveStudioToolchainProfile(next);
    setProfile(next);
  };
  const props = { profile, projectId, connection, onProfileChange: changeProfile };

  return (
    <Container size="wide" className="space-y-6 break-keep py-6 sm:space-y-8 sm:py-10 lg:py-12">
      {mode === "overview" ? <OverviewContent {...props} /> : null}
      {mode === "engines" ? <EngineCenterContent {...props} /> : null}
      {mode === "jobs" ? <JobsContent {...props} /> : null}
    </Container>
  );
}

export function StudioProductionToolchainPage() {
  return <StudioProductionToolchainRoute mode="overview" />;
}

export function StudioEngineCenterPage() {
  return <StudioProductionToolchainRoute mode="engines" />;
}

export function StudioProductionJobsPage() {
  return <StudioProductionToolchainRoute mode="jobs" />;
}

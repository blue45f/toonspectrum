import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  CircleSlash2,
  FlaskConical,
  Gauge,
  Layers3,
  LockKeyhole,
  PackageSearch,
  ServerCog,
  Workflow,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";

import { StudioProductionJobWorkspace } from "./StudioProductionJobWorkspace";
import { StudioToonBridgeConnectionCard } from "./StudioToonBridgeConnectionCard";
import {
  admitStudioProductionTool,
  groupStudioProductionTools,
  STUDIO_PRODUCTION_TOOLS,
  STUDIO_TOOLCHAIN_PROFILES,
  type StudioToolchainProfileId,
} from "./studio-production-toolchain";
import {
  loadStudioToolchainProfile,
  saveStudioToolchainProfile,
} from "./studio-production-toolchain-preferences";
import { useStudioToonBridgeConnection } from "./useStudioToonBridgeConnection";

function projectIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("projectId")?.trim();
  return value ? value.slice(0, 160) : null;
}

function withProject(path: string, projectId: string | null): string {
  if (!projectId) return path;
  return `${path}?${new URLSearchParams({ projectId }).toString()}`;
}

function ProfileSelector({
  profile,
  onChange,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly onChange: (profile: StudioToolchainProfileId) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-panel/70 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
          <LockKeyhole size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-base font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "사용 범위 프로필")}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-3 sm:text-sm">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "프로필은 기능 숨김이 아니라 라이선스 경계입니다. 비상업 전용 기능은 Research NC에서만 노출됩니다.")}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        {STUDIO_TOOLCHAIN_PROFILES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={profile === item.id}
            onClick={() => onChange(item.id)}
            className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "en", "min-h-24 rounded-xl border p-3 text-left transition-colors {v0}"), { v0: String(profile === item.id
                ? "border-accent bg-accent-soft/70"
                : "border-line bg-card/70 hover:border-line-strong") })}
          >
            <strong className="text-sm text-fg">{item.name}</strong>
            <span className="mt-1 block text-xs leading-5 text-fg-3">{item.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ToolStatusBadge({ state }: { readonly state: string }) {
  const ready = state === "available";
  const connector = state === "connector";
  return (
    <span className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "en", "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.67rem] font-bold {v0}"), { v0: String(ready
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : connector
          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
          : "bg-raised text-fg-3") })}>
      {ready ? <CheckCircle2 size={12} aria-hidden="true" /> : <CircleSlash2 size={12} aria-hidden="true" />}
      {ready ? translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "실행 준비") : connector ? translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "외부 연결") : state === "manual" ? translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "수동 연결") : state === "blocked" ? translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "프로필 제한") : translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "설치 안 됨")}
    </span>
  );
}

function OverviewContent({
  profile,
  projectId,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly projectId: string | null;
}) {
  const groups = useMemo(() => groupStudioProductionTools(profile), [profile]);
  const admittedCount = groups.reduce((sum, group) => sum + group.tools.length, 0);

  return (
    <>
      <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-gradient-to-br from-panel via-card to-accent-soft/45 p-6 shadow-lg sm:p-9">
        <span aria-hidden="true" className="absolute -right-14 -top-20 size-64 rounded-full border border-accent/20" />
        <div className="relative max-w-4xl">
          <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.16em] text-accent">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "en", "Studio production toolchain")}</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.045em] text-fg sm:text-5xl">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "그리기 이후의 제작을")}<br className="hidden sm:block" /> {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "한 흐름으로 연결합니다.")}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "필터·OCR·벡터화·애니메이션·영상·3D·출판·오디오 도구를 원본 앱과 분리된 로컬 실행기로 연결합니다. 외부 도구 객체가 작품 원본이 되지 않으며 결과와 재현 영수증만 프로젝트에 남습니다.")}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={withProject("/studio/jobs", projectId)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fg px-4 text-sm font-bold text-canvas"
            >
              <Workflow size={17} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "제작 작업 시작 ")}<ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href={withProject("/studio/engines", projectId)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-sm font-bold text-fg-2 hover:text-fg"
            >
              <ServerCog size={17} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "설치·라이선스 확인")}</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Layers3, value: admittedCount, label: "현재 프로필 도구" },
          { icon: PackageSearch, value: groups.length, label: "제작 영역" },
          { icon: Gauge, value: STUDIO_PRODUCTION_TOOLS.length, label: "전체 검토 도구" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-line bg-panel/65 p-4">
              <Icon size={18} className="text-accent" aria-hidden="true" />
              <strong className="mt-3 block font-display text-2xl text-fg">{item.value}</strong>
              <span className="text-xs text-fg-3">{item.label}</span>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="toolchain-areas-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "en", "Connected workflows")}</p>
            <h2 id="toolchain-areas-title" className="mt-1 font-display text-xl font-bold text-fg sm:text-2xl">
              {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "제작 영역별 도구")}</h2>
          </div>
          <Link href={withProject("/studio/engines", projectId)} className="text-xs font-bold text-accent hover:underline">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "전체 상태 보기")}</Link>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <article key={group.id} className="rounded-2xl border border-line bg-panel/55 p-4 sm:p-5">
              <h3 className="font-display text-base font-bold text-fg">{group.name}</h3>
              <p className="mt-1 text-xs text-fg-3">{group.tools.length}{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "개 도구 · 선택한 프로필에서 허용됨")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.tools.map((tool) => (
                  <span key={tool.id} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-fg-2">
                    {tool.name}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function EngineCenterContent({
  profile,
  projectId,
  connection,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly projectId: string | null;
  readonly connection: ReturnType<typeof useStudioToonBridgeConnection>;
}) {
  const probeByTool = useMemo(
    () => new Map(connection.probes.map((probe) => [probe.toolId, probe])),
    [connection.probes],
  );

  return (
    <>
      <section className="rounded-[1.75rem] border border-line bg-gradient-to-br from-panel to-card p-6 shadow-md sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "en", "Engine & license center")}</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-fg sm:text-4xl">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "설치·라이선스 상태")}</h1>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "실제 실행 파일을 탐지하고, 직접 번들·로컬 프로세스·외부 서비스·비상업 모듈을 구분합니다. 설치 확인만으로 품질 검증이나 완전 지원을 주장하지 않습니다.")}</p>
          </div>
          <Link
            href={withProject("/studio/jobs", projectId)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fg px-4 text-sm font-bold text-canvas"
          >
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "작업 큐 열기 ")}<ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <StudioToonBridgeConnectionCard connection={connection} />

      <section className="grid gap-3 lg:grid-cols-2" aria-label={translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "제작 도구 상태")}>
        {STUDIO_PRODUCTION_TOOLS.map((tool) => {
          const admission = admitStudioProductionTool(tool, profile);
          const probe = probeByTool.get(tool.id);
          const state = !admission.allowed
            ? "blocked"
            : probe?.state
              ?? (tool.deployment === "connector" ? "connector" : tool.deployment === "optional-module" ? "blocked" : "missing");
          return (
            <article key={tool.id} className="rounded-2xl border border-line bg-panel/65 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
                    {tool.category === "research-nc" ? <FlaskConical size={18} aria-hidden="true" /> : tool.deployment === "connector" ? <Box size={18} aria-hidden="true" /> : <Wrench size={18} aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-fg">{tool.name}</h2>
                    <p className="mt-1 text-xs leading-5 text-fg-3">{tool.description}</p>
                  </div>
                </div>
                <ToolStatusBadge state={state} />
              </div>

              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-fg-3">
                <dt className="font-bold text-fg-2">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "라이선스")}</dt><dd>{tool.license}</dd>
                <dt className="font-bold text-fg-2">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "실행 경계")}</dt><dd>{tool.deployment}</dd>
                <dt className="font-bold text-fg-2">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "상업 이용")}</dt><dd>{tool.commercialUse}</dd>
                <dt className="font-bold text-fg-2">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "상태 근거")}</dt><dd>{probe?.reason ?? admission.reason}</dd>
              </dl>

              {probe?.version ? (
                <pre className="mt-3 max-h-20 overflow-auto whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 text-[0.66rem] leading-5 text-fg-3">
                  {probe.version}
                </pre>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {tool.operations.map((operation) => (
                  <span key={operation.id} className="rounded-md bg-raised px-2 py-1 text-[0.68rem] font-semibold text-fg-3">
                    {operation.name}{operation.executable ? "" : translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", " · 연결 예정")}
                  </span>
                ))}
              </div>
              <a
                href={tool.source}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-accent hover:underline"
              >
                {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "원본 프로젝트·라이선스 확인 ")}<ArrowRight size={13} aria-hidden="true" />
              </a>
            </article>
          );
        })}
      </section>
    </>
  );
}

type ToolchainPageMode = "overview" | "engines" | "jobs";

function StudioProductionToolchainRoute({ mode }: { readonly mode: ToolchainPageMode }) {
  const location = useLocation();
  const projectId = projectIdFromSearch(location.search);
  const [profile, setProfile] = useState<StudioToolchainProfileId>(loadStudioToolchainProfile);
  const connection = useStudioToonBridgeConnection();

  const changeProfile = (next: StudioToolchainProfileId) => {
    saveStudioToolchainProfile(next);
    setProfile(next);
  };

  return (
    <Container size="wide" className="space-y-5 py-6 sm:space-y-6 sm:py-10 lg:py-12">
      {mode === "overview" ? <OverviewContent profile={profile} projectId={projectId} /> : null}
      {mode === "engines" ? (
        <EngineCenterContent
          profile={profile}
          projectId={projectId}
          connection={connection}
        />
      ) : null}
      {mode === "jobs" ? (
        <>
          <section className="rounded-[1.75rem] border border-line bg-gradient-to-br from-panel to-card p-6 shadow-md sm:p-8">
            <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "en", "Production queue")}</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-fg sm:text-4xl">{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "제작 작업 큐")}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
              {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPage", "ko", "파일을 현재 컴퓨터의 로컬 실행기로 보내고 결과·해시·라이선스 영수증을 프로젝트별로 보관합니다.")}</p>
          </section>
          <StudioToonBridgeConnectionCard connection={connection} />
          <StudioProductionJobWorkspace
            projectId={projectId}
            profile={profile}
            connection={connection}
          />
        </>
      ) : null}
      <ProfileSelector profile={profile} onChange={changeProfile} />
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

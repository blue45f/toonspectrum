import {
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleAlert,
  FileText,
  Gauge,
  Mic2,
  Plus,
  Trash2,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { aggregateStudioAnalytics, type StudioAnalyticsEventType } from "../studio-analytics";
import { planStudioAutomationRecipe } from "../studio-automation-recipe";
import { auditStudioPresentation } from "../studio-presentation-layout";
import { analyzeStudioProductionPipeline, type StudioProductionTaskStatus } from "../studio-production-pipeline";
import { analyzeStudioStoryContinuity } from "../studio-story-bible";
import { planStudioStoryboard, type StudioStoryBeatKind } from "../studio-storyboard-planner";
import { planStudioTemplateApplication } from "../studio-template-system";
import { buildStudioMotionSchedule, planStudioVoiceRegeneration } from "../studio-voice-motion";
import {
  STUDIO_WEBTOON_3D_PASSES,
  planStudioWebtoon3dRender,
  type StudioWebtoon3dPass,
} from "../studio-webtoon-3d-render";
import { analyzeStudioWebtoonQuality } from "../studio-webtoon-quality";
import type { StudioProjectSection } from "../studio-project-views";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { useStudioProjectFeatureSuite } from "./useStudioProjectFeatureSuite";
import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

type Locale = "ko" | "en";
type ResultStatus = "ready" | "review" | "blocked" | "pass" | "warning";

const FIELD_CLASS =
  "min-h-10 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

const NEXT_TASK_STATUS: Readonly<Record<StudioProductionTaskStatus, StudioProductionTaskStatus>> = {
  backlog: "ready",
  ready: "in-progress",
  "in-progress": "review",
  blocked: "ready",
  review: "done",
  done: "done",
};

function safeResult<T>(factory: () => T): T | null {
  try {
    return factory();
  } catch {
    return null;
  }
}

function statusLabel(status: ResultStatus, locale: Locale): string {
  const labels: Record<ResultStatus, Record<Locale, string>> = {
    ready: { ko: "준비됨", en: "Ready" },
    review: { ko: "확인 필요", en: "Review" },
    blocked: { ko: "수정 필요", en: "Blocked" },
    pass: { ko: "문제 없음", en: "Pass" },
    warning: { ko: "확인 필요", en: "Warning" },
  };
  return labels[status][locale];
}

function StatusBadge({ status, locale }: { readonly status: ResultStatus; readonly locale: Locale }) {
  return (
    <span className={cn(
      "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-bold",
      status === "ready" || status === "pass"
        ? "border-success/30 bg-success-soft/20 text-success"
        : status === "blocked"
          ? "border-danger/30 bg-danger-soft/20 text-danger"
          : "border-warning/35 bg-warning-soft/20 text-warning",
    )}>
      {statusLabel(status, locale)}
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  readonly icon: LucideIcon;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-fg">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="text-[0.65rem] font-semibold text-fg-3">{label}</p>
      <b className="mt-1 block truncate text-lg text-fg">{value}</b>
    </div>
  );
}

function OverviewSuite({
  projectId,
  locale,
  view,
}: {
  readonly projectId: string;
  readonly locale: Locale;
  readonly view: string;
}) {
  const suite = useStudioProjectFeatureSuite(projectId, locale);
  const state = suite.state;
  const report = useMemo(
    () => state ? safeResult(() => aggregateStudioAnalytics(state.analyticsEvents)) : null,
    [state],
  );
  const episode = report?.episodes[0] ?? null;

  const record = (type: StudioAnalyticsEventType) => {
    const now = new Date().toISOString();
    suite.update((current) => ({
      ...current,
      analyticsEvents: [
        ...current.analyticsEvents,
        {
          id: `analytics:${type}:${Date.now()}`,
          type,
          projectId,
          episodeId: "episode:1",
          locale: "ko-KR",
          anonymousSessionId: "anon:project-preview",
          occurredAt: now,
          value: type === "scroll-depth" ? 0.92 : null,
          amountMinor: null,
          currency: null,
        },
      ],
    }));
  };

  if (!state) {
    return <p className="text-sm text-fg-2">{suite.error ?? (locale === "ko" ? "성과 데이터를 준비하고 있습니다." : "Preparing project analytics.")}</p>;
  }

  return (
    <FeatureCard
      icon={BarChart3}
      eyebrow={view === "activity" ? "ACTIVITY" : "PROJECT SIGNALS"}
      title={locale === "ko" ? "제작과 공개 결과를 한눈에" : "Production and audience signals together"}
      description={locale === "ko"
        ? "플랫폼에서 가져온 데이터와 제작 비용을 한 프로젝트 기준으로 합칩니다. 연결 전에는 예제 데이터로 흐름을 확인할 수 있습니다."
        : "Combine platform metrics and production costs per project. Sample data demonstrates the workflow before connectors are enabled."}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={locale === "ko" ? "순 방문자" : "Unique readers"} value={episode?.uniqueReaders ?? 0} />
        <Metric label={locale === "ko" ? "완독률" : "Completion"} value={`${Math.round((episode?.completionRate ?? 0) * 100)}%`} />
        <Metric label={locale === "ko" ? "평균 스크롤" : "Average scroll"} value={`${Math.round((episode?.averageMaxScrollDepth ?? 0) * 100)}%`} />
        <Metric label={locale === "ko" ? "반응" : "Reactions"} value={episode?.reactions ?? 0} />
        <Metric label={locale === "ko" ? "순수익" : "Net"} value={new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
          style: "currency",
          currency: episode?.currency ?? "KRW",
          maximumFractionDigits: 0,
        }).format(episode?.netMinor ?? 0)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => record("episode-open")} className={buttonClass({ variant: "outline", size: "sm" })}>
          {locale === "ko" ? "미리보기 열기 기록" : "Record preview open"}
        </button>
        <button type="button" onClick={() => record("scroll-depth")} className={buttonClass({ variant: "outline", size: "sm" })}>
          {locale === "ko" ? "스크롤 확인 기록" : "Record scroll check"}
        </button>
        <button type="button" onClick={() => record("episode-complete")} className={buttonClass({ size: "sm" })}>
          {locale === "ko" ? "완독 기록" : "Record completion"}
        </button>
      </div>
      {suite.error ? <p role="alert" className="mt-3 text-xs font-semibold text-danger">{suite.error}</p> : null}
    </FeatureCard>
  );
}

function StorySuite({
  projectId,
  locale,
  view,
}: {
  readonly projectId: string;
  readonly locale: Locale;
  readonly view: string;
}) {
  const suite = useStudioProjectFeatureSuite(projectId, locale);
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const state = suite.state;
  const workspaceState = workspace.state;
  const [kind, setKind] = useState<StudioStoryBeatKind>("dialogue");
  const [summary, setSummary] = useState("");
  const [dialogue, setDialogue] = useState("");

  const storyboard = useMemo(
    () => state ? safeResult(() => planStudioStoryboard(state.storyBeats)) : null,
    [state],
  );
  const continuity = useMemo(() => workspaceState
    ? safeResult(() => analyzeStudioStoryContinuity(
      workspaceState.story.bible,
      workspaceState.story.states,
      workspaceState.story.transitions,
    ))
    : null, [workspaceState]);

  const addBeat = () => {
    if (!summary.trim()) return;
    suite.update((current) => ({
      ...current,
      storyBeats: [
        ...current.storyBeats,
        {
          id: `beat:${Date.now()}`,
          sceneId: `scene:${Math.max(1, new Set(current.storyBeats.map((beat) => beat.sceneId)).size)}`,
          order: current.storyBeats.length,
          kind,
          summary: summary.trim(),
          dialogue: dialogue.trim(),
          characterIds: kind === "transition" ? [] : ["character:lead"],
          locationId: "location:opening",
        },
      ],
    }));
    setSummary("");
    setDialogue("");
  };

  const removeBeat = (id: string) => {
    suite.update((current) => ({
      ...current,
      storyBeats: current.storyBeats
        .filter((beat) => beat.id !== id)
        .map((beat, order) => ({ ...beat, order })),
    }));
  };

  if (!state) return null;
  const showPlanner = ["overview", "episodes", "script"].includes(view);
  const showContinuity = ["overview", "characters", "world", "timeline", "relations", "references"].includes(view);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {showPlanner ? (
        <FeatureCard
          icon={FileText}
          eyebrow="STORYBOARD"
          title={locale === "ko" ? "대본에서 컷 계획 만들기" : "Plan panels from story beats"}
          description={locale === "ko"
            ? "장면의 목적과 대사를 입력하면 샷 크기·카메라·말풍선 여백·스크롤 간격을 제안합니다. 원고는 자동으로 변경하지 않습니다."
            : "Story beats produce shot, camera, dialogue-space and scroll-gap suggestions without changing the manuscript."}
        >
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
            <select value={kind} onChange={(event) => setKind(event.target.value as StudioStoryBeatKind)} className={FIELD_CLASS} aria-label={locale === "ko" ? "장면 종류" : "Beat kind"}>
              <option value="setup">{locale === "ko" ? "도입" : "Setup"}</option>
              <option value="dialogue">{locale === "ko" ? "대화" : "Dialogue"}</option>
              <option value="action">{locale === "ko" ? "행동" : "Action"}</option>
              <option value="reaction">{locale === "ko" ? "반응" : "Reaction"}</option>
              <option value="reveal">{locale === "ko" ? "반전·공개" : "Reveal"}</option>
              <option value="transition">{locale === "ko" ? "전환" : "Transition"}</option>
            </select>
            <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={locale === "ko" ? "장면에서 일어나는 핵심 사건" : "What happens in this beat"} className={FIELD_CLASS} />
          </div>
          <div className="mt-2 flex gap-2">
            <input value={dialogue} onChange={(event) => setDialogue(event.target.value)} placeholder={locale === "ko" ? "선택 사항: 주요 대사" : "Optional dialogue"} className={FIELD_CLASS} />
            <button type="button" onClick={addBeat} disabled={!summary.trim()} className={buttonClass({ className: "shrink-0 gap-1.5" })}>
              <Plus size={15} aria-hidden="true" />
              {locale === "ko" ? "추가" : "Add"}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {state.storyBeats.map((beat) => (
              <div key={beat.id} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3">
                <span className="mt-0.5 rounded-full bg-accent-soft px-2 py-1 text-[0.62rem] font-black text-accent">{beat.order + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-fg">{beat.summary}</p>
                  {beat.dialogue ? <p className="mt-1 truncate text-xs text-fg-3">“{beat.dialogue}”</p> : null}
                </div>
                <button type="button" onClick={() => removeBeat(beat.id)} disabled={state.storyBeats.length <= 1} aria-label={locale === "ko" ? "장면 삭제" : "Remove beat"} className={buttonClass({ variant: "quiet", size: "icon" })}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {storyboard ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label={locale === "ko" ? "예상 컷" : "Planned shots"} value={storyboard.shots.length} />
              <Metric label={locale === "ko" ? "예상 원고 높이" : "Estimated height"} value={`${storyboard.estimatedCanvasHeightPx.toLocaleString()}px`} />
              <Metric label={locale === "ko" ? "확인할 항목" : "Warnings"} value={storyboard.warnings.length} />
            </div>
          ) : null}
        </FeatureCard>
      ) : null}

      {showContinuity ? (
        <FeatureCard
          icon={Workflow}
          eyebrow="CONTINUITY"
          title={locale === "ko" ? "설정과 장면 연결 확인" : "Check story continuity"}
          description={locale === "ko"
            ? "캐릭터 의상·외형·부상·소품·알고 있는 정보·장소가 장면 사이에서 설명 없이 바뀌는지 검사합니다."
            : "Detect unexplained changes in costume, appearance, injuries, props, knowledge and location."}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label={locale === "ko" ? "캐릭터" : "Characters"} value={workspaceState?.story.bible.characters.length ?? 0} />
            <Metric label={locale === "ko" ? "장소" : "Locations"} value={workspaceState?.story.bible.locations.length ?? 0} />
            <Metric label={locale === "ko" ? "설정 사실" : "Facts"} value={workspaceState?.story.bible.facts.length ?? 0} />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-panel p-3">
            <div>
              <b className="text-sm text-fg">{locale === "ko" ? "연속성 검사 결과" : "Continuity result"}</b>
              <p className="mt-1 text-xs text-fg-3">
                {continuity
                  ? (locale === "ko"
                    ? `오류 ${continuity.blockingCount}개 · 확인 ${continuity.warningCount}개`
                    : `${continuity.blockingCount} blocking · ${continuity.warningCount} warnings`)
                  : (locale === "ko" ? "스토리 데이터를 준비하고 있습니다." : "Preparing story data.")}
              </p>
            </div>
            {continuity ? <StatusBadge status={continuity.status} locale={locale} /> : null}
          </div>
          {continuity?.issues.slice(0, 4).map((issue) => (
            <p key={`${issue.code}:${issue.toSceneId}`} className="mt-2 rounded-xl border border-warning/25 bg-warning-soft/10 px-3 py-2 text-xs leading-5 text-fg-2">
              {locale === "ko" ? issue.messageKo : issue.messageEn}
            </p>
          ))}
        </FeatureCard>
      ) : null}
    </div>
  );
}

function ProductionPipeline({ projectId, locale }: { readonly projectId: string; readonly locale: Locale }) {
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const workspaceState = workspace.state;
  const report = useMemo(
    () => workspaceState ? safeResult(() => analyzeStudioProductionPipeline(workspaceState.productionTasks)) : null,
    [workspaceState],
  );

  const advance = (taskId: string) => {
    workspace.update((current) => ({
      ...current,
      productionTasks: current.productionTasks.map((task) => task.id === taskId
        ? {
          ...task,
          status: NEXT_TASK_STATUS[task.status],
          blockedReason: task.status === "blocked" ? null : task.blockedReason,
        }
        : task),
    }));
  };

  if (!workspaceState || !report) return null;
  return (
    <FeatureCard
      icon={Workflow}
      eyebrow="PRODUCTION"
      title={locale === "ko" ? "제작 단계와 병목 관리" : "Production stages and bottlenecks"}
      description={locale === "ko"
        ? "대본부터 출력까지 의존 관계와 담당 작업량을 계산하고, 다음으로 진행 가능한 작업을 바로 표시합니다."
        : "Calculate dependencies and workload from story through export, then surface tasks that can move next."}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={locale === "ko" ? "전체 진행" : "Overall progress"} value={`${Math.round(report.progress * 100)}%`} />
        <Metric label={locale === "ko" ? "바로 시작 가능" : "Ready now"} value={report.readyTaskIds.length} />
        <Metric label={locale === "ko" ? "막힌 작업" : "Blocked"} value={report.dependencyBlockedTaskIds.length} />
      </div>
      <div className="mt-4 space-y-2">
        {workspaceState.productionTasks.map((task) => (
          <div key={task.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[0.62rem] font-black uppercase tracking-wide text-accent">{task.stage}</p>
              <b className="mt-1 block truncate text-sm text-fg">{task.title}</b>
              <p className="mt-1 text-xs text-fg-3">{task.status} · {task.estimateHours}h</p>
            </div>
            <button type="button" onClick={() => advance(task.id)} disabled={task.status === "done"} className={buttonClass({ variant: "outline", size: "sm" })}>
              {task.status === "done"
                ? (locale === "ko" ? "완료" : "Done")
                : (locale === "ko" ? "다음 단계" : "Advance")}
            </button>
          </div>
        ))}
      </div>
    </FeatureCard>
  );
}

function QualityPanel({ projectId, locale }: { readonly projectId: string; readonly locale: Locale }) {
  const suite = useStudioProjectFeatureSuite(projectId, locale);
  const state = suite.state;
  const report = useMemo(
    () => state ? safeResult(() => analyzeStudioWebtoonQuality(state.quality)) : null,
    [state],
  );
  if (!state || !report) return null;

  const updateBalloon = (id: string, key: "fontSize" | "readingOrder", value: number) => {
    suite.update((current) => ({
      ...current,
      quality: {
        ...current.quality,
        balloons: current.quality.balloons.map((balloon) => balloon.id === id
          ? { ...balloon, [key]: value }
          : balloon),
      },
    }));
  };

  return (
    <FeatureCard
      icon={Gauge}
      eyebrow="WEBTOON QUALITY"
      title={locale === "ko" ? "모바일 가독성과 스크롤 리듬" : "Mobile readability and scroll rhythm"}
      description={locale === "ko"
        ? "작품을 자동 수정하지 않고 글자 크기·읽기 순서·말풍선 겹침·장면 전환 간격을 검사합니다."
        : "Inspect text size, reading order, balloon overlap and scene spacing without changing artwork."}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <Metric label={locale === "ko" ? "품질 점수" : "Quality score"} value={report.score} />
          <Metric label={locale === "ko" ? "수정 필요" : "Blocking"} value={report.blockingCount} />
          <Metric label={locale === "ko" ? "확인 필요" : "Warnings"} value={report.warningCount} />
        </div>
        <StatusBadge status={report.blockingCount > 0 ? "blocked" : report.warningCount > 0 ? "review" : "ready"} locale={locale} />
      </div>
      <div className="mt-4 space-y-2">
        {state.quality.balloons.map((balloon) => (
          <div key={balloon.id} className="grid gap-2 rounded-xl border border-line bg-card p-3 sm:grid-cols-[1fr_7rem_7rem]">
            <div className="min-w-0">
              <b className="block truncate text-sm text-fg">{balloon.text}</b>
              <p className="mt-1 text-xs text-fg-3">{balloon.cutId} · {balloon.kind}</p>
            </div>
            <label className="text-[0.65rem] font-bold text-fg-3">
              {locale === "ko" ? "글자 크기" : "Font size"}
              <input type="number" min={8} max={72} value={balloon.fontSize} onChange={(event) => updateBalloon(balloon.id, "fontSize", Number(event.target.value))} className={`${FIELD_CLASS} mt-1`} />
            </label>
            <label className="text-[0.65rem] font-bold text-fg-3">
              {locale === "ko" ? "읽기 순서" : "Reading order"}
              <input type="number" min={1} value={balloon.readingOrder ?? 1} onChange={(event) => updateBalloon(balloon.id, "readingOrder", Number(event.target.value))} className={`${FIELD_CLASS} mt-1`} />
            </label>
          </div>
        ))}
      </div>
      {report.findings.slice(0, 4).map((finding) => (
        <p key={`${finding.code}:${finding.targetIds.join(":")}`} className={cn(
          "mt-2 rounded-xl border px-3 py-2 text-xs leading-5",
          finding.severity === "error"
            ? "border-danger/30 bg-danger-soft/10 text-danger"
            : "border-warning/25 bg-warning-soft/10 text-fg-2",
        )}>
          {locale === "ko" ? finding.messageKo : finding.messageEn}
        </p>
      ))}
    </FeatureCard>
  );
}

function RenderAndMotionPanel({ projectId, locale }: { readonly projectId: string; readonly locale: Locale }) {
  const suite = useStudioProjectFeatureSuite(projectId, locale);
  const state = suite.state;
  const renderPlan = useMemo(
    () => state ? safeResult(() => planStudioWebtoon3dRender(state.render3d.scene, state.render3d.request)) : null,
    [state],
  );
  const voicePlan = useMemo(() => state
    ? safeResult(() => planStudioVoiceRegeneration({
      profiles: state.voiceMotion.profiles,
      lines: state.voiceMotion.lines,
      existingSegments: state.voiceMotion.segments,
      commercialUse: true,
      now: new Date().toISOString(),
    }))
    : null, [state]);
  const schedule = useMemo(
    () => state ? safeResult(() => buildStudioMotionSchedule(state.voiceMotion.cues)) : null,
    [state],
  );
  if (!state || !renderPlan || !voicePlan || !schedule) return null;

  const togglePass = (pass: StudioWebtoon3dPass) => {
    suite.update((current) => {
      const selected = current.render3d.request.passes.includes(pass);
      const passes = selected
        ? current.render3d.request.passes.filter((item) => item !== pass)
        : [...current.render3d.request.passes, pass];
      if (passes.length === 0) return current;
      return {
        ...current,
        render3d: {
          ...current.render3d,
          request: { ...current.render3d.request, passes },
        },
      };
    });
  };

  const updateVoiceText = (value: string) => {
    suite.update((current) => ({
      ...current,
      voiceMotion: {
        ...current.voiceMotion,
        lines: current.voiceMotion.lines.map((line, index) => index === 0
          ? { ...line, text: value, revision: line.revision + 1 }
          : line),
      },
    }));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <FeatureCard
        icon={Boxes}
        eyebrow="3D RENDER"
        title={locale === "ko" ? "웹툰용 3D 분리 출력" : "Webtoon-ready 3D render passes"}
        description={locale === "ko"
          ? "카메라·조명·권리·장면 부담을 검사하고 색·선화·그림자·깊이·마스크를 편집 가능한 레이어로 계획합니다."
          : "Check camera, lighting, rights and scene load, then plan editable color, line, shadow, depth and mask layers."}
      >
        <div className="flex flex-wrap gap-2">
          {STUDIO_WEBTOON_3D_PASSES.map((pass) => {
            const selected = state.render3d.request.passes.includes(pass);
            return (
              <button key={pass} type="button" onClick={() => togglePass(pass)} className={cn(
                "min-h-10 rounded-full border px-3 text-xs font-bold transition-colors",
                selected ? "border-accent/50 bg-accent-soft text-accent" : "border-line bg-panel text-fg-3 hover:text-fg",
              )}>
                {pass}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label={locale === "ko" ? "상태" : "Status"} value={statusLabel(renderPlan.status, locale)} />
          <Metric label={locale === "ko" ? "미리보기" : "Preview mode"} value={renderPlan.mode} />
          <Metric label={locale === "ko" ? "생성 레이어" : "Layers"} value={renderPlan.layers.length} />
        </div>
        {renderPlan.findings.map((finding) => (
          <p key={finding} className="mt-2 rounded-xl border border-warning/25 bg-warning-soft/10 px-3 py-2 text-xs text-fg-2">{finding}</p>
        ))}
      </FeatureCard>

      <FeatureCard
        icon={Mic2}
        eyebrow="VOICE & MOTION"
        title={locale === "ko" ? "대사와 장면 타이밍 연결" : "Connect dialogue, voice and motion timing"}
        description={locale === "ko"
          ? "대사가 바뀐 구간만 다시 생성하고, 음성 권리와 출처 문구를 확인한 뒤 장면 타이밍을 계산합니다."
          : "Regenerate only changed dialogue, verify voice rights and attribution, and calculate scene timing."}
      >
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "대표 대사" : "Sample dialogue"}
          <textarea value={state.voiceMotion.lines[0]?.text ?? ""} onChange={(event) => updateVoiceText(event.target.value)} rows={3} className={`${FIELD_CLASS} mt-2 py-2`} />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label={locale === "ko" ? "다시 생성" : "Regenerate"} value={voicePlan.regenerateLineIds.length} />
          <Metric label={locale === "ko" ? "재사용" : "Reuse"} value={voicePlan.reuseLineIds.length} />
          <Metric label={locale === "ko" ? "전체 길이" : "Duration"} value={`${Math.round((schedule.at(-1)?.endMs ?? 0) / 100) / 10}s`} />
        </div>
        {voicePlan.blockingIssues.map((issue) => (
          <p key={`${issue.code}:${issue.lineId}`} className="mt-2 rounded-xl border border-danger/30 bg-danger-soft/10 px-3 py-2 text-xs text-danger">{issue.code}</p>
        ))}
      </FeatureCard>
    </div>
  );
}

function DesignTemplatePanel({ projectId, locale }: { readonly projectId: string; readonly locale: Locale }) {
  const suite = useStudioProjectFeatureSuite(projectId, locale);
  const state = suite.state;
  const templatePlan = useMemo(
    () => state ? safeResult(() => planStudioTemplateApplication(state.design.template, state.design.values)) : null,
    [state],
  );
  const presentation = useMemo(
    () => state ? safeResult(() => auditStudioPresentation(state.design.slides)) : null,
    [state],
  );
  if (!state || !templatePlan || !presentation) return null;
  const titleValue = state.design.values.title;
  const title = titleValue?.kind === "text" ? titleValue.value : "";

  const updateTitle = (value: string) => {
    suite.update((current) => ({
      ...current,
      design: {
        ...current.design,
        values: { ...current.design.values, title: { kind: "text", value } },
        slides: current.design.slides.map((slide, slideIndex) => slideIndex === 0
          ? {
            ...slide,
            title: value || slide.title,
            blocks: slide.blocks.map((block) => block.kind === "title" ? { ...block, text: value || block.text } : block),
          }
          : slide),
      },
    }));
  };

  return (
    <FeatureCard
      icon={WandSparkles}
      eyebrow="TEMPLATE & PRESENTATION"
      title={locale === "ko" ? "템플릿을 구조적으로 적용" : "Apply structured templates"}
      description={locale === "ko"
        ? "텍스트·이미지·색상 슬롯과 사용 권리를 확인하고, 발표 자료의 글자 크기·겹침·레이아웃을 함께 검사합니다."
        : "Validate text, image, color slots and rights, then audit presentation type size, overlap and layout."}
    >
      <label className="text-xs font-bold text-fg-2">
        {locale === "ko" ? "작품 제목" : "Project title"}
        <input value={title} onChange={(event) => updateTitle(event.target.value)} className={`${FIELD_CLASS} mt-2`} />
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label={locale === "ko" ? "템플릿" : "Template"} value={statusLabel(templatePlan.status, locale)} />
        <Metric label={locale === "ko" ? "빈 슬롯" : "Missing slots"} value={templatePlan.missingSlotIds.length} />
        <Metric label={locale === "ko" ? "발표 검사" : "Presentation"} value={statusLabel(presentation.status, locale)} />
        <Metric label={locale === "ko" ? "권장 배치" : "Suggested layout"} value={Object.values(presentation.recommendedLayoutBySlide)[0] ?? "-"} />
      </div>
      {[...templatePlan.findings, ...presentation.findings].slice(0, 5).map((finding, index) => (
        <p key={`${"slotId" in finding ? finding.slotId : finding.slideId}:${finding.code}:${index}`} className="mt-2 rounded-xl border border-warning/25 bg-warning-soft/10 px-3 py-2 text-xs text-fg-2">
          {"messageKo" in finding ? (locale === "ko" ? finding.messageKo : finding.messageEn) : finding.code}
        </p>
      ))}
    </FeatureCard>
  );
}

function AutomationPanel({ projectId, locale }: { readonly projectId: string; readonly locale: Locale }) {
  const suite = useStudioProjectFeatureSuite(projectId, locale);
  const state = suite.state;
  const plan = useMemo(() => state
    ? safeResult(() => planStudioAutomationRecipe(
      state.automation.recipe,
      state.automation.recipe.steps.map((step) => step.commandId),
      state.automation.context,
    ))
    : null, [state]);
  if (!state || !plan) return null;

  const toggleConfirmation = (stepId: string) => {
    suite.update((current) => {
      const currentIds = current.automation.context.confirmedStepIds;
      const confirmedStepIds = currentIds.includes(stepId)
        ? currentIds.filter((id) => id !== stepId)
        : [...currentIds, stepId];
      return {
        ...current,
        automation: {
          ...current.automation,
          context: { ...current.automation.context, confirmedStepIds },
        },
      };
    });
  };

  return (
    <FeatureCard
      icon={WandSparkles}
      eyebrow="AUTOMATION"
      title={locale === "ko" ? "안전한 작업은 자동으로, 외부 작업은 확인 후" : "Automate safe work and confirm external actions"}
      description={locale === "ko"
        ? "품질·사전검사는 바로 실행하고 게시·유료·파괴 작업만 명시적으로 확인하는 자동화 계획입니다."
        : "Quality and preflight can run directly; publishing, paid and destructive steps require explicit confirmation."}
    >
      <div className="flex items-center justify-between rounded-xl border border-line bg-panel p-3">
        <div>
          <b className="text-sm text-fg">{state.automation.recipe.name}</b>
          <p className="mt-1 text-xs text-fg-3">{state.automation.recipe.steps.length} steps</p>
        </div>
        <StatusBadge status={plan.status === "confirmation" ? "review" : plan.status} locale={locale} />
      </div>
      <div className="mt-4 space-y-2">
        {plan.steps.map((step) => {
          const definition = state.automation.recipe.steps.find((item) => item.id === step.stepId);
          return (
            <div key={step.stepId} className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <b className="block text-sm text-fg">{definition?.label ?? step.commandId}</b>
                <p className="mt-1 text-xs text-fg-3">{step.status} · {step.reason}</p>
              </div>
              {step.status === "confirmation" ? (
                <button type="button" onClick={() => toggleConfirmation(step.stepId)} className={buttonClass({ size: "sm" })}>
                  {locale === "ko" ? "이 단계 허용" : "Allow step"}
                </button>
              ) : step.status === "run" && definition?.risk !== "safe" ? (
                <button type="button" onClick={() => toggleConfirmation(step.stepId)} className={buttonClass({ variant: "outline", size: "sm" })}>
                  {locale === "ko" ? "허용 취소" : "Revoke"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </FeatureCard>
  );
}

/** Project-owned UI for the feature models implemented throughout this session. */
export function StudioProjectFeatureSuitePanel({
  projectId,
  section,
  view,
  locale,
}: {
  readonly projectId: string;
  readonly section: StudioProjectSection;
  readonly view: string;
  readonly locale: Locale;
}) {
  if (section === "overview") {
    return <OverviewSuite projectId={projectId} locale={locale} view={view} />;
  }
  if (section === "story" && view !== "localization") {
    return <StorySuite projectId={projectId} locale={locale} view={view} />;
  }
  if (section === "production") {
    return (
      <div className="space-y-5">
        {["board", "pipeline", "calendar", "workload"].includes(view) ? <ProductionPipeline projectId={projectId} locale={locale} /> : null}
        {["documents", "pipeline"].includes(view) ? <QualityPanel projectId={projectId} locale={locale} /> : null}
        {view === "renders" ? <RenderAndMotionPanel projectId={projectId} locale={locale} /> : null}
        {view === "documents" ? <DesignTemplatePanel projectId={projectId} locale={locale} /> : null}
      </div>
    );
  }
  if (section === "assets" && ["project", "installed", "rights"].includes(view)) {
    return <DesignTemplatePanel projectId={projectId} locale={locale} />;
  }
  if (section === "export" && view === "analytics") {
    return <OverviewSuite projectId={projectId} locale={locale} view={view} />;
  }
  if (section === "settings" && view === "automation") {
    return <AutomationPanel projectId={projectId} locale={locale} />;
  }
  if (section === "settings" && view === "defaults") {
    return <DesignTemplatePanel projectId={projectId} locale={locale} />;
  }
  if (section === "settings" && view === "archive") {
    return (
      <FeatureCard
        icon={CircleAlert}
        eyebrow="PROJECT SAFETY"
        title={locale === "ko" ? "보관 전 안전 확인" : "Safety checks before archiving"}
        description={locale === "ko"
          ? "원고·에셋·Series Kit·현지화·검토·출력 기록을 포함한 완전한 프로젝트 사본을 먼저 만드는 흐름을 사용합니다."
          : "Create a complete project copy with documents, assets, Series Kit, localization, review and export history before archiving."}
      >
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft/15 p-3 text-sm text-fg-2">
          <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden="true" />
          {locale === "ko"
            ? "보관은 원본 삭제가 아니며, 복원 가능한 상태로 유지됩니다."
            : "Archiving does not delete the original and remains reversible."}
        </div>
      </FeatureCard>
    );
  }
  return null;
}

import {
  ArrowRight,
  Box,
  Brush,
  Camera,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  FileImage,
  Glasses,
  HardDrive,
  Layers3,
  MonitorSmartphone,
  Move3d,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  inspectStudioImmersiveCapabilities,
  studioImmersiveSupportLabel,
  type StudioImmersiveCapabilitySnapshot,
  type StudioImmersiveSupport,
} from "./studio-immersive-capabilities";
import {
  STUDIO_IMMERSIVE_STAGES,
  STUDIO_IMMERSIVE_STARTER_KITS,
  STUDIO_IMMERSIVE_WORKFLOWS,
  type StudioImmersiveIcon,
  type StudioImmersiveStage,
} from "./studio-immersive-workflows";
import { SpatialWebtoonReaderLauncher } from "./SpatialWebtoonReaderLauncher";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

type Icon = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;

const WORKFLOW_ICONS: Readonly<Record<StudioImmersiveIcon, Icon>> = Object.freeze({
  brush: Brush,
  character: UserRound,
  pose: Move3d,
  scene: Box,
  depth: Layers3,
  motion: Clapperboard,
  ar: Camera,
  vr: Glasses,
  publish: Upload,
});
const STAGE_TONE: Readonly<Record<StudioImmersiveStage, string>> = Object.freeze({
  draw: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  character: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  scene: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  motion: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  experience: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
});

const KIT_TONE = Object.freeze({
  violet: "from-violet-500/20 to-violet-500/5",
  cyan: "from-cyan-500/20 to-cyan-500/5",
  amber: "from-amber-500/20 to-amber-500/5",
  rose: "from-rose-500/20 to-rose-500/5",
  emerald: "from-emerald-500/20 to-emerald-500/5",
});

function supportTone(state: StudioImmersiveSupport): string {
  if (state === "supported") return "border-success/35 bg-success-soft/15 text-success";
  if (state === "unsupported") return "border-line bg-panel text-fg-3";
  return "border-warning/35 bg-warning-soft/15 text-warning";
}

function SupportGlyph({ state }: { readonly state: StudioImmersiveSupport }) {
  useBilingualI18nRevision();
  return state === "supported"
    ? <CheckCircle2 size={16} aria-hidden />
    : <CircleAlert size={16} aria-hidden />;
}
function CapabilityCard({
  icon: Icon,
  label,
  detail,
  state,
}: {
  readonly icon: Icon;
  readonly label: string;
  readonly detail: string;
  readonly state: StudioImmersiveSupport;
}) {
  const l = useBilingualLocalizer("studioImmersive.capability");
  return (
    <article className="rounded-2xl border border-line bg-card/75 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-accent">
          <Icon size={18} aria-hidden />
        </span>
        <span className={cn(
          "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[0.68rem] font-black",
          supportTone(state),
        )}>
          <SupportGlyph state={state} />
          {l(studioImmersiveSupportLabel(state, "ko"), studioImmersiveSupportLabel(state, "en"))}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-black text-fg">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-fg-3">{detail}</p>
    </article>
  );
}
function ImmersiveHeroVisual() {
  const l = useBilingualLocalizer("studioImmersive.hero");
  return (
    <div className="relative min-h-72 overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(circle_at_top_left,oklch(0.72_0.18_285/0.26),transparent_42%),radial-gradient(circle_at_bottom_right,oklch(0.76_0.14_190/0.2),transparent_44%),var(--color-panel)] p-5 shadow-xl">
      <div className="absolute inset-x-10 top-8 h-36 rounded-[50%] border border-accent/25" aria-hidden />
      <div className="absolute inset-x-16 top-14 h-36 rounded-[50%] border border-cyan-400/20" aria-hidden />
      <div className="relative mx-auto mt-4 grid max-w-md grid-cols-[0.72fr_1fr_0.72fr] items-center gap-2" aria-hidden>
        <div className="aspect-[2/3] -rotate-6 rounded-xl border border-line bg-card/80 p-2 shadow-lg">
          <div className="h-2 w-2/3 rounded-full bg-fg-3/30" />
          <div className="mt-2 h-[70%] rounded-lg bg-gradient-to-br from-rose-500/25 to-violet-500/10" />
        </div>
        <div className="aspect-[3/4] rounded-2xl border border-accent/45 bg-card p-3 shadow-2xl">
          <div className="flex gap-1"><span className="size-1.5 rounded-full bg-accent" /><span className="size-1.5 rounded-full bg-cyan-400" /></div>
          <div className="mt-3 h-[62%] rounded-xl bg-gradient-to-b from-accent/25 via-cyan-400/10 to-panel" />
          <div className="mt-3 h-2 w-full rounded-full bg-fg-3/20" />
          <div className="mt-1.5 h-2 w-3/4 rounded-full bg-fg-3/15" />
        </div>
        <div className="aspect-[2/3] rotate-6 rounded-xl border border-line bg-card/80 p-2 shadow-lg">
          <div className="h-2 w-1/2 rounded-full bg-fg-3/30" />
          <div className="mt-2 h-[70%] rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/10" />
        </div>
      </div>
      <p className="relative mt-6 text-center text-xs font-bold tracking-wide text-fg-2">
        {l("2D 원고 · 3D 장면 · AR/VR 검수", "2D artwork · 3D scenes · AR/VR review")}
      </p>
    </div>
  );
}
export function StudioImmersiveHubPage() {
  const l = useBilingualLocalizer("studioImmersive");
  const [capabilities, setCapabilities] = useState<StudioImmersiveCapabilitySnapshot | null>(null);
  const [inspectionError, setInspectionError] = useState(false);

  useEffect(() => {
    let active = true;
    void inspectStudioImmersiveCapabilities()
      .then((snapshot) => {
        if (active) setCapabilities(snapshot);
      })
      .catch(() => {
        if (active) setInspectionError(true);
      });
    return () => { active = false; };
  }, []);

  const workflowsByStage = useMemo(() => new Map(
    STUDIO_IMMERSIVE_STAGES.map((stage) => [
      stage.id,
      STUDIO_IMMERSIVE_WORKFLOWS.filter((workflow) => workflow.stage === stage.id),
    ]),
  ), []);
  const unknown: StudioImmersiveSupport = "unknown";
  const capabilityState = capabilities?.readiness === "ready"
    ? l("이 기기에서 몰입형 검수를 시작할 수 있습니다.", "Immersive review is available on this device.")
    : l("2D 제작과 감상은 그대로 사용할 수 있으며, 지원되는 기기에서 AR/VR을 추가로 시작합니다.", "2D creation and reading remain available; AR/VR is added on supported devices.");

  return (
    <div data-studio-immersive-hub="true" className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-12">
        <section className="grid items-center gap-7 lg:grid-cols-[1.05fr_0.95fr]" aria-labelledby="immersive-hub-title">
          <div>
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
              <Sparkles size={14} aria-hidden /> TOONSTUDIO IMMERSIVE
            </p>
            <h1 id="immersive-hub-title" className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.035em] text-fg sm:text-5xl">
              {l("웹툰을 그리고, 세우고, 공간에서 검수하세요", "Draw, stage and review webtoons in space")}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-fg-2 sm:text-lg">
              {l("2D 브러시 원고에서 캐릭터·포즈·3D 배경·모션을 거쳐 AR/VR 프리뷰까지 이어지는 제작 동선입니다. 몰입형 기능이 없는 기기에서도 모든 원고를 2D로 열 수 있습니다.", "Move from 2D brush artwork through characters, poses, 3D backgrounds and motion to AR/VR previews. Every page remains readable in 2D on devices without immersive support.")}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/studio/new" className={buttonClass({ size: "lg", className: "gap-2" })}>
                {l("새 프로젝트 시작", "Start a project")}<ArrowRight size={17} aria-hidden />
              </Link>
              <a href="#spatial-reader" className={buttonClass({ variant: "outline", size: "lg", className: "gap-2" })}>
                <Glasses size={17} aria-hidden />{l("내 원고 공간에서 보기", "Preview my pages")}
              </a>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-fg-3">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} aria-hidden />{l("버튼을 누르기 전 권한 요청 없음", "No permission prompt on load")}</span>
              <span className="inline-flex items-center gap-1.5"><HardDrive size={15} aria-hidden />{l("로컬 원고 서버 업로드 없음", "Local pages stay on device")}</span>
            </div>
          </div>
          <ImmersiveHeroVisual />
        </section>
        <section className="mt-12 rounded-[2rem] border border-line bg-panel/70 p-5 shadow-sm sm:p-7" aria-labelledby="immersive-capability-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">DEVICE PREFLIGHT</p>
              <h2 id="immersive-capability-title" className="mt-2 text-2xl font-black text-fg">
                {l("권한 없이 먼저 확인했습니다", "Checked before asking for permissions")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">{capabilityState}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setInspectionError(false);
                setCapabilities(null);
                void inspectStudioImmersiveCapabilities()
                  .then(setCapabilities)
                  .catch(() => setInspectionError(true));
              }}
              className={buttonClass({ variant: "quiet", className: "min-h-11 gap-2 self-start sm:self-auto" })}
            >
              <RefreshCcw size={15} aria-hidden />{l("다시 확인", "Check again")}
            </button>
          </div>
          {inspectionError ? (
            <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm text-danger">
              {l("기기 기능을 확인하지 못했습니다. 2D 모드는 계속 사용할 수 있습니다.", "Device capabilities could not be inspected. 2D mode remains available.")}
            </p>
          ) : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
            <CapabilityCard
              icon={MonitorSmartphone}
              label={l("공간 렌더링", "Spatial rendering")}
              detail={l("WebGL2 기반 3D·2.5D 프리뷰", "WebGL2-based 3D and 2.5D previews")}
              state={capabilities?.webgl2 ?? unknown}
            />
            <CapabilityCard
              icon={Camera}
              label={l("AR 배치", "AR placement")}
              detail={l("실공간 표면과 관람 크기 검수", "Real-world surface and scale review")}
              state={capabilities?.immersiveAr ?? unknown}
            />
            <CapabilityCard
              icon={Glasses}
              label={l("VR 감상", "VR reading")}
              detail={l("집중·곡면·벽면 원고 배치", "Focus, arc and wall page layouts")}
              state={capabilities?.immersiveVr ?? unknown}
            />
            <CapabilityCard
              icon={FileImage}
              label={l("로컬 원고", "Local pages")}
              detail={l("이미지 파일을 업로드 없이 열기", "Open image files without uploading")}
              state={capabilities?.localFiles ?? unknown}
            />
          </div>
          {capabilities?.inAppBrowser.inApp ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-fg">
                  {l(`${capabilities.inAppBrowser.name ?? "인앱 브라우저"}에서는 AR/VR과 새 창 기능이 제한될 수 있습니다.`, "AR/VR and auxiliary windows may be limited in this in-app browser.")}
                </p>
                <p className="mt-1 text-xs leading-5 text-fg-2">
                  {capabilities.inAppBrowser.escapeHint ?? (l("기본 브라우저에서 열어 주세요.", "Open this page in your default browser."))}
                </p>
              </div>
              {capabilities.inAppBrowser.escapeHref ? (
                <a href={capabilities.inAppBrowser.escapeHref} className={buttonClass({ variant: "outline", className: "min-h-11 shrink-0" })}>
                  {l("기본 브라우저로 열기", "Open in browser")}
                </a>
              ) : null}
            </div>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-fg-3">
            {l(`WebGPU ${l(studioImmersiveSupportLabel(capabilities?.webgpu ?? unknown, "ko"), studioImmersiveSupportLabel(capabilities?.webgpu ?? unknown, "en"))} · 저장소 API ${l(studioImmersiveSupportLabel(capabilities?.storageApi ?? unknown, "ko"), studioImmersiveSupportLabel(capabilities?.storageApi ?? unknown, "en"))} · 터치 포인트 ${capabilities?.touchPoints ?? 0}. 지원 표시는 권한 승인이나 기기 안전 인증을 의미하지 않습니다.`, `WebGPU ${l(studioImmersiveSupportLabel(capabilities?.webgpu ?? unknown, "ko"), studioImmersiveSupportLabel(capabilities?.webgpu ?? unknown, "en"))} · storage API ${l(studioImmersiveSupportLabel(capabilities?.storageApi ?? unknown, "ko"), studioImmersiveSupportLabel(capabilities?.storageApi ?? unknown, "en"))} · touch points ${capabilities?.touchPoints ?? 0}. Capability status is not permission approval or device safety certification.`)}
          </p>
        </section>
        <section className="mt-14" aria-labelledby="immersive-workflow-title">
          <div className="max-w-3xl">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">PRODUCTION FLOW</p>
            <h2 id="immersive-workflow-title" className="mt-2 text-3xl font-black tracking-tight text-fg">
              {l("도구 목록이 아니라 하나의 제작 동선", "One production flow, not a pile of tools")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-fg-2">
              {l("각 단계는 독립적으로 시작할 수 있고, 표준 2D 원고를 기준 결과물로 유지합니다. 3D와 XR은 제작 보조·검수 레이어로 더해집니다.", "Start at any stage while keeping standard 2D artwork as the canonical result. 3D and XR remain assistive creation and review layers.")}
            </p>
          </div>
          <div className="mt-7 space-y-5">
            {STUDIO_IMMERSIVE_STAGES.map((stage, stageIndex) => (
              <section key={stage.id} className="grid gap-3 lg:grid-cols-[10rem_1fr]" aria-labelledby={`immersive-stage-${stage.id}`}>
                <div className="flex items-start gap-3 lg:block">
                  <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-black", STAGE_TONE[stage.id])}>
                    {stageIndex + 1}
                  </span>
                  <div className="lg:mt-3">
                    <h3 id={`immersive-stage-${stage.id}`} className="text-sm font-black text-fg">{l(stage.labelKo, stage.labelEn)}</h3>
                    <p className="mt-1 text-xs leading-5 text-fg-3">{l(stage.descriptionKo, stage.descriptionEn)}</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(workflowsByStage.get(stage.id) ?? []).map((workflow) => {
                    const Icon = WORKFLOW_ICONS[workflow.icon];
                    return (
                      <Link
                        key={workflow.id}
                        href={workflow.href}
                        className="group flex min-h-48 flex-col rounded-2xl border border-line bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={cn("grid size-10 place-items-center rounded-xl border", STAGE_TONE[workflow.stage])}>
                            <Icon size={18} aria-hidden />
                          </span>
                          <ArrowRight size={16} className="text-fg-3 transition-transform group-hover:translate-x-1 group-hover:text-accent" aria-hidden />
                        </div>
                        <h4 className="mt-4 text-sm font-black text-fg">{l(workflow.titleKo, workflow.titleEn)}</h4>
                        <p className="mt-2 flex-1 text-xs leading-5 text-fg-3">{l(workflow.descriptionKo, workflow.descriptionEn)}</p>
                        <p className="mt-3 text-[0.68rem] font-bold text-accent">
                          {l(`결과 · ${workflow.outputKo}`, `Output · ${workflow.outputEn}`)}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
        <section className="mt-14" aria-labelledby="immersive-kit-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">STARTER CONTENT</p>
              <h2 id="immersive-kit-title" className="mt-2 text-3xl font-black tracking-tight text-fg">
                {l("빈 화면 대신 제작 목적에서 시작", "Start from an outcome, not a blank screen")}
              </h2>
            </div>
            <Link href="/studio/assets" className={buttonClass({ variant: "quiet", className: "min-h-11 gap-2 self-start sm:self-auto" })}>
              {l("전체 에셋 허브", "All assets")}<ArrowRight size={15} aria-hidden />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {STUDIO_IMMERSIVE_STARTER_KITS.map((kit) => (
              <Link
                key={kit.id}
                href={kit.href}
                className={cn(
                  "group min-h-64 rounded-3xl border border-line bg-gradient-to-br p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  KIT_TONE[kit.accent],
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("rounded-full border px-2.5 py-1 text-[0.65rem] font-black", STAGE_TONE[kit.stage])}>
                    {l(
                      STUDIO_IMMERSIVE_STAGES.find((stage) => stage.id === kit.stage)?.labelKo ?? kit.stage,
                      STUDIO_IMMERSIVE_STAGES.find((stage) => stage.id === kit.stage)?.labelEn ?? kit.stage,
                    )}
                  </span>
                  <ArrowRight size={16} className="text-fg-3 transition-transform group-hover:translate-x-1 group-hover:text-accent" aria-hidden />
                </div>
                <h3 className="mt-5 text-lg font-black text-fg">{l(kit.titleKo, kit.titleEn)}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-2">{l(kit.descriptionKo, kit.descriptionEn)}</p>
                <ul className="mt-4 space-y-2 text-xs font-semibold text-fg-3">
                  {kit.deliverablesKo.map((deliverable, deliverableIndex) => (
                    <li key={deliverable} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                      <span>{l(deliverable, kit.deliverablesEn[deliverableIndex] ?? deliverable)}</span>
                    </li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        </section>

        <section id="spatial-reader" className="mt-14 scroll-mt-24 rounded-[2rem] border border-accent/25 bg-[linear-gradient(135deg,var(--color-panel),oklch(0.68_0.16_285/0.08))] p-5 shadow-lg sm:p-8" aria-labelledby="spatial-reader-title">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">LOCAL SPATIAL PREVIEW</p>
              <h2 id="spatial-reader-title" className="mt-2 text-3xl font-black tracking-tight text-fg">
                {l("내 원고를 업로드 없이 바로 펼치기", "Open your pages in space without uploading")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-fg-2">
                {l("최대 64장의 이미지를 파일명 순서로 열고, 긴 세로 원고는 겹치는 읽기 구간으로 나눕니다. AR/VR이 없거나 거절돼도 같은 설정으로 2D 감상을 계속합니다.", "Open up to 64 images in filename order and split long vertical pages into overlapping reading segments. The same settings continue in 2D when AR/VR is unavailable or denied.")}
              </p>
            </div>
            <div>
              <SpatialWebtoonReaderLauncher
                workId="local:immersive-hub"
                title={l("내 공간 웹툰", "My spatial webtoon")}
              />
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Link href="/read/spatial" className={buttonClass({ variant: "quiet", className: "min-h-11 gap-2" })}>
                  <Layers3 size={15} aria-hidden />
                  {l("깊이 레이어·오디오 공간북 편집", "Edit depth layers and spatial audio book")}
                </Link>
                <Link href="/studio/bg3d" className={buttonClass({ variant: "quiet", className: "min-h-11 gap-2" })}>
                  <Box size={15} aria-hidden />
                  {l("3D 장면 AR/VR 검수", "Review a 3D scene in AR/VR")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-label={l("공간 제작 안전 원칙", "Spatial creation safety principles")}>
          {[
            {
              icon: ShieldCheck,
              title: l("명시적 실행", "Explicit start"),
              body: l("카메라와 XR 세션은 사용자가 AR/VR 버튼을 누를 때만 요청합니다.", "Camera and XR sessions are requested only after the artist presses an AR/VR button."),
            },
            {
              icon: HardDrive,
              title: l("로컬 우선", "Local first"),
              body: l("가져온 원고 이미지는 임시 URL로 열고 리더를 닫을 때 해제합니다.", "Imported pages use temporary object URLs that are released when the reader closes."),
            },
            {
              icon: MonitorSmartphone,
              title: l("완전한 2D 폴백", "Complete 2D fallback"),
              body: l("헤드셋·WebXR·보안 연결이 없어도 읽기와 제작 동선은 막히지 않습니다.", "Reading and production remain usable without a headset, WebXR or secure context."),
            },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-line bg-card p-4">
              <Icon size={19} className="text-accent" aria-hidden />
              <h2 className="mt-3 text-sm font-black text-fg">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-fg-3">{body}</p>
            </article>
          ))}
        </section>
        <footer className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-xs leading-5 text-fg-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {l("몰입형 프리뷰는 제작 보조 기능입니다. 실제 배포 전에는 표준 2D 원고·자막·키보드 동선을 함께 검수하세요.", "Immersive preview is an assistive production mode. Review the standard 2D pages, captions and keyboard flow before delivery.")}
          </p>
          <Link href="/studio/manual" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-bold text-accent hover:bg-accent-soft">
            {l("스튜디오 사용 설명서", "Studio manual")}<ArrowRight size={14} aria-hidden />
          </Link>
        </footer>
      </Container>
    </div>
  );
}

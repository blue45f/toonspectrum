/**
 * 정밀 3D 모델링 첫 화면 안내.
 *
 * 처음 연 사람이 "무엇을·언제·왜" 쓰는지와 세 단계 사용법, 예시 결과를 한 화면에서 보고 바로
 * 시작 버튼을 누를 수 있게 한다. 장면이 비어 있을 때 자동으로 보이고, 작업대 상단의 "사용법"
 * 버튼으로 언제든 다시 연다. 저장소에 기록하지 않는다(닫기는 이번 실행에서만 유지).
 */
import {
  Clapperboard,
  Cuboid,
  MonitorSmartphone,
  Save,
  School,
  Smartphone,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import { StudioHybridDccExampleArt } from "./StudioHybridDccExampleArt";

import type { LucideIcon } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type StudioHybridDccStartKind = "cube" | "room" | "import";

export interface StudioHybridDccIntroProps {
  readonly id?: string;
  readonly busy?: boolean;
  /** 없으면 미리 보기(로딩 중) 모드: 시작 버튼 대신 준비 중 안내를 보인다. */
  readonly onStart?: (kind: StudioHybridDccStartKind) => void;
  /** 없으면 닫기 버튼을 그리지 않는다(로딩 화면처럼 닫을 대상이 없는 곳). */
  readonly onDismiss?: () => void;
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface IntroCopyRow {
  readonly term: string;
  readonly body: string;
}

interface IntroStep {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

interface StartAction {
  readonly kind: StudioHybridDccStartKind;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly primary?: boolean;
}

interface EnvironmentNote {
  readonly icon: LucideIcon;
  readonly body: string;
}

export function StudioHybridDccIntro({ id, busy = false, onStart, onDismiss }: StudioHybridDccIntroProps) {
  const bt = useBilingual("StudioHybridDccIntro");
  const titleId = id ? `${id}-title` : "studio-hybrid-dcc-intro-title";

  const purpose: readonly IntroCopyRow[] = [
    {
      term: bt("무엇", "What"),
      body: bt(
        "책상·의자·교실처럼 컷에 자주 나오는 소품과 배경을 3D로 만드는 작업대",
        "A 3D workbench for the props and sets that keep appearing in your panels",
      ),
    },
    {
      term: bt("언제", "When"),
      body: bt(
        "같은 장소가 여러 컷에 나오거나 원근·각도를 정확히 잡아야 할 때",
        "When one place shows up in many panels or the perspective must be exact",
      ),
    },
    {
      term: bt("왜", "Why"),
      body: bt(
        "카메라 각도만 바꿔 컷마다 다시 그리지 않고, 선화로 바꿔 원고에 넣습니다",
        "Move the camera instead of redrawing, then bring the line art into your page",
      ),
    },
  ];

  const steps: readonly IntroStep[] = [
    {
      icon: Cuboid,
      title: bt("시작하기", "Start"),
      body: bt(
        "큐브나 교실 세트로 시작하거나 GLB·OBJ·VRM 같은 3D 파일을 가져옵니다.",
        "Begin with a cube or a classroom set, or import a GLB, OBJ or VRM file.",
      ),
    },
    {
      icon: Wand2,
      title: bt("다듬기", "Shape"),
      body: bt(
        "면 밀어내기·모서리 둥글리기·좌우 대칭으로 모양을 만듭니다. 모든 편집은 되돌릴 수 있습니다.",
        "Extrude, round edges and mirror to get the shape. Every edit can be undone.",
      ),
    },
    {
      icon: Clapperboard,
      title: bt("컷으로 보내기", "Send to panels"),
      body: bt(
        "‘컷·선화’ 탭에서 카메라 컷을 만들고 3D 배경 편집기로 열어 원고에 넣습니다.",
        "In the Shots tab, frame camera shots and open them in the 3D background editor to place them on your page.",
      ),
    },
  ];

  const actions: readonly StartAction[] = [
    { kind: "cube", icon: Cuboid, label: bt("큐브로 시작", "Start with a cube"), primary: true },
    { kind: "room", icon: School, label: bt("교실 세트로 시작", "Start with a classroom set") },
    { kind: "import", icon: Upload, label: bt("3D 파일 가져오기", "Import a 3D file") },
  ];

  const environment: readonly EnvironmentNote[] = [
    {
      icon: MonitorSmartphone,
      body: bt(
        "WebGL을 지원하는 최신 Chrome·Edge·Safari에서 동작합니다. 3D 화면이 계속 비어 있으면 브라우저 설정에서 하드웨어 가속을 켜 주세요.",
        "Runs in recent Chrome, Edge and Safari with WebGL. If the 3D view stays blank, turn on hardware acceleration in your browser settings.",
      ),
    },
    {
      icon: Smartphone,
      body: bt(
        "휴대폰에서는 보기와 간단한 편집 위주로 쓰고, 치수 입력 같은 정밀 작업은 태블릿·데스크톱을 권장합니다.",
        "On phones, stick to viewing and light edits; precise work such as typed dimensions is easier on a tablet or desktop.",
      ),
    },
    {
      icon: Save,
      body: bt(
        "작업은 이 기기의 브라우저에 자동 저장됩니다(클라우드 백업 아님). 저장할 수 없으면 위쪽 저장 상태에 표시됩니다.",
        "Work autosaves in this browser on this device (not a cloud backup). If saving is unavailable, the save status above says so.",
      ),
    },
  ];

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      data-studio-hybrid-dcc-intro="true"
      className="relative overflow-hidden rounded-2xl border border-accent/30 bg-panel p-4 sm:p-5"
    >
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={bt("안내 닫기", "Close guide")}
          className={cn(
            "absolute right-2 top-2 grid size-11 place-items-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg",
            FOCUS_RING,
          )}
        >
          <X size={18} aria-hidden="true" />
        </button>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-start">
        {/* 휴대폰에서는 시작 버튼이 첫 화면 안에 들도록 목적 → 시작 → 단계 순으로 보이고, 넓은 화면은 목적 → 단계 → 시작 순이다.
            시작 버튼 줄만 초점을 받는 요소라 보이는 순서가 바뀌어도 초점 순서는 어긋나지 않는다. */}
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {bt("처음이라면 여기서 시작", "Start here")}
          </p>
          <h3
            id={titleId}
            className="mt-1.5 pr-10 text-lg font-bold leading-snug text-fg [text-wrap:balance] [word-break:keep-all] sm:text-xl"
          >
            {bt(
              "웹툰 배경·소품을 3D로 한 번 만들고, 여러 컷에서 다시 쓰세요",
              "Build a set or prop in 3D once, then reuse it across panels",
            )}
          </h3>

          <dl className="mt-3 grid gap-2 sm:grid-cols-3" data-studio-hybrid-dcc-intro-purpose="true">
            {purpose.map((row) => (
              <div
                key={row.term}
                className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-2 rounded-xl border border-line bg-card/60 px-3 py-2.5 sm:block"
              >
                <dt className="text-xs font-bold text-accent">{row.term}</dt>
                <dd className="text-sm leading-relaxed text-fg-2 [word-break:keep-all] sm:mt-1">{row.body}</dd>
              </div>
            ))}
          </dl>

          <ol
            className="order-3 mt-4 grid gap-2 sm:grid-cols-3 lg:order-none"
            aria-label={bt("세 단계 사용법", "Three-step guide")}
          >
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3 rounded-xl border border-line bg-canvas/40 p-3">
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      <Icon size={15} aria-hidden="true" className="shrink-0 text-accent" />
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-fg-2 [word-break:keep-all] lg:text-[0.8125rem]">
                      {step.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {onStart ? (
            <div className="order-2 mt-4 flex flex-wrap gap-2 lg:order-none" data-studio-hybrid-dcc-intro-actions="true">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.kind}
                    type="button"
                    disabled={busy}
                    data-studio-hybrid-dcc-start={action.kind}
                    onClick={() => onStart(action.kind)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
                      action.primary
                        ? "bg-accent text-on-accent shadow-sm hover:bg-accent-2"
                        : "border border-line-strong bg-card text-fg hover:bg-raised",
                      FOCUS_RING,
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="order-2 mt-4 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-sm text-fg-2 [word-break:keep-all] lg:order-none">
              {bt(
                "3D 작업대를 준비하고 있습니다. 준비가 끝나면 이 자리에 시작 버튼이 나타납니다.",
                "The 3D workbench is getting ready. Start buttons appear here once it loads.",
              )}
            </p>
          )}
        </div>

        {/* 넓은 화면에서는 오른쪽 위 모서리의 닫기 버튼(44px)이 예시 그림 위에 겹치지 않도록 그림을 그만큼 내린다. */}
        <figure className="mx-auto w-full min-w-0 max-w-lg lg:mt-10 lg:max-w-none">
          <StudioHybridDccExampleArt
            title={bt(
              "예시 그림: 3D 교실 장면을 카메라 컷에서 본 선화로 바꾼 모습",
              "Example: a 3D classroom turned into line art seen from a camera shot",
            )}
            className="h-auto w-full rounded-xl border border-line"
          />
          <figcaption className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm text-fg-2 md:text-xs">
            <span>{bt("3D 장면", "3D scene")}</span>
            <span aria-hidden="true" className="text-accent">→</span>
            <span>{bt("컷 선화", "Panel line art")}</span>
            <span className="col-span-3 text-fg-2 md:text-fg-3">
              {bt(
                "예시 그림입니다. 실제 결과는 장면과 카메라 설정에 따라 달라집니다.",
                "Illustration only. Real results depend on your scene and camera.",
              )}
            </span>
          </figcaption>
        </figure>
      </div>

      <ul
        className="mt-4 grid gap-2 border-t border-line pt-3 md:grid-cols-3"
        aria-label={bt("사용 환경과 저장", "Requirements and saving")}
        data-studio-hybrid-dcc-intro-environment="true"
      >
        {environment.map((note) => {
          const Icon = note.icon;
          return (
            <li key={note.body} className="flex gap-2 text-sm leading-relaxed text-fg-2 [word-break:keep-all] md:text-xs">
              <Icon size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-3" />
              <span>{note.body}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

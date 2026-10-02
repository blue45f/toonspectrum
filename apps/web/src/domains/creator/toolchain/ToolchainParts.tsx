import {
  AudioLines,
  Ban,
  BookOpen,
  Box,
  Camera,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  Film,
  FlaskConical,
  Hand,
  Layers3,
  ListChecks,
  LockKeyhole,
  PenTool,
  Plug,
  ScanText,
  ServerCog,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { PillTabNav } from "../ai/PillTabNav";

import { STUDIO_TOOLCHAIN_PROFILES, type StudioToolchainProfileId } from "./studio-production-toolchain";
import { profileEnglish, TOOL_STATE_LABELS, type StudioToolState } from "./studio-production-toolchain-labels";
import { withProject } from "./toolchain-links";

export type ToolchainPageMode = "overview" | "engines" | "jobs";

const PAGES: readonly { readonly mode: ToolchainPageMode; readonly path: string; readonly icon: LucideIcon; readonly ko: string; readonly en: string }[] = [
  { mode: "overview", path: "/studio/toolchain", icon: Workflow, ko: "제작 흐름", en: "Overview" },
  { mode: "engines", path: "/studio/engines", icon: ServerCog, ko: "설치·라이선스", en: "Installs & licenses" },
  { mode: "jobs", path: "/studio/jobs", icon: ListChecks, ko: "작업 큐", en: "Job queue" },
];

const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  effects: Sparkles,
  compositing: Layers3,
  "scan-ocr": ScanText,
  vector: PenTool,
  animation: Film,
  media: Clapperboard,
  "three-d": Box,
  publishing: BookOpen,
  reference: Camera,
  "audio-accessibility": AudioLines,
  operations: Workflow,
  "research-nc": FlaskConical,
};

const STATE_ICONS: Readonly<Record<StudioToolState, LucideIcon>> = {
  available: CheckCircle2,
  connector: Plug,
  manual: Hand,
  unchecked: CircleDashed,
  missing: CircleDashed,
  blocked: Ban,
};

/** 제작 도구 영역 공통 머리말과 세 화면(제작 흐름·설치·라이선스·작업 큐) 사이 이동 막대. */
export function ToolchainPageHeader({
  mode,
  projectId,
  eyebrow,
  title,
  lede,
  actions,
}: {
  readonly mode: ToolchainPageMode;
  readonly projectId: string | null;
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly lede: ReactNode;
  readonly actions?: ReactNode;
}) {
  const bt = useBilingual("ToolchainPageHeader");
  return (
    <header className="relative overflow-hidden rounded-[1.75rem] border border-line bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklch,var(--color-accent)_18%,transparent),transparent_46%),var(--color-panel)] p-4 shadow-lg sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
          <h1 className="mt-2 break-keep text-balance font-display text-[1.75rem] font-bold leading-tight tracking-[-0.04em] text-fg sm:text-[2.6rem]">{title}</h1>
          <p className="mt-3 break-keep text-[0.9375rem] leading-7 text-fg-2 sm:text-base">{lede}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4 sm:mt-6">
        <PillTabNav
          label={bt("제작 도구 화면", "Toolchain pages")}
          surface="canvas"
          items={PAGES.map((page) => ({
            id: page.mode,
            href: withProject(page.path, projectId),
            label: bt(page.ko, page.en),
            icon: page.icon,
            active: page.mode === mode,
          }))}
        />
      </div>
    </header>
  );
}

/** 상태를 색·아이콘·글자로 함께 알려주는 배지. */
export function ToolStatusBadge({ state }: { readonly state: StudioToolState }) {
  const bt = useBilingual("ToolStatusBadge");
  const Icon = STATE_ICONS[state];
  const label = TOOL_STATE_LABELS[state];
  return (
    <span className={cn(
      "inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[0.7rem] font-bold",
      state === "available"
        ? "border-good/45 bg-good/12 text-fg"
        : state === "connector"
          ? "border-cool/45 bg-cool/12 text-fg"
          : state === "manual"
            ? "border-warn/45 bg-warn/12 text-fg"
            : "border-line bg-raised text-fg-3",
    )}>
      <Icon size={12} aria-hidden="true" />
      {bt(label.ko, label.en)}
    </span>
  );
}

export function ToolchainCategoryIcon({ categoryId, size = 18 }: { readonly categoryId: string; readonly size?: number }) {
  const Icon = CATEGORY_ICONS[categoryId] ?? Workflow;
  return <Icon size={size} aria-hidden="true" />;
}

export function ProfileSelector({
  profile,
  onChange,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly onChange: (profile: StudioToolchainProfileId) => void;
}) {
  const bt = useBilingual("ToolchainProfileSelector");
  return (
    <section aria-labelledby="toolchain-profile-title" className="rounded-2xl border border-line bg-panel/70 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
          <LockKeyhole size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 id="toolchain-profile-title" className="font-display text-base font-bold text-fg">{bt("사용 범위 프로필", "Usage profile")}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-3 sm:text-sm">
            {bt("프로필은 기능 숨김이 아니라 라이선스 경계입니다. 비상업 전용 기능은 Research NC에서만 노출됩니다.", "Profiles are license boundaries, not hidden features. Non-commercial modules appear only in Research NC.")}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-3" role="group" aria-label={bt("사용 범위 프로필 선택", "Choose a usage profile")}>
        {STUDIO_TOOLCHAIN_PROFILES.map((item) => {
          const english = profileEnglish(item.id);
          const active = profile === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(item.id)}
              className={cn(
                "min-h-24 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active ? "border-accent bg-accent-soft" : "border-line bg-card/70 hover:border-line-strong",
              )}
            >
              <strong className="flex items-center gap-2 text-sm text-fg">
                {bt(item.name, english.nameEn)}
                {active ? <CheckCircle2 size={14} className="text-accent" aria-hidden="true" /> : null}
              </strong>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{bt(item.description, english.descriptionEn)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 실행기 시작 방법. 저장소에서 개발자가 직접 실행하는 명령이라는 점을 분명히 적는다. */
export function ToonBridgeStartGuide() {
  const bt = useBilingual("ToonBridgeStartGuide");
  const origin = globalThis.location?.origin ?? "";
  const steps = [
    { ko: "터미널에서 32자 이상의 토큰을 만들고 이 사이트 주소를 허용 목록에 넣습니다.", en: "In a terminal, create a 32+ character token and allow this site's origin." },
    { ko: "저장소 루트에서 실행기를 켭니다. 외부 프로그램(FFmpeg·Blender 등)은 따로 설치해야 합니다.", en: "Start the runner from the repository root. External programs (FFmpeg, Blender…) are installed separately." },
    { ko: "위 칸에 실행기 주소와 토큰을 넣고 ‘연결 확인’을 누릅니다. 토큰은 현재 탭에만 저장됩니다.", en: "Enter the runner address and token above and press “Check connection”. The token stays in this tab only." },
  ];
  return (
    <details className="group mt-4 rounded-xl border border-line bg-card/60 px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-fg">{bt("실행기 시작 방법 (개발자용)", "How to start the runner (developers)")}</summary>
      <ol className="grid gap-2 pb-3 text-xs leading-5 text-fg-2">
        {steps.map((step, index) => (
          <li key={step.en} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-[0.7rem] font-black text-accent" aria-hidden="true">{index + 1}</span>
            <span>{bt(step.ko, step.en)}</span>
          </li>
        ))}
      </ol>
      <pre className="mb-3 overflow-x-auto rounded-lg bg-canvas px-3 py-2 text-[0.72rem] leading-5 text-fg-2"><code>{`export TOONBRIDGE_TOKEN="$(openssl rand -hex 24)"
export TOONBRIDGE_ALLOWED_ORIGINS="${origin}"
pnpm run toonbridge`}</code></pre>
    </details>
  );
}

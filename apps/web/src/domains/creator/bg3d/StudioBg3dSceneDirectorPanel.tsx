import {
  Boxes,
  Camera,
  ChevronRight,
  PackageOpen,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";

export type StudioBg3dSceneGoal =
  | "background"
  | "camera"
  | "character"
  | "props"
  | "webtoon";

interface StudioBg3dSceneDirectorPanelProps {
  readonly activeGoal: StudioBg3dSceneGoal | null;
  readonly disabled?: boolean;
  readonly lineArtPreview: boolean;
  readonly savedShotCount: number;
  readonly sceneHasContent: boolean;
  readonly onSelectGoal: (goal: StudioBg3dSceneGoal) => void;
  readonly onOpenPro: () => void;
}
const GOALS = [
  {
    id: "background",
    label: "배경 만들기",
    description: "교실·방·거리 같은 장소를 빠르게 구성",
    icon: Boxes,
  },
  {
    id: "camera",
    label: "구도 잡기",
    description: "카메라 각도와 원근을 먼저 결정",
    icon: Camera,
  },
  {
    id: "character",
    label: "인물·포즈",
    description: "캐릭터를 배치하고 어려운 자세 참고",
    icon: UserRound,
  },
  {
    id: "props",
    label: "소품 배치",
    description: "가구·물건을 장면에 놓고 크기 조절",
    icon: PackageOpen,
  },
  {
    id: "webtoon",
    label: "웹툰 변환",
    description: "선화·톤·컬러 가이드로 작화 준비",
    icon: ScanLine,
  },
] as const satisfies readonly {
  id: StudioBg3dSceneGoal;
  label: string;
  description: string;
  icon: typeof Boxes;
}[];

export function StudioBg3dSceneDirectorPanel({
  activeGoal,
  disabled = false,
  lineArtPreview,
  savedShotCount,
  sceneHasContent,
  onSelectGoal,
  onOpenPro,
}: StudioBg3dSceneDirectorPanelProps) {
  return (
    <section
      className="border-b border-line bg-gradient-to-b from-accent-soft/45 to-panel px-3 py-3"
      aria-labelledby="studio-bg3d-scene-director-title"
      data-testid="studio-bg3d-scene-director"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-accent">
            <Sparkles size={12} aria-hidden />
            3D를 배울 필요 없이
          </p>
          <h3
            id="studio-bg3d-scene-director-title"
            className="mt-1 text-sm font-extrabold tracking-tight text-fg"
          >
            어떤 장면을 만들까요?
          </h3>
          <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">
            필요한 작업을 고르면 관련 도구만 바로 열어드려요. 장면을 잡은 뒤 작화에 적용하면 됩니다.
          </p>
        </div>
        <button
          type="button"
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[0.58rem] font-bold text-fg-2 hover:border-accent/45 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={onOpenPro}
        >
          <SlidersHorizontal size={12} aria-hidden />
          전문 설정
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {GOALS.map((goal) => {
          const Icon = goal.icon;
          const selected = activeGoal === goal.id;
          return (
            <button
              key={goal.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onSelectGoal(goal.id)}
              className={`group min-h-[4.25rem] rounded-xl border p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 ${selected
                ? "border-accent/55 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-accent/35 hover:bg-raised hover:text-fg"}`}
            >
              <span className="flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-panel text-accent">
                  <Icon size={14} aria-hidden />
                </span>
                <span className="min-w-0 text-[0.65rem] font-extrabold">
                  {goal.label}
                </span>
                <ChevronRight className="ml-auto size-3.5 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="mt-1.5 block text-[0.54rem] leading-relaxed text-fg-3">
                {goal.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl border border-line bg-panel/75 px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-1 text-[0.52rem] font-bold text-fg-3">
          <span className="rounded-full bg-card px-2 py-1 text-fg-2">1 장면 구성</span>
          <ChevronRight size={11} aria-hidden />
          <span className="rounded-full bg-card px-2 py-1 text-fg-2">2 구도·포즈</span>
          <ChevronRight size={11} aria-hidden />
          <span
            className={`rounded-full px-2 py-1 ${lineArtPreview
              ? "bg-accent-soft text-accent"
              : "bg-card text-fg-2"}`}
          >
            3 웹툰 변환
          </span>
          <ChevronRight size={11} aria-hidden />
          <span className="rounded-full bg-good/10 px-2 py-1 text-good">작화에 적용</span>
        </div>
        <p className="mt-1.5 text-[0.52rem] leading-relaxed text-fg-3" role="status">
          {sceneHasContent
            ? `현재 장면을 편집 중입니다${savedShotCount > 0 ? ` · 저장된 컷 ${savedShotCount}개` : ""}.`
            : "처음이라면 ‘배경 만들기’에서 장소를 고르거나 ‘인물·포즈’에서 캐릭터부터 시작해보세요."}
        </p>
      </div>
    </section>
  );
}

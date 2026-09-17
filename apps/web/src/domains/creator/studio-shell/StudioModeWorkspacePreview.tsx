import type { StudioModeProfile, StudioModeShell } from "../studio-mode-profile";

type Locale = "ko" | "en";

type ShellRegion = {
  readonly left: readonly [string, string];
  readonly center: readonly [string, string];
  readonly right: readonly [string, string];
  readonly bottom?: readonly [string, string];
};

const SHELL_REGIONS: Readonly<Record<StudioModeShell, ShellRegion>> = {
  comic: { left: ["회차 · 컷", "Episodes · panels"], center: ["세로 원고", "Vertical manuscript"], right: ["레이어 · 말풍선", "Layers · balloons"] },
  drawing: { left: ["레퍼런스", "References"], center: ["일러스트 캔버스", "Illustration canvas"], right: ["브러시 · 레이어", "Brushes · layers"] },
  image: { left: ["히스토리", "History"], center: ["이미지 · 전후 비교", "Image · before/after"], right: ["마스크 · 보정", "Masks · adjustments"] },
  layout: { left: ["템플릿", "Templates"], center: ["아트보드", "Artboard"], right: ["타이포 · 변형", "Type · transform"] },
  slides: { left: ["슬라이드", "Slides"], center: ["발표 화면", "Slide canvas"], right: ["레이아웃 · 테마", "Layout · theme"], bottom: ["발표 노트", "Speaker notes"] },
  storyboard: { left: ["Scene · Shot", "Scenes · shots"], center: ["Shot board", "Shot board"], right: ["카메라 · 대사", "Camera · dialogue"], bottom: ["Timing · Animatic", "Timing · animatic"] },
  spatial: { left: ["Outliner", "Outliner"], center: ["3D Viewport", "3D viewport"], right: ["카메라 · 포즈", "Camera · pose"] },
  timeline: { left: ["Scene · Asset", "Scenes · assets"], center: ["Preview", "Preview"], right: ["Motion · Camera", "Motion · camera"], bottom: ["Timeline · Audio", "Timeline · audio"] },
};

function localized(pair: readonly [string, string], locale: Locale): string {
  return locale === "ko" ? pair[0] : pair[1];
}
export function StudioModeWorkspacePreview({
  profile,
  locale,
}: {
  readonly profile: StudioModeProfile;
  readonly locale: Locale;
}) {
  const region = SHELL_REGIONS[profile.launch.shell];
  const preview = profile.creationPreview;
  const keyTools = locale === "ko" ? preview.keyToolsKo : preview.keyToolsEn;
  const aiHighlights = locale === "ko" ? preview.aiHighlightsKo : preview.aiHighlightsEn;
  const output = locale === "ko" ? preview.outputKo : preview.outputEn;
  const headline = locale === "ko" ? preview.headlineKo : preview.headlineEn;

  return (
    <section
      data-studio-mode-preview={profile.id}
      className="mt-5 min-w-0 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6"
      aria-label={locale === "ko" ? "선택한 작업공간 미리보기" : "Selected workspace preview"}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">WORKSPACE PREVIEW</p>
          <p className="mt-1 max-w-3xl text-sm font-bold leading-6 text-fg">{headline}</p>
        </div>        <span className="w-fit rounded-full border border-accent/25 bg-accent-soft/30 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-accent">
          {profile.id}
        </span>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
        <div className="min-w-0 rounded-2xl border border-line bg-panel p-3" aria-hidden="true">
          <div className="grid min-h-44 min-w-0 grid-cols-[minmax(5.5rem,.28fr)_minmax(0,1fr)_minmax(6rem,.34fr)] gap-2">
            <div className="flex min-w-0 items-center justify-center rounded-xl border border-line bg-card p-2 text-center text-[0.68rem] font-bold leading-4 text-fg-2">
              {localized(region.left, locale)}
            </div>
            <div className="flex min-w-0 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft/25 p-3 text-center text-xs font-black leading-5 text-fg">
              {localized(region.center, locale)}
            </div>
            <div className="flex min-w-0 items-center justify-center rounded-xl border border-line bg-card p-2 text-center text-[0.68rem] font-bold leading-4 text-fg-2">
              {localized(region.right, locale)}
            </div>
          </div>
          {region.bottom ? (
            <div className="mt-2 flex min-h-12 items-center justify-center rounded-xl border border-line bg-card px-3 text-center text-[0.68rem] font-bold text-fg-2">
              {localized(region.bottom, locale)}
            </div>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="min-w-0 rounded-2xl bg-panel p-3">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-fg-3">{locale === "ko" ? "주요 도구" : "Key tools"}</p>
            <p className="mt-1 break-words text-xs font-bold leading-5 text-fg">{keyTools.join(" · ")}</p>
          </div>
          <div className="min-w-0 rounded-2xl bg-panel p-3">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-fg-3">AI</p>
            <p className="mt-1 break-words text-xs font-bold leading-5 text-fg">{aiHighlights.join(" · ")}</p>
          </div>
          <div className="min-w-0 rounded-2xl bg-panel p-3">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-fg-3">{locale === "ko" ? "결과물" : "Output"}</p>
            <p className="mt-1 break-words text-xs font-bold leading-5 text-fg">{output}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        {profile.workflow.map((item, index) => (
          <span key={item.id} className="rounded-full border border-line bg-panel px-3 py-1.5 text-[0.68rem] font-bold text-fg-2">
            {index + 1}. {locale === "ko" ? item.labelKo : item.labelEn}
          </span>
        ))}
      </div>
    </section>
  );
}

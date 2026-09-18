interface StudioLazySurfaceFallbackProps {
  readonly label?: string;
}

export function StudioPanelLoading({
  label = "패널을 여는 중...",
}: StudioLazySurfaceFallbackProps) {
  return (
    <div
      className="skeleton-group min-h-20 rounded-lg border border-line bg-card/70 px-3 py-3 text-xs text-fg-3"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      data-studio-lazy-surface="inline"
    >
      <span className="sr-only">{label}</span>
      <div className="space-y-2" aria-hidden="true">
        <div className="skeleton h-3 w-2/3 rounded-full" />
        <div className="skeleton h-8 rounded-md opacity-90" />
      </div>
    </div>
  );
}

export function StudioRouteLoading({ label = "스튜디오를 여는 중..." }: StudioLazySurfaceFallbackProps) {
  return (
    <div
      className="skeleton-group grid min-h-dvh grid-rows-[3rem_1fr] bg-bg"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      data-route-loading-fallback=""
      data-route-pending="studio-route"
      data-studio-lazy-surface="route"
    >
      <span className="sr-only">{label}</span>
      <div className="border-b border-line bg-panel" aria-hidden="true">
        <div className="skeleton mx-3 mt-3 h-5 w-44 rounded-full" />
      </div>
      <div
        className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-px bg-line lg:grid-cols-[3.5rem_minmax(0,1fr)_16rem]"
        aria-hidden="true"
      >
        <div className="bg-panel p-2">
          <div className="skeleton h-10 rounded-lg" />
        </div>
        <div className="grid place-items-center bg-bg p-4">
          <div className="skeleton aspect-[3/4] h-[min(72vh,42rem)] max-w-full rounded-xl" />
        </div>
        <div className="hidden space-y-3 bg-panel p-3 lg:block">
          <div className="skeleton h-5 w-2/3 rounded-full" />
          <div className="skeleton h-24 rounded-lg opacity-90" />
          <div className="skeleton h-16 rounded-lg opacity-80" />
        </div>
      </div>
    </div>
  );
}

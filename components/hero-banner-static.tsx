import { HeroBannerBadge, HeroBannerSlide } from "./hero-banner-slide";

import type { Title } from "@/lib/types";

export function HeroBannerStatic({
  items,
  onActivate,
}: {
  items: Title[];
  onActivate?: () => void;
}) {
  const first = items[0];
  if (!first) return null;

  return (
    <div
      className="group relative"
      style={{ animation: "fade-up 0.7s var(--ease-out-expo) 0.1s both" }}
      role="group"
      aria-label="이 주의 추천 작품"
      onPointerEnter={onActivate}
      onFocusCapture={onActivate}
    >
      <HeroBannerBadge />

      <div className="overflow-hidden rounded-2xl border border-line bg-card surface-hl">
        <HeroBannerSlide title={first} />
      </div>

      {items.length > 1 && (
        <div className="relative mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
          {items.slice(0, 6).map((title, index) => (
            <span
              key={title.id}
              className={index === 0 ? "h-1.5 w-5 rounded-full bg-accent" : "size-1.5 rounded-full bg-line"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useAmbientBgm } from "@toonspectrum/core/fx";
import { Music, VolumeX } from "lucide-react";

import { cx } from "@/lib/cx";

// 생성형 앰비언트 BGM opt-in 토글(기본 OFF — autoplay 정책). 테마/언어 스위처 옆 고정 배치.
// 켜면 첫 클릭(제스처) 안에서 컨텍스트가 언락되고 무드 프리셋이 crossfade 로테이션된다.
// 현재 무드명을 title 로 노출하고, 동작 최소화 사용자에게도 소리는 opt-in 이므로 그대로 둔다.
export function BgmToggle({ className }: { className?: string }) {
  const { enabled, mood, toggle } = useAmbientBgm();
  return (
    <button
      type="button"
      onClick={() => toggle()}
      aria-label={enabled ? "배경음악 끄기" : "배경음악 켜기"}
      aria-pressed={enabled}
      title={enabled ? `배경음악 켜짐 · ${mood}` : "배경음악 켜기"}
      data-no-sfx
      className={cx(
        "grid size-9 place-items-center rounded-full border bg-panel/90 shadow-lg shadow-[oklch(0.1_0.02_70/0.3)] backdrop-blur transition-colors",
        enabled
          ? "border-accent/40 text-accent"
          : "border-line text-fg-2 hover:text-fg",
        className
      )}
    >
      {enabled ? <Music size={15} /> : <VolumeX size={15} />}
    </button>
  );
}

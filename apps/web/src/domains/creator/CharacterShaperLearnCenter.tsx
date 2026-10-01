import { ArrowRight, Clock, Play } from "lucide-react";
import { useState } from "react";

import type { ShaperLearnTabId } from "./character-shaper-learn-clips";
import { SHAPER_LEARN_TABS, formatClipDuration } from "./character-shaper-learn-clips";
import { resolveCharacterShaperEntryHref } from "./character-shaper/character-shaper-entry";

import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { Container, Section } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

// 캐릭터 셰이퍼 3D 학습 센터 — 영상 튜토리얼 중심의 4탭 섹션.
// 실제 영상이 없으므로 썸네일은 플레이스홀더 구조이며, 클립 데이터의
// videoUrl/posterUrl만 채우면 영상이 붙는다(character-shaper-learn-clips.ts).
// 탭 칩 패턴은 CreateGalleryPage의 ChipButton을 따른다.

const THUMBNAIL_GRADIENT_STYLE = {
  background:
    "linear-gradient(135deg, color-mix(in oklab, var(--illustrated-3d-accent) 26%, var(--color-canvas)), color-mix(in oklab, var(--illustrated-3d-cyan) 18%, var(--color-card)))",
} as const;

function TabChip({
  id,
  title,
  active,
  onSelect,
}: {
  id: ShaperLearnTabId;
  title: string;
  active: boolean;
  onSelect: (id: ShaperLearnTabId) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`shaper-learn-tab-${id}`}
      aria-selected={active}
      aria-controls={`shaper-learn-panel-${id}`}
      onClick={() => onSelect(id)}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent bg-accent text-on-accent shadow-md shadow-accent/25"
          : "border-line-strong bg-card text-fg-2 hover:bg-raised",
      )}
    >
      {title}
    </button>
  );
}

function ClipCard({
  clip,
  index,
}: {
  clip: (typeof SHAPER_LEARN_TABS)[number]["clips"][number];
  index: number;
}) {
  return (
    <RevealOnScroll
      as="li"
      delayMs={index * 60}
      className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card/40"
    >
      {/* 썸네일 — videoUrl이 생기면 이 자리를 영상/링크로 교체. */}
      <div className="group relative">
        {clip.posterUrl ? (
          <img
            src={clip.posterUrl}
            alt={clip.posterAlt ?? clip.title}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            role="img"
            aria-label={`${clip.title} — 썸네일 준비 중`}
            className="flex aspect-video w-full items-center justify-center"
            style={THUMBNAIL_GRADIENT_STYLE}
          >
            <span className="flex size-14 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-105">
              <Play size={22} className="translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full border border-line bg-raised/90 px-2 py-0.5 text-[0.7rem] font-semibold text-fg-2 backdrop-blur-sm">
          {clip.difficulty}
        </span>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.7rem] font-medium tabular-nums text-white">
          <Clock size={12} aria-hidden="true" />
          {formatClipDuration(clip.durationSeconds)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-bold leading-snug text-fg [word-break:keep-all]">{clip.title}</h3>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-fg-2 [word-break:keep-all]">{clip.description}</p>
        <p className="mt-auto pt-3 text-xs text-fg-3">
          {clip.videoUrl ? (
            <a href={clip.videoUrl} className="font-medium text-accent underline-offset-2 hover:underline">
              영상 보기
            </a>
          ) : (
            "영상 준비 중 — 클립 구성과 대본이 확정되면 이 자리에 30초 영상이 붙습니다."
          )}
        </p>
      </div>
    </RevealOnScroll>
  );
}

export function CharacterShaperLearnCenter() {
  const [activeTab, setActiveTab] = useState<ShaperLearnTabId>("presets");
  const tab = SHAPER_LEARN_TABS.find((candidate) => candidate.id === activeTab) ?? SHAPER_LEARN_TABS[0];

  return (
    <section id="learn-center" className="scroll-mt-24 border-y border-line bg-panel/30">
      <Container size="wide" className="studio-character-guide__section py-12 sm:py-16">
        <Section
          eyebrow="TUTORIALS"
          title="3D 학습 센터"
          desc="30초 클립으로 따라 하는 네 가지 트랙. 바로 해보기로 같은 패널을 스튜디오에서 열어 둘 수 있습니다."
        >
          <div role="tablist" aria-label="학습 트랙" className="flex flex-wrap gap-2">
            {SHAPER_LEARN_TABS.map((candidate) => (
              <TabChip
                key={candidate.id}
                id={candidate.id}
                title={candidate.title}
                active={candidate.id === activeTab}
                onSelect={setActiveTab}
              />
            ))}
          </div>

          <div
            key={tab.id}
            role="tabpanel"
            id={`shaper-learn-panel-${tab.id}`}
            aria-labelledby={`shaper-learn-tab-${tab.id}`}
            className="mt-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
                {tab.blurb}
              </p>
              <Link
                // 예전 작업실 별칭은 이 랜딩으로 돌아오므로 편집기를 바로 여는 주소로 바꾼다.
                href={resolveCharacterShaperEntryHref(tab.studioHref)}
                aria-label={`바로 해보기 — ${tab.studioLabel} 열기`}
                className={buttonClass({ variant: "solid", size: "md" })}
              >
                바로 해보기
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tab.clips.map((clip, index) => (
                <ClipCard key={clip.id} clip={clip} index={index} />
              ))}
            </ul>
          </div>
        </Section>
      </Container>
    </section>
  );
}

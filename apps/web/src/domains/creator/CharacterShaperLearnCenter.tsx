import { ArrowRight, Clock, Play } from "lucide-react";
import { useState } from "react";

import {
  SHAPER_LEARN_LEVEL_LABEL,
  SHAPER_LEARN_TABS,
  SHAPER_LEARN_TABS_EN,
  formatClipDuration,
} from "./character-shaper-learn-clips";
import { resolveCharacterShaperEntryHref } from "./character-shaper/character-shaper-entry";

import type { ShaperLearnTab, ShaperLearnTabId } from "./character-shaper-learn-clips";
import type { KeyboardEvent } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

// 캐릭터 셰이퍼 3D 학습 센터 — 짧은 클립 튜토리얼 4트랙.
// 실제 영상이 아직 없으므로 클립은 "제목 + 한 줄 설명 + 난이도" 목록으로 보여 주고, 영상이 없다는 점은
// 클립마다 반복하지 않고 목록 위에서 한 번만 알린다. 클립 데이터의 videoUrl을 채우면 그 줄에 링크가 붙는다
// (character-shaper-learn-clips.ts). 소개 페이지의 탭 패널 안에 들어가는 조각이라 섹션 제목은 두지 않는다.

type LearnBt = (ko: string, en: string) => string;

/** 한국어·영어 트리를 같은 위치끼리 짝지어 문자열마다 번역 파이프라인(ko/en/그 밖 언어)에 태운다. */
function localizeLearnTabs(bt: LearnBt): readonly ShaperLearnTab[] {
  return SHAPER_LEARN_TABS.map((koTab, tabIndex) => {
    const enTab = SHAPER_LEARN_TABS_EN[tabIndex] ?? koTab;
    return {
      ...koTab,
      title: bt(koTab.title, enTab.title),
      blurb: bt(koTab.blurb, enTab.blurb),
      studioLabel: bt(koTab.studioLabel, enTab.studioLabel),
      clips: koTab.clips.map((koClip, clipIndex) => {
        const enClip = enTab.clips[clipIndex] ?? koClip;
        return {
          ...koClip,
          title: bt(koClip.title, enClip.title),
          description: bt(koClip.description, enClip.description),
        };
      }),
    };
  });
}

function TrackPill({
  id,
  title,
  active,
  onSelect,
  onKeyDown,
}: {
  readonly id: ShaperLearnTabId;
  readonly title: string;
  readonly active: boolean;
  readonly onSelect: (id: ShaperLearnTabId) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`shaper-learn-tab-${id}`}
      aria-selected={active}
      aria-controls={`shaper-learn-panel-${id}`}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(id)}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-center text-sm font-medium transition-colors duration-150 [word-break:keep-all] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
        active
          ? "border-accent bg-accent text-on-accent shadow-md shadow-accent/25"
          : "border-line-strong bg-card text-fg-2 hover:bg-raised",
      )}
    >
      {title}
    </button>
  );
}

function ClipRow({ clip }: { readonly clip: ShaperLearnTab["clips"][number] }) {
  const bt = useBilingual("CharacterShaperLearnCenter");
  const [levelKo, levelEn] = SHAPER_LEARN_LEVEL_LABEL[clip.level];
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-card/40 p-3.5">
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
      >
        <Play size={18} className="translate-x-0.5" />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-bold leading-snug text-fg [word-break:keep-all]">{clip.title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-fg-2 [word-break:keep-all]">{clip.description}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-fg-2">
          <span className="rounded-full border border-line bg-raised/60 px-2 py-0.5 font-semibold">
            {bt(levelKo, levelEn)}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock size={13} aria-hidden="true" />
            {formatClipDuration(clip.durationSeconds)}
          </span>
          {clip.videoUrl ? (
            <a href={clip.videoUrl} className="font-medium text-accent underline-offset-2 hover:underline">
              {bt("영상 보기", "Watch video")}
            </a>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export function CharacterShaperLearnCenter() {
  const bt = useBilingual("CharacterShaperLearnCenter");
  const [activeTab, setActiveTab] = useState<ShaperLearnTabId>("presets");
  const tabs = localizeLearnTabs(bt);
  const tab = tabs.find((candidate) => candidate.id === activeTab) ?? tabs[0];
  if (!tab) return null;
  const videoPending = tab.clips.some((clip) => !clip.videoUrl);

  // 방향키·Home·End로 트랙을 옮기는 WAI-ARIA 탭 패턴(선택이 따라 움직이고 포커스도 따라간다).
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = tabs.length - 1;
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[next];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div id="learn-center" data-character-shaper-learn="true">
      <p className="mb-3 text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
        {bt(
          "30초 분량의 짧은 수업 네 가지 트랙. 바로 해보기로 같은 패널을 편집기에서 열 수 있습니다.",
          "Four tracks of short 30-second lessons. Use Try it now to open the same panel in the editor.",
        )}
      </p>
      <div role="tablist" aria-label={bt("학습 트랙", "Learning tracks")} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {tabs.map((candidate, index) => (
          <TrackPill
            key={candidate.id}
            id={candidate.id}
            title={candidate.title}
            active={candidate.id === activeTab}
            onSelect={setActiveTab}
            onKeyDown={(event) => moveTab(event, index)}
          />
        ))}
      </div>

      <div
        key={tab.id}
        role="tabpanel"
        id={`shaper-learn-panel-${tab.id}`}
        aria-labelledby={`shaper-learn-tab-${tab.id}`}
        className="mt-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 max-w-2xl text-sm leading-relaxed text-fg-2 [word-break:keep-all]">{tab.blurb}</p>
          <Link
            // 예전 작업실 별칭은 이 랜딩으로 돌아오므로 편집기를 바로 여는 주소로 바꾼다.
            href={resolveCharacterShaperEntryHref(tab.studioHref)}
            aria-label={formatI18nTemplate(bt("바로 해보기 — {label} 열기", "Try it now — open {label}"), { label: tab.studioLabel })}
            className={buttonClass({ variant: "solid", size: "md" })}
          >
            {bt("바로 해보기", "Try it now")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        {videoPending ? (
          <p className="mt-3 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
            {bt(
              "영상은 아직 준비 중입니다. 아래 설명을 보며 편집기에서 바로 따라 해 보세요.",
              "Videos are still in production. Follow the steps below in the editor for now.",
            )}
          </p>
        ) : null}

        <ul className="mt-3 grid gap-2.5 lg:grid-cols-3">
          {tab.clips.map((clip) => (
            <ClipRow key={clip.id} clip={clip} />
          ))}
        </ul>
      </div>
    </div>
  );
}

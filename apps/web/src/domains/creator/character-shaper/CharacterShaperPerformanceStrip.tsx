/**
 * 뷰포트 아래 표정·포즈·손 모양 썸네일 스트립(참조 아트의 하단 필름 스트립).
 *
 * 카드는 오른쪽 선반과 같은 카탈로그 항목이고, 누르면 같은 적용 명령으로 한 번에 한 Undo 단계만
 * 쌓인다. 썸네일은 실제 렌더가 아니라 모양 도해이므로 머리말에 그 사실을 적는다.
 */
import { Check } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { CHARACTER_POSE_GROUPS } from "./character-shaper-catalog";
import {
  CHARACTER_PERFORMANCE_TABS,
  listCharacterPerformanceEntries,
} from "./character-shaper-performance";
import { CharacterSlotPreview } from "./character-shaper-preview";
import { isCharacterEntrySelected } from "./character-shaper-ui-model";

import type { CharacterPoseGroupId } from "./character-shaper-catalog";
import type { CharacterPerformancePoseFilter, CharacterPerformanceTab } from "./character-shaper-performance";
import type { CharacterSlotEntry } from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const PREVIEW_SIZE = 50;

/** 카탈로그의 포즈 묶음 이름은 한국어뿐이라 영어 표시는 여기서 짝을 맞춘다. */
const POSE_GROUP_EN: Readonly<Record<CharacterPoseGroupId, string>> = {
  daily: "Daily",
  emotion: "Emotion",
  action: "Action",
  sitting: "Sit & lie",
  reaction: "Reaction",
};

export function CharacterShaperPerformanceStrip({ binding, onCommitEntry }: {
  readonly binding: CharacterShaperBinding;
  readonly onCommitEntry: (entry: CharacterSlotEntry) => void;
}) {
  const bt = useBilingual("CharacterShaperPerformanceStrip");
  const baseId = useId();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<CharacterPerformanceTab>("expression");
  const [poseFilter, setPoseFilter] = useState<CharacterPerformancePoseFilter>("featured");
  const entries = useMemo(
    () => listCharacterPerformanceEntries(binding.catalog.entries, tab, poseFilter),
    [binding.catalog.entries, poseFilter, tab],
  );
  if (binding.profile.status !== "ready") return null;

  const lockReason = binding.busyReason
    ?? (binding.compareActive ? bt("처음 상태 비교를 마친 뒤에 적용할 수 있습니다.", "Finish comparing with the original first.") : null);
  const panelId = `${baseId}-panel`;
  const tabId = (id: CharacterPerformanceTab) => `${baseId}-${id}`;
  const poseFilters: readonly { readonly id: CharacterPerformancePoseFilter; readonly label: string }[] = [
    { id: "featured", label: bt("추천", "Picks") },
    ...CHARACTER_POSE_GROUPS.map((group) => ({ id: group.id, label: bt(group.label, POSE_GROUP_EN[group.id]) })),
  ];

  const selectTab = (next: CharacterPerformanceTab, focus: boolean) => {
    binding.cancelPreview?.();
    setTab(next);
    if (focus) tabListRef.current?.ownerDocument.getElementById(tabId(next))?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = CHARACTER_PERFORMANCE_TABS.findIndex((item) => item.id === tab);
    const count = CHARACTER_PERFORMANCE_TABS.length;
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % count
      : event.key === "ArrowLeft" ? (index + count - 1) % count
        : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    const next = nextIndex === null ? undefined : CHARACTER_PERFORMANCE_TABS[nextIndex];
    if (!next) return;
    event.preventDefault();
    selectTab(next.id, true);
  };

  return (
    <section
      data-character-performance-strip={tab}
      aria-label={bt("표정·포즈 빠른 적용", "Quick expressions and poses")}
      className="character-performance-strip"
    >
      <div className="character-performance-strip__head">
        <div ref={tabListRef} role="tablist" aria-label={bt("연기 종류", "Performance type")} className="character-performance-strip__tabs">
          {CHARACTER_PERFORMANCE_TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <button
                key={item.id}
                id={tabId(item.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(item.id, false)}
                onKeyDown={handleTabKeyDown}
              >
                {bt(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        {tab === "pose" ? (
          <div role="group" aria-label={bt("포즈 묶음", "Pose groups")} className="character-performance-strip__filters">
            {poseFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={poseFilter === filter.id}
                onClick={() => {
                  binding.cancelPreview?.();
                  setPoseFilter(filter.id);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}
        <p className="character-performance-strip__note">
          {lockReason ?? bt("모양 도해 · 누르면 3D에 바로 적용 · ⌘Z로 되돌리기", "Shape diagrams · tap to apply in 3D · ⌘Z to undo")}
        </p>
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="character-performance-strip__items"
      >
        {entries.map((entry) => {
          const availability = binding.evaluate(entry);
          const selected = isCharacterEntrySelected(binding.recipe, entry);
          const disabled = lockReason !== null || availability.status === "unavailable";
          return (
            <button
              key={entry.id}
              type="button"
              data-character-performance-entry={entry.id}
              aria-pressed={selected}
              disabled={disabled}
              title={lockReason ?? availability.reason ?? entry.hint}
              onClick={() => {
                if (!disabled) onCommitEntry(entry);
              }}
            >
              <CharacterSlotPreview spec={entry.preview} size={PREVIEW_SIZE} selected={selected} title={entry.label} />
              <span className="character-performance-strip__label">{entry.label}</span>
              {selected ? <Check size={12} aria-hidden className="character-performance-strip__check" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

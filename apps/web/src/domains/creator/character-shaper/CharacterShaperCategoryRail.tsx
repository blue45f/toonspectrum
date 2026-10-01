import { useRef } from "react";

import { Studio3dToolIcon } from "../studio-3d-ui/Studio3dToolIcon";
import { CHARACTER_EDIT_CATEGORIES, characterEditCategory } from "./character-shaper-reference-model";
import {
  characterShaperSlotIcon,
  characterSlotDiffersFromBaseline,
  characterSlotForHotkey,
  characterSlotHotkeyLabel,
} from "./character-shaper-ui-model";

import type { CharacterSlotKind } from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { KeyboardEvent } from "react";

import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 방향키·Home/End로 목록 안의 다음 위치를 고른다. 다른 키는 null. */
function nextRovingIndex(key: string, index: number, count: number): number | null {
  const last = count - 1;
  if (key === "Home") return 0;
  if (key === "End") return last;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index + last) % count;
  return null;
}

function categoryChanged(binding: CharacterShaperBinding | undefined, slots: readonly CharacterSlotKind[]): boolean {
  if (!binding) return false;
  return slots.some((slot) => characterSlotDiffersFromBaseline(binding.recipe, binding.baselineRecipe, slot));
}

export function CharacterShaperCategoryRail({ activeSlot, onSelectSlot, binding, mobile = false }: {
  readonly activeSlot: CharacterSlotKind;
  readonly onSelectSlot: (slot: CharacterSlotKind) => void;
  /** 주어지면 처음 상태와 달라진 카테고리에 점을 표시한다. */
  readonly binding?: CharacterShaperBinding;
  readonly mobile?: boolean;
}) {
  const t = useT();
  const bt = useBilingual("CharacterShaperCategoryRail");
  const ref = useRef<HTMLDivElement>(null);
  const active = characterEditCategory(activeSlot);
  return <div ref={ref} role="toolbar" aria-orientation="horizontal"
    aria-label={mobile ? "캐릭터 슬롯" : t("studio.character.categories.title", "편집 카테고리")}
    data-character-shaper-rail={mobile ? "horizontal" : undefined}
    data-character-category-rail={mobile ? "mobile" : "desktop"}
    className="character-category-rail"
    onKeyDown={(event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = CHARACTER_EDIT_CATEGORIES.findIndex((category) => category.id === active.id);
      const next = nextRovingIndex(event.key, index, CHARACTER_EDIT_CATEGORIES.length);
      if (next === null) return;
      event.preventDefault();
      const category = CHARACTER_EDIT_CATEGORIES[next];
      if (!category) return;
      onSelectSlot(category.slots[0]);
      ref.current?.querySelector<HTMLButtonElement>(`[data-character-category="${category.id}"]`)?.focus();
    }}>
    {CHARACTER_EDIT_CATEGORIES.map((category) => {
      const selected = active.id === category.id;
      const changed = categoryChanged(binding, category.slots);
      return <button key={category.id} type="button" data-character-category={category.id}
        data-character-slot={mobile ? category.slots[0] : undefined}
        data-character-category-changed={changed ? "true" : undefined}
        aria-current={selected ? "true" : undefined} aria-pressed={selected}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelectSlot(selected ? activeSlot : category.slots[0])}>
        <span className="character-category-rail__icon"><Studio3dToolIcon name={category.icon} size={23} /></span>
        <span>{t(`studio.character.categories.${category.id}`, category.label)}</span>
        {changed ? <span className="sr-only">{bt("변경됨", "Changed")}</span> : null}
      </button>;
    })}
  </div>;
}

/**
 * 선택한 카테고리 안의 세부 부위(예: 얼굴 → 얼굴형·눈·눈동자·코·입·귀·표정)를 한 줄 탭으로 고른다.
 * 15개 슬롯 문서 계약은 그대로다. 방향키·Home/End와 숫자 1–9는 보이는 탭 순서대로 이동한다.
 * 부위가 하나뿐인 카테고리(헤어·체형·소품)는 표시하지 않는다.
 */
export function CharacterShaperSubslotTabs({ activeSlot, onSelectSlot, binding }: {
  readonly activeSlot: CharacterSlotKind;
  readonly onSelectSlot: (slot: CharacterSlotKind) => void;
  readonly binding: CharacterShaperBinding;
}) {
  const t = useT();
  const bt = useBilingual("CharacterShaperSubslotTabs");
  const ref = useRef<HTMLDivElement>(null);
  const category = characterEditCategory(activeSlot);
  const slots: readonly CharacterSlotKind[] = category.slots;
  if (slots.length < 2) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const nextIndex = nextRovingIndex(event.key, Math.max(0, slots.indexOf(activeSlot)), slots.length);
    const next = characterSlotForHotkey(event.key, slots) ?? (nextIndex === null ? null : slots[nextIndex] ?? null);
    if (!next) return;
    event.preventDefault();
    onSelectSlot(next);
    // 같은 카테고리 안에서만 움직이므로 대상 탭은 이미 화면에 있다.
    ref.current?.querySelector<HTMLButtonElement>(`[data-character-slot="${next}"]`)?.focus();
  };

  return <div ref={ref} role="toolbar" aria-orientation="horizontal"
    aria-label={t("studio.character.categories.part", "세부 부위")}
    data-character-shaper-rail="subslots"
    data-character-subslot-tabs={category.id}
    className="character-subslot-tabs"
    onKeyDown={handleKeyDown}>
    {slots.map((slot) => {
      const meta = binding.catalog.slots.find((item) => item.id === slot);
      const label = meta?.label ?? slot;
      const Icon = characterShaperSlotIcon(meta?.icon, slot);
      const selected = slot === activeSlot;
      const changed = characterSlotDiffersFromBaseline(binding.recipe, binding.baselineRecipe, slot);
      const hotkey = characterSlotHotkeyLabel(slots.indexOf(slot));
      return <button key={slot} type="button" data-character-slot={slot}
        aria-current={selected ? "true" : undefined} aria-pressed={selected}
        aria-keyshortcuts={hotkey ?? undefined}
        tabIndex={selected ? 0 : -1}
        title={`${label}${meta?.hint ? ` · ${meta.hint}` : ""}${hotkey ? ` (${hotkey})` : ""}`}
        onClick={() => onSelectSlot(slot)}>
        <span className="character-subslot-tabs__icon">
          <Icon size={15} aria-hidden />
          {changed ? <span aria-hidden className="character-subslot-tabs__dot" /> : null}
        </span>
        <span className="character-subslot-tabs__label">{label}</span>
        {changed ? <span className="sr-only">{bt("변경됨", "Changed")}</span> : null}
      </button>;
    })}
  </div>;
}

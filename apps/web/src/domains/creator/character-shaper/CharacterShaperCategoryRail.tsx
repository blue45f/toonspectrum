import { useRef } from "react";

import { Studio3dToolIcon } from "../studio-3d-ui/Studio3dToolIcon";
import { CHARACTER_EDIT_CATEGORIES, characterEditCategory } from "./character-shaper-reference-model";

import type { CharacterSlotKind } from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";

import { useT } from "@/shared/lib/i18n";

export function CharacterShaperCategoryRail({ activeSlot, onSelectSlot, mobile = false }: {
  readonly activeSlot: CharacterSlotKind;
  readonly onSelectSlot: (slot: CharacterSlotKind) => void;
  readonly mobile?: boolean;
}) {
  const t = useT();
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
      const last = CHARACTER_EDIT_CATEGORIES.length - 1;
      const next = event.key === "Home" ? 0 : event.key === "End" ? last
        : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % (last + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + last) % (last + 1) : null;
      if (next === null) return;
      event.preventDefault();
      const category = CHARACTER_EDIT_CATEGORIES[next];
      if (!category) return;
      onSelectSlot(category.slots[0]);
      ref.current?.querySelector<HTMLButtonElement>(`[data-character-category="${category.id}"]`)?.focus();
    }}>
    {CHARACTER_EDIT_CATEGORIES.map((category) => {
      const selected = active.id === category.id;
      return <button key={category.id} type="button" data-character-category={category.id}
        data-character-slot={mobile ? category.slots[0] : undefined}
        aria-current={selected ? "true" : undefined} aria-pressed={selected}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelectSlot(selected ? activeSlot : category.slots[0])}>
        <span className="character-category-rail__icon"><Studio3dToolIcon name={category.icon} size={23} /></span>
        <span>{t(`studio.character.categories.${category.id}`, category.label)}</span>
      </button>;
    })}
  </div>;
}

/** 15개 슬롯을 없애지 않고 선택한 카테고리 안에서 정밀 부위를 고른다. */
export function CharacterShaperSubslotSelect({ activeSlot, onSelectSlot, binding }: {
  readonly activeSlot: CharacterSlotKind;
  readonly onSelectSlot: (slot: CharacterSlotKind) => void;
  readonly binding: CharacterShaperBinding;
}) {
  const t = useT();
  const category = characterEditCategory(activeSlot);
  if (category.slots.length < 2) return null;
  return <label className="character-subslot-select">
    <span>{t("studio.character.categories.part", "세부 부위")}</span>
    <select value={activeSlot} aria-label={t("studio.character.categories.part", "세부 부위")}
      onChange={(event) => {
        const slot = category.slots.find((item) => item === event.currentTarget.value);
        if (slot) onSelectSlot(slot);
      }}>
      {category.slots.map((slot) => <option key={slot} value={slot}>{binding.catalog.slots.find((meta) => meta.id === slot)?.label ?? slot}</option>)}
    </select>
  </label>;
}

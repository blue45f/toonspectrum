import { Check } from "lucide-react";

import { CharacterSlotPreview } from "./character-shaper-preview";
import { isCharacterEntrySelected } from "./character-shaper-ui-model";

import type { CharacterSlotEntry, CharacterSlotKind } from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";

import { useT } from "@/shared/lib/i18n";

/** 아래 필름 스트립도 같은 적용 명령을 쓴다. 도해를 실제 캐릭터 썸네일로 표현하지 않는다. */
export function CharacterShaperQuickPresets({ binding, slot, onCommitEntry }: {
  readonly binding: CharacterShaperBinding;
  readonly slot: CharacterSlotKind;
  readonly onCommitEntry: (entry: CharacterSlotEntry) => void;
}) {
  const t = useT();
  const entries = binding.catalog.entries.filter((entry) => entry.slot === slot && entry.apply.kind !== "wardrobe")
    .toSorted((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.order - b.order).slice(0, 6);
  if (!entries.length || binding.profile.status !== "ready") return null;
  const locked = binding.busyReason !== null || binding.compareActive;
  return <div data-character-quick-presets="true" className="character-quick-presets">
    <div className="character-quick-presets__heading"><strong>{t("studio.character.quickPresets.title", "빠른 프리셋")}</strong>
      <span>{t("studio.character.quickPresets.diagram", "모양 도해 · 선택하면 3D에 적용")}</span></div>
    <div role="group" aria-label={t("studio.character.quickPresets.title", "빠른 프리셋")} className="character-quick-presets__strip">
      {entries.map((entry) => {
        const available = binding.evaluate(entry);
        const selected = isCharacterEntrySelected(binding.recipe, entry);
        return <button key={entry.id} type="button" data-character-quick-preset={entry.id} aria-pressed={selected}
          disabled={locked || available.status === "unavailable"}
          title={available.reason ?? entry.hint}
          onClick={() => { if (!locked && binding.evaluate(entry).status !== "unavailable") onCommitEntry(entry); }}>
          <CharacterSlotPreview spec={entry.preview} size={52} selected={selected} title={entry.label} />
          <span>{entry.label}</span>{selected ? <Check size={12} aria-hidden /> : null}
        </button>;
      })}
    </div>
  </div>;
}

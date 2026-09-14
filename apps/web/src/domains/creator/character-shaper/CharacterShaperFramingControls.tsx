import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { CHARACTER_OUTPUT_ASPECTS } from "./character-shaper-framing";

import type { CharacterCompositionGuide, CharacterOutputAspect, CharacterOutputFraming } from "./character-shaper-framing";

import { cn } from "@/shared/lib/utils";

interface Props {
  readonly value: CharacterOutputFraming;
  readonly disabled: boolean;
  readonly onChange: (value: CharacterOutputFraming) => void;
}
const SELECT = cn("min-h-11 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg disabled:opacity-45", STUDIO_FOCUS_RING);

export function CharacterShaperFramingControls({ value, disabled, onChange }: Props) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="원고 구도">
    <label className="flex min-w-0 items-center gap-2 text-xs text-fg-2">PNG·PSD 비율
      <select aria-label="원고 출력 비율" className={SELECT} disabled={disabled} value={value.aspect}
        onChange={(event) => onChange({ ...value, aspect: event.currentTarget.value as CharacterOutputAspect })}>
        {CHARACTER_OUTPUT_ASPECTS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>
    </label>
    <select aria-label="구도 가이드" className={SELECT} disabled={disabled} value={value.guide}
      onChange={(event) => onChange({ ...value, guide: event.currentTarget.value as CharacterCompositionGuide })}>
      <option value="none">가이드 없음</option><option value="thirds">삼분할</option><option value="center">중앙 십자</option>
    </select>
    <button type="button" aria-pressed={value.safeArea} disabled={disabled} className={SELECT}
      title="프레임 안쪽 5% 여백을 표시합니다. 가이드는 출력되지 않습니다."
      onClick={() => onChange({ ...value, safeArea: !value.safeArea })}>안전 여백 5%</button>
  </div>;
}

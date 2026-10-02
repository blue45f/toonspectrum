import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export type SpaceAtmosphere = "focus" | "balanced" | "lively";

const MODES: readonly (readonly [SpaceAtmosphere, string, string])[] = [
  ["focus", "집중", "Focus"],
  ["balanced", "일상", "Balanced"],
  ["lively", "활기", "Lively"],
];

/** 작업실 분위기(집중·일상·활기). 저장은 호출 측이 맡는다. */
export const SpaceAtmosphereSettings = memo(function SpaceAtmosphereSettings({ value, localOnly, onChange }: {
  readonly value: SpaceAtmosphere;
  readonly localOnly: boolean;
  readonly onChange: (next: SpaceAtmosphere) => void;
}) {
  const bt = useBilingual("SpaceAtmosphereSettings");
  return <section className="vs2-panel studio-vspace-atmosphere" data-space-interactive="true">
    <h2>{bt("작업실 분위기", "Studio atmosphere")}</h2>
    <div role="group" aria-label={bt("작업실 분위기", "Studio atmosphere")}>
      {MODES.map(([mode, ko, en]) => <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}>{bt(ko, en)}</button>)}
    </div>
    <p>{bt("NPC의 움직임과 인사 빈도를 조절해요. 집중 모드에서는 대화 요청도 잠시 멈춰요.", "Adjust NPC movement and greetings. Focus mode also pauses social invitations.")}</p>
    {localOnly ? <details data-studio-virtual-offline="true"><summary>{bt("로컬 작업 중", "Working locally")}</summary><p>{bt("이동과 캐시된 작업은 계속할 수 있어요. 팀원 연결은 온라인으로 돌아오면 복구돼요.", "Movement and cached work remain available. Teammates reconnect when you return online.")}</p></details> : null}
  </section>;
});

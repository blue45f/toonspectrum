import { Hand, MessageCircle } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { spaceKoParticle } from "./space-korean";

export interface SpaceInteractTarget {
  readonly kind: "interaction" | "npc";
  readonly labelKo: string;
  readonly labelEn: string;
}

/**
 * 도크 위 상호작용 프롬프트. 근처 대상이 있을 때만 보인다.
 * data-interact-prompt 버튼은 Canvas의 상호작용 게이트가 인식하는 DOM 보조 버튼이다.
 */
export const SpaceInteractPrompt = memo(function SpaceInteractPrompt({ target, touch, onActivate }: {
  readonly target: SpaceInteractTarget | null;
  readonly touch: boolean;
  readonly onActivate: () => void;
}) {
  const bt = useBilingual("SpaceInteractPrompt");
  if (!target) return null;
  const label = bt(target.labelKo, target.labelEn);
  const Icon = target.kind === "npc" ? MessageCircle : Hand;
  return <button type="button" className="space-interact-prompt" data-interact-prompt="true" data-space-interactive="true"
    data-target-kind={target.kind} aria-keyshortcuts={touch ? undefined : "E X"}
    aria-label={target.kind === "npc" ? bt(`${spaceKoParticle(label, "과")} 대화하기`, `Talk with ${label}`) : bt(`${label} 상호작용하기`, `Interact with ${label}`)}
    onClick={onActivate}>
    {touch ? <Icon size={18} aria-hidden /> : <kbd aria-hidden>X / E</kbd>}
    <span aria-hidden>{label}</span>
  </button>;
});

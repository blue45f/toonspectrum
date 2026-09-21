import { StudioWorldRuleDialog } from "./StudioWorldRuleDialog";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { StudioWorldInteractionRule } from "@toonspectrum/studio-project-model/world-publication";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";
import { evaluateStudioWorldInteraction } from "./studio-world-interaction-rule";

interface Pending { readonly world: StudioVirtualSpaceWorldManifest; readonly activity: StudioVirtualSpaceActivity;
  readonly interaction: StudioWorldInteractionDefinition; readonly rule: StudioWorldInteractionRule }
export function useStudioWorldRuleGate(world: StudioVirtualSpaceWorldManifest, activity: StudioVirtualSpaceActivity,
  onActivate: (action: StudioWorldInteractionDefinition["action"]) => void) {
  const bt = useBilingual("StudioWorldRuleGate"), [pending, setPending] = useState<Pending | null>(null), [notice, setNotice] = useState("");
  const current = useRef({ world, activity, onActivate }); current.current = { world, activity, onActivate };
  const pendingRef = useRef<Pending | null>(null);
  const close = useCallback(() => { pendingRef.current = null; setPending(null); }, []);
  useLayoutEffect(() => { pendingRef.current = null; setPending(null); setNotice(""); }, [world, activity]);
  const request = useCallback((interaction: StudioWorldInteractionDefinition) => {
    pendingRef.current = null; setNotice(""); const result = evaluateStudioWorldInteraction(world, interaction, activity);
    if (result.kind === "direct") { onActivate(result.action); return; }
    if (result.kind === "confirm") { const item = { world, activity, interaction, rule: result.rule }; pendingRef.current = item; setPending(item); return; }
    setPending(null); setNotice(result.kind === "blocked" ? bt("현재 작업 상태에서는 이 공간 규칙을 실행하지 않습니다. 상태를 직접 변경하거나 도구 메뉴를 사용하세요.", "This world rule does not run in your current activity. Change your status explicitly or use the tool menu.")
      : bt("현재 공간의 도구 연결을 확인하지 못했습니다.", "The current world interaction could not be verified."));
  }, [world, activity, onActivate, bt]);
  const confirm = () => {
    const item = pendingRef.current; pendingRef.current = null; setPending(null);
    if (!item || item.world !== current.current.world || item.activity !== current.current.activity || document.visibilityState === "hidden") return;
    const result = evaluateStudioWorldInteraction(current.current.world, item.interaction, current.current.activity);
    if (result.kind === "confirm" && JSON.stringify(result.rule) === JSON.stringify(item.rule)) current.current.onActivate(result.rule.action);
  };
  return { request, element: <>
    {notice ? <p role="status" className="rounded-lg border border-line bg-card p-3 text-sm" data-space-interactive="true">{notice}</p> : null}
    {pending && pending.world === world && pending.activity === activity ? <StudioWorldRuleDialog rule={pending.rule} onCancel={close} onConfirm={confirm} /> : null}
  </> };
}

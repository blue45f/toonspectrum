import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { useMemo } from "react";

import { planStudioLayerEffectsStack } from "./studio-layer-effects-graph-adapter";

import type { StudioLayerEffectsStack } from "./studio-layer-effects-stack";

export function StudioLayerEffectsGraphStatus({
  stack,
  sourceHash = "active-layer",
}: {
  readonly stack: StudioLayerEffectsStack;
  readonly sourceHash?: string;
}) {
  const plan = useMemo(
    () => planStudioLayerEffectsStack(stack, sourceHash, "webgpu"),
    [sourceHash, stack],
  );
  const enabled = stack.effects.filter((effect) => effect.enabled).length;
  return (
    <details
      className="rounded-lg border border-line/70 bg-panel/40"
      data-studio-layer-effect-graph="true"
      data-effect-graph-cache-key={plan.cacheKey}
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-2.5 text-[0.65rem] font-semibold text-fg-2">
        <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsGraphStatus", "ko", "비파괴 효과 그래프")}</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[0.56rem] text-fg-3">
          {enabled}{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsGraphStatus", "ko", "개 · ")}{plan.backend.toUpperCase()}
        </span>
      </summary>
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-line/60 px-2.5 py-2 text-[0.58rem] leading-relaxed">
        <dt className="font-semibold text-fg-3">{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsGraphStatus", "ko", "실행 단계")}</dt>
        <dd className="text-fg-2">{plan.steps.length}{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsGraphStatus", "ko", "개")}</dd>
        <dt className="font-semibold text-fg-3">{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsGraphStatus", "ko", "공통 권위")}</dt>
        <dd className="text-fg-2">{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsGraphStatus", "ko", "미리보기·출력 동일 파라미터 DAG")}</dd>
        <dt className="font-semibold text-fg-3">{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsGraphStatus", "ko", "캐시 키")}</dt>
        <dd className="truncate font-mono text-fg-3" title={plan.cacheKey}>{plan.cacheKey}</dd>
      </dl>
    </details>
  );
}

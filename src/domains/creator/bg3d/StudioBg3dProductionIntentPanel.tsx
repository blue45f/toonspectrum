import {
  BrainCircuit,
  Check,
  ClipboardCheck,
  Layers,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  detectStudioBg3dProductionIntent,
  planStudioBg3dProductionIntent,
  STUDIO_BG3D_PRODUCTION_INTENTS,
  type StudioBg3dProductionIntentId,
} from "./studio-bg3d-production-intents";
import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";

function IntentIcon({ id }: { readonly id: StudioBg3dProductionIntentId }) {
  switch (id) {
    case "review":
      return <ClipboardCheck className="size-3.5" aria-hidden />;
    case "manuscript":
      return <Layers className="size-3.5" aria-hidden />;
    case "composite":
      return <Sparkles className="size-3.5" aria-hidden />;
    case "ai-reference":
      return <BrainCircuit className="size-3.5" aria-hidden />;
  }
}

export function StudioBg3dProductionIntentPanel() {
  const runtime = useStudioBg3dProSuiteRuntime();
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const batch = runtime?.productionBatch;
  const scene = runtime?.sceneSummary;

  const activeIntent = useMemo(() => {
    if (!batch || !scene) return null;
    return detectStudioBg3dProductionIntent({
      availablePasses: batch.availablePasses,
      selectedPasses: batch.selectedPasses,
      includeLayeredPsd: batch.includeLayeredPsd,
      includeContactSheet: batch.includeContactSheet,
      lineArtPreview: scene.lineArtPreview,
      transparentBackground: scene.transparentBackground,
    });
  }, [batch, scene]);

  if (!runtime || !batch || !scene) return null;

  const applyIntent = (intentId: StudioBg3dProductionIntentId) => {
    if (runtime.disabled || batch.isRendering) return;
    const plan = planStudioBg3dProductionIntent(batch.availablePasses, intentId);

    if (runtime.productionShots.length > 0) batch.selectAllShots();
    batch.setSelectedPasses(plan.selectedPasses);
    batch.setIncludeLayeredPsd(plan.definition.includeLayeredPsd);
    batch.setIncludeContactSheet(plan.definition.includeContactSheet);
    runtime.onSetLineArtPreview?.(plan.definition.lineArtPreview);
    runtime.onSetTransparentBackground?.(plan.definition.transparentBackground);
    setAppliedMessage(
      `${plan.definition.label} 프리셋을 적용했습니다. 출력 전 컷과 패키지 계획을 확인하세요.`,
    );
  };

  return (
    <section
      className="mx-3 mt-3 rounded-2xl border border-line bg-card/75 p-3 shadow-sm"
      aria-labelledby="studio-bg3d-production-intent-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id="studio-bg3d-production-intent-title"
            className="flex items-center gap-1.5 text-[0.7rem] font-bold text-fg"
          >
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            전체 제작 프리셋
          </h3>
          <p className="mt-1 text-[0.57rem] leading-relaxed text-fg-3">
            컷 선택·패스·PSD·콘택트 시트·선화·배경 알파를 작업 목적에 맞춰 함께 설정합니다.
          </p>
        </div>
        <span className="rounded-full border border-good/40 bg-good/10 px-2 py-1 text-[0.52rem] font-bold text-good">
          자동 출력 안 함
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5" role="group" aria-label="3D 전체 제작 프리셋">
        {STUDIO_BG3D_PRODUCTION_INTENTS.map((intent) => {
          const selected = activeIntent === intent.id;
          return (
            <button
              key={intent.id}
              type="button"
              disabled={runtime.disabled || batch.isRendering}
              aria-pressed={selected}
              title={intent.description}
              onClick={() => applyIntent(intent.id)}
              className={`flex min-h-12 items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 ${
                selected
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {selected ? <Check className="size-3.5" aria-hidden /> : <IntentIcon id={intent.id} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.6rem] font-bold">{intent.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-[0.51rem] font-normal leading-relaxed text-fg-3">
                  {intent.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {appliedMessage ? (
        <p className="mt-2 text-[0.54rem] leading-relaxed text-good" role="status" aria-live="polite">
          {appliedMessage}
        </p>
      ) : runtime.productionShots.length === 0 ? (
        <p className="mt-2 text-[0.54rem] leading-relaxed text-warn">
          프리셋 설정은 미리 적용됩니다. 현재 장면을 컷으로 저장하면 배치 선택 단계가 이어집니다.
        </p>
      ) : null}
    </section>
  );
}

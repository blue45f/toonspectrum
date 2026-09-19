import { ArrowUpRight, Boxes, Camera, Clapperboard, Download } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_BG3D_CONTROL_BUTTON, studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dCompositionLensPanel } from "./StudioBg3dCompositionLensPanel";
import { StudioBg3dProfessionalReadinessPanel } from "./StudioBg3dProfessionalReadinessPanel";

const SplatReference = lazy(() => import("../scene3d/specialists/StudioScene3dSplatReferencePanel").then((module) => ({ default: module.StudioScene3dSplatReferencePanel })));
const AssetTools = lazy(() => import("../scene3d/specialists/StudioScene3dAssetToolsPanel").then((module) => ({ default: module.StudioScene3dAssetToolsPanel })));
const Director = lazy(() => import("./StudioBg3dCinematicDirectorPanel").then((module) => ({ default: module.StudioBg3dCinematicDirectorPanel })));
const MultiPass = lazy(() => import("./StudioBg3dMultiPassExporterPanel").then((module) => ({ default: module.StudioBg3dMultiPassExporterPanel })));

export type ProSuiteActiveTab = "lens" | "director" | "multipass";
export type ProSuiteCategory = "director";
export interface StudioBg3dProSuitePanelProps {
  readonly disabled?: boolean;
  readonly onOpenPrecisionModeler?: () => void;
}

const TOOLS = [
  { id: "lens", label: "구도", icon: Camera },
  { id: "director", label: "컷 디렉터", icon: Clapperboard },
  { id: "multipass", label: "원고 출력", icon: Download },
] as const;

/** Only canonical scene commands belong here. Prototype calculators are not production controls. */
export function StudioBg3dProSuitePanel({
  disabled = false,
  onOpenPrecisionModeler,
}: StudioBg3dProSuitePanelProps) {
  const t = useBilingual("scene3d-specialists");
  const runtime = useStudioBg3dProSuiteRuntime();
  const id = useId();
  const [assetToolsOpen, setAssetToolsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProSuiteActiveTab>("lens");
  const [visited, setVisited] = useState<ReadonlySet<ProSuiteActiveTab>>(() => new Set(["lens"]));
  const locked = disabled || (runtime?.disabled ?? true);
  function activate(tab: ProSuiteActiveTab) {
    setActiveTab(tab);
    if (!visited.has(tab)) setVisited(new Set([...visited, tab]));
  }

  return (
    <div className="space-y-3 p-3 text-fg" data-bg3d-production-workbench="true">
      <div>
        <h2 className="text-sm font-semibold">웹툰 컷 제작</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">구도를 잡고, 여러 컷으로 저장한 뒤, 레이어가 나뉜 원고로 출력합니다.</p>
      </div>
      {!runtime && <p role="status" className="rounded-lg border border-line p-3 text-xs text-fg-2">3D 장면을 연 뒤 사용할 수 있습니다.</p>}
      {runtime ? (
        <StudioBg3dProfessionalReadinessPanel readiness={runtime.professionalReadiness} />
      ) : null}
      <section
        aria-labelledby={`${id}-precision-modeler-title`}
        className="rounded-xl border border-accent/35 bg-accent-soft/35 p-3 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent/35 bg-card text-accent"
            aria-hidden="true"
          >
            <Boxes className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={`${id}-precision-modeler-title`} className="text-xs font-bold text-fg">
              정밀 메시 · CAD 모델링
            </h3>
            <p className="mt-1 text-[0.7rem] leading-relaxed text-fg-2">
              현재 BG3D 장면을 복구 가능한 원본으로 먼저 보존한 뒤 면·모서리 선택,
              압출·베벨·불리언, 치수 입력과 파라메트릭 편집을 시작합니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="studio-bg3d-open-precision-modeler"
          disabled={locked || !onOpenPrecisionModeler}
          onClick={onOpenPrecisionModeler}
          className={cx(
            STUDIO_BG3D_CONTROL_BUTTON,
            "mt-3 w-full border-accent/55 bg-card text-accent hover:bg-raised disabled:border-line disabled:text-fg-3",
          )}
        >
          <Boxes className="size-3.5" aria-hidden="true" />
          정밀 모델링 워크스페이스 열기
          <ArrowUpRight className="ml-auto size-3.5" aria-hidden="true" />
        </button>
        {onOpenPrecisionModeler ? (
          <p className="mt-1.5 text-[0.66rem] leading-relaxed text-fg-3">
            BG3D 오브젝트를 CAD 형상으로 자동 변환하지 않습니다. DCC에서 만든 검증된 메시를 다시
            3D 배경 편집기로 전달하는 안전한 파생 흐름을 사용합니다.
          </p>
        ) : (
          <p className="mt-1.5 text-[0.66rem] leading-relaxed text-fg-3" aria-live="polite">
            문서 편집기에서 3D 장면을 열면 정밀 모델링 워크스페이스로 이동할 수 있습니다.
          </p>
        )}
      </section>
      <button type="button" aria-expanded={assetToolsOpen} aria-controls={`${id}-asset-tools`} disabled={locked}
        className={cx(STUDIO_BG3D_CONTROL_BUTTON, "w-full")} onClick={() => setAssetToolsOpen((open) => !open)}>
        {t("3D 자산 고급 가공 · LOD / 불리언 / 이동 경로", "Advanced 3D assets · LOD / Boolean / Navigation")}
      </button>
      {assetToolsOpen && <div id={`${id}-asset-tools`}><Suspense fallback={<p role="status">{t("3D 자산 도구를 불러오는 중입니다.", "Loading 3D asset tools.")}</p>}>
        <AssetTools disabled={locked || runtime?.proSuiteActive === false} />
        <SplatReference disabled={locked || runtime?.proSuiteActive === false} />
      </Suspense></div>}
      <div role="tablist" aria-label="웹툰 컷 제작 단계" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-card p-1">
        {TOOLS.map((tool, index) => {
          const Icon = tool.icon;
          return <button key={tool.id} type="button" role="tab" id={`${id}-${tool.id}-tab`} aria-controls={`${id}-${tool.id}-panel`}
            aria-selected={activeTab === tool.id} tabIndex={activeTab === tool.id ? 0 : -1}
            className={cx(STUDIO_BG3D_CONTROL_BUTTON, "border-transparent px-1", activeTab === tool.id ? "bg-raised text-fg" : "text-fg-2 hover:bg-raised")}
            onClick={() => activate(tool.id)} onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? TOOLS.length - 1 : step ? (index + step + TOOLS.length) % TOOLS.length : null;
              if (nextIndex === null) return;
              event.preventDefault();
              const next = TOOLS[nextIndex];
              activate(next.id);
              document.getElementById(`${id}-${next.id}-tab`)?.focus();
            }}><Icon className="size-3.5 shrink-0" aria-hidden="true" />{tool.label}</button>;
        })}
      </div>
      {TOOLS.map((tool) => <div key={tool.id} role="tabpanel" id={`${id}-${tool.id}-panel`} aria-labelledby={`${id}-${tool.id}-tab`} hidden={activeTab !== tool.id}>
        {visited.has(tool.id) && <Suspense fallback={<p role="status" className="p-3 text-xs text-fg-2">제작 도구를 불러오는 중입니다.</p>}>
          {tool.id === "lens" && <StudioBg3dCompositionLensPanel disabled={locked} />}
          {tool.id === "director" && runtime && <Director disabled={locked || activeTab !== "director" || runtime.proSuiteActive === false} />}
          {tool.id === "multipass" && runtime?.productionBatch && <MultiPass disabled={locked} />}
          {tool.id === "multipass" && runtime && !runtime.productionBatch && <p role="status" className="p-3 text-xs text-fg-2">출력할 장면과 컷 정보를 준비하고 있습니다.</p>}
        </Suspense>}
      </div>)}
    </div>
  );
}

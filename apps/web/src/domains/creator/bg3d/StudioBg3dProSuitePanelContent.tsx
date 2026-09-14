import { Camera, Clapperboard, Download } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { STUDIO_BG3D_CONTROL_BUTTON, studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dCompositionLensPanel } from "./StudioBg3dCompositionLensPanel";

const Director = lazy(() => import("./StudioBg3dCinematicDirectorPanel").then((module) => ({ default: module.StudioBg3dCinematicDirectorPanel })));
const MultiPass = lazy(() => import("./StudioBg3dMultiPassExporterPanel").then((module) => ({ default: module.StudioBg3dMultiPassExporterPanel })));

export type ProSuiteActiveTab = "lens" | "director" | "multipass";
export type ProSuiteCategory = "director";
export interface StudioBg3dProSuitePanelProps { readonly disabled?: boolean }

const TOOLS = [
  { id: "lens", label: "구도", icon: Camera },
  { id: "director", label: "컷 디렉터", icon: Clapperboard },
  { id: "multipass", label: "원고 출력", icon: Download },
] as const;

/** Only canonical scene commands belong here. Prototype calculators are not production controls. */
export function StudioBg3dProSuitePanel({ disabled = false }: StudioBg3dProSuitePanelProps) {
  const runtime = useStudioBg3dProSuiteRuntime();
  const id = useId();
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

import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dMultiPassExporterPanel as StudioBg3dMultiPassExporterPanelContent } from "./StudioBg3dMultiPassExporterPanelContent";
import { StudioBg3dProductionMultiPassExporterPanel } from "./StudioBg3dProductionMultiPassExporterPanel";
import { StudioBg3dProductionWorkflowPanel } from "./StudioBg3dProductionWorkflowPanel";

import type { StudioBg3dMultiPassExporterPanelProps } from "./StudioBg3dMultiPassExporterPanelContent";

export type { StudioBg3dMultiPassExporterPanelProps } from "./StudioBg3dMultiPassExporterPanelContent";

/**
 * Uses the canonical shot-batch runtime inside the editor and keeps the self-contained planner for
 * stories, tests and standalone embedding. An explicit export callback always selects standalone
 * mode, while editor locks can never be overridden by passing `disabled={false}`.
 */
export function StudioBg3dMultiPassExporterPanel(
  props: StudioBg3dMultiPassExporterPanelProps,
) {
  const runtime = useStudioBg3dProSuiteRuntime();
  const disabled = (props.disabled ?? false) || (runtime?.disabled ?? false);

  if (runtime?.productionBatch && props.onStartMultiPassExport === undefined) {
    return (
      <>
        <StudioBg3dProductionWorkflowPanel
          variant="export"
          defaultExpanded={false}
        />
        <StudioBg3dProductionMultiPassExporterPanel
          disabled={disabled}
          shots={runtime.productionShots}
          batch={runtime.productionBatch}
        />
      </>
    );
  }

  return (
    <StudioBg3dMultiPassExporterPanelContent
      {...props}
      disabled={disabled}
    />
  );
}

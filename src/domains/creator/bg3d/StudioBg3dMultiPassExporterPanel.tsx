import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dMultiPassExporterPanel as StudioBg3dMultiPassExporterPanelContent } from "./StudioBg3dMultiPassExporterPanelContent";

import type { StudioBg3dMultiPassExporterPanelProps } from "./StudioBg3dMultiPassExporterPanelContent";

export type { StudioBg3dMultiPassExporterPanelProps } from "./StudioBg3dMultiPassExporterPanelContent";

/** Inherits the editor capture lock even when the parent Pro Suite tab omits the disabled prop. */
export function StudioBg3dMultiPassExporterPanel(
  props: StudioBg3dMultiPassExporterPanelProps,
) {
  const runtime = useStudioBg3dProSuiteRuntime();
  return (
    <StudioBg3dMultiPassExporterPanelContent
      {...props}
      disabled={props.disabled ?? runtime?.disabled ?? false}
    />
  );
}

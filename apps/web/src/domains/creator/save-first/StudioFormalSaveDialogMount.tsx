import { useStudioOnDemandModule } from "../useStudioOnDemandModule";
import { StudioOnDemandModuleStatus } from "../StudioOnDemandModuleStatus";
import type { StudioFormalSaveDialogProps } from "./StudioFormalSaveDialog";

const loadSaveDialog = () => import("./StudioFormalSaveDialog");

/** Only the optional presentation is deferred; autosave and the save transaction stay in the host. */
export function StudioFormalSaveDialogMount(props: StudioFormalSaveDialogProps) {
  const state = useStudioOnDemandModule(loadSaveDialog, props.open);
  if (state.module) return <state.module.StudioFormalSaveDialog {...props} />;
  if (!props.open) return null;
  return <StudioOnDemandModuleStatus failed={state.failed} onRetry={state.retry}
    onCancel={() => { if (!props.busy) props.onClose(); }} />;
}

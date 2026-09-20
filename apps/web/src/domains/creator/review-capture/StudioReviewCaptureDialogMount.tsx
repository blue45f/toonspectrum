import { StudioOnDemandModuleStatus } from "../StudioOnDemandModuleStatus";
import { useStudioOnDemandModule } from "../useStudioOnDemandModule";

import type { ComponentProps } from "react";
import type { StudioReviewCaptureDialog } from "./StudioReviewCaptureDialog";

const loadDialog = () => import("./StudioReviewCaptureDialog");

export function StudioReviewCaptureDialogMount(props: ComponentProps<typeof StudioReviewCaptureDialog>) {
  const state = useStudioOnDemandModule(loadDialog, props.open);
  if (state.module) return <state.module.StudioReviewCaptureDialog {...props} />;
  if (!props.open) return null;
  return <StudioOnDemandModuleStatus failed={state.failed} onRetry={state.retry} onCancel={props.onClose} />;
}

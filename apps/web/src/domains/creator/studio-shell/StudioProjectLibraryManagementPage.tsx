import { Container } from "@/shared/components/section";

import { StudioProjectLibraryManagementContent } from "./StudioProjectLibraryManagementContent";
import { StudioProjectLibraryManagementDialogs } from "./StudioProjectLibraryManagementDialogs";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { StudioProjectStartPanel } from "./StudioProjectStartPanel";
import { StudioRolePersonalizationCenter } from "./StudioRolePersonalizationCenter";
import { StudioRoleWorkspacePanel } from "./StudioRoleWorkspacePanel";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

export function StudioProjectLibraryManagementPage() {
  const controller = useStudioProjectLibraryManagementController();
  return (
    <div data-route-ready="studio-project-library" className="min-h-[calc(100vh-4rem)] min-w-0 bg-bg">
      <Container size="wide" className="min-w-0 py-7 sm:py-11">
        <StudioProjectLibraryManagementHeader controller={controller} />
        {controller.view === "active" ? (
          <>
            <StudioRoleWorkspacePanel locale={controller.locale} />
            <StudioRolePersonalizationCenter locale={controller.locale} />
            <StudioProjectStartPanel locale={controller.locale} />
          </>
        ) : null}
        <StudioProjectLibraryManagementContent controller={controller} />
      </Container>
      <StudioProjectLibraryManagementDialogs controller={controller} />
    </div>
  );
}

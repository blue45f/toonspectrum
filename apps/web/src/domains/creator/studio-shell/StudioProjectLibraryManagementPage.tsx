import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioProjectLibraryManagementContent } from "./StudioProjectLibraryManagementContent";
import { StudioProjectLibraryManagementDialogs } from "./StudioProjectLibraryManagementDialogs";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { StudioProjectStartPanel } from "./StudioProjectStartPanel";
import { StudioRolePersonalizationCenter } from "./StudioRolePersonalizationCenter";
import { StudioRoleWorkspacePanel } from "./StudioRoleWorkspacePanel";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

export function StudioProjectLibraryManagementPage() {
  const controller = useStudioProjectLibraryManagementController();
  const bt = useBilingual("StudioProjectLibraryManagementPage");
  return (
    <div data-route-ready="studio-project-library" className="min-h-[calc(100vh-4rem)] min-w-0 bg-bg">
      <Container size="wide" className="min-w-0 py-7 sm:py-11">
        <StudioProjectLibraryManagementHeader controller={controller} />
        <StudioProjectLibraryManagementContent controller={controller} />
        {controller.view === "active" ? <details className="workspace-library-personalize">
          <summary>{bt("작업 방식과 시작 가이드 설정", "Work preferences and getting started")}</summary>
          <StudioRoleWorkspacePanel locale={controller.locale} />
          <StudioProjectStartPanel locale={controller.locale === "ko" ? "ko" : "en"} />
          <StudioRolePersonalizationCenter locale={controller.locale} />
        </details> : null}
      </Container>
      <StudioProjectLibraryManagementDialogs controller={controller} />
    </div>
  );
}

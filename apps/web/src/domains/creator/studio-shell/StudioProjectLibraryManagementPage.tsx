import { Container } from "@/shared/components/section";

import { StudioProjectLibraryManagementContent } from "./StudioProjectLibraryManagementContent";
import { StudioProjectLibraryManagementDialogs } from "./StudioProjectLibraryManagementDialogs";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

export function StudioProjectLibraryManagementPage() {
  const controller = useStudioProjectLibraryManagementController();
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-11">
        <StudioProjectLibraryManagementHeader controller={controller} />
        <StudioProjectLibraryManagementContent controller={controller} />
      </Container>
      <StudioProjectLibraryManagementDialogs controller={controller} />
    </main>
  );
}

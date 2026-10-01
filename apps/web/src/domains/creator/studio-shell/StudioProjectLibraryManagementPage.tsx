import { Suspense, useState } from "react";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import { StudioPanelLoading } from "../StudioLazySurfaceFallback";
import { StudioCreatorLobby } from "./StudioCreatorLobby";
import { StudioProjectLibraryManagementContent } from "./StudioProjectLibraryManagementContent";
import { StudioProjectLibraryManagementDialogs } from "./StudioProjectLibraryManagementDialogs";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

import "./studio-visual-identity.css";
import "./studio-visual-identity-v2.css";
import "./studio-illustrated-project-surfaces.css";

// 떠 있는 음성 안내 버튼(음성 합성·자막 모듈)은 목록 첫 화면 뒤에 불러온다.
const VoiceGuideButton = lazyRetry(
  () => import("@/shared/voice").then((module) => ({ default: module.VoiceGuideButton })),
  "StudioLibraryVoiceGuideButton",
);

const StudioLibraryPersonalizePanels = lazyRetry(
  () => import("./StudioLibraryPersonalizePanels").then((module) => ({
    default: module.StudioLibraryPersonalizePanels,
  })),
  "StudioLibraryPersonalizePanels",
);

/** 접힌 설정 묶음은 처음 펼칠 때만 청크와 프로필 요청을 시작한다. */
function StudioLibraryPersonalizeDetails({ locale }: { readonly locale: string }) {
  const bt = useBilingual("StudioProjectLibraryManagementPage");
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="workspace-library-personalize"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>{bt("작업 방식과 시작 가이드 설정", "Work preferences and getting started")}</summary>
      {opened ? (
        <Suspense fallback={<StudioPanelLoading label={bt("설정을 불러오는 중…", "Loading preferences…")} />}>
          <StudioLibraryPersonalizePanels locale={locale} />
        </Suspense>
      ) : null}
    </details>
  );
}

export function StudioProjectLibraryManagementPage() {
  const controller = useStudioProjectLibraryManagementController();
  return (
    <div data-studio-illustrated-surface="library" data-route-ready="studio-project-library" className="studio-visual-identity-page min-h-[calc(100vh-4rem)] min-w-0 bg-bg">
      <Suspense fallback={null}>
        <VoiceGuideButton scriptId="studio" variant="fixed" />
      </Suspense>
      <Container size="wide" className="min-w-0 py-7 sm:py-11">
        {controller.view === "active" ? <StudioCreatorLobby controller={controller} /> : null}
        <StudioProjectLibraryManagementHeader controller={controller} />
        <StudioProjectLibraryManagementContent controller={controller} />
        {controller.view === "active" ? <StudioLibraryPersonalizeDetails locale={controller.locale} /> : null}
      </Container>
      <StudioProjectLibraryManagementDialogs controller={controller} />
    </div>
  );
}

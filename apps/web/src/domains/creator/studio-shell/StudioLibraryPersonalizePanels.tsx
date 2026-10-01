import { StudioProjectStartPanel } from "./StudioProjectStartPanel";
import { StudioRolePersonalizationCenter } from "./StudioRolePersonalizationCenter";
import { StudioRoleWorkspacePanel } from "./StudioRoleWorkspacePanel";

/**
 * 작업 방식·직무 설정 묶음. 작품 홈에서는 접힌 상태가 기본이므로 펼칠 때만 청크와
 * 프로필 요청을 시작한다.
 */
export function StudioLibraryPersonalizePanels({ locale }: { readonly locale: string }) {
  return (
    <>
      <StudioRoleWorkspacePanel locale={locale} />
      <StudioProjectStartPanel locale={locale === "ko" ? "ko" : "en"} />
      <StudioRolePersonalizationCenter locale={locale} />
    </>
  );
}

import { resolveStudioCreatorBundledCatalogTarget } from "./studio-creator-pack-runtime";
import type { StudioCreatorPackDefinition } from "./studio-creator-pack-catalog";
import type { StudioBg3dSceneDocument } from "./bg3d/studio-bg3d-scene-document";
import type { StudioMarketplaceBundledCatalogOpenResult, StudioMarketplaceInstallGuard } from "./studio-marketplace-deep-link";

interface CatalogActions {
  isCurrent: () => boolean;
  canMutate: () => boolean;
  openTemplate: (id: string) => void;
  openBackground3d: () => void;
  setInitialScene: (scene: StudioBg3dSceneDocument) => void;
}
/** Keep delivery and cancellation outside the editor's render closure. */
export async function openStudioMarketplaceCatalog(
  pack: StudioCreatorPackDefinition, actions: CatalogActions,
): Promise<StudioMarketplaceBundledCatalogOpenResult> {
  const resolution = resolveStudioCreatorBundledCatalogTarget(pack);
  if (resolution.status === "unsupported") return { status: "unsupported", message: resolution.reason };
  if (!actions.isCurrent() || !actions.canMutate()) return { status: "unsupported", message: "작업 대상이 바뀌어 에셋 열기를 취소했습니다." };
  if (resolution.target.kind === "scene-template-catalog") {
    actions.openTemplate(resolution.target.templateId);
    return { status: "opened", message: "장면 템플릿 카탈로그를 열었어요. 원하는 장면 카드를 눌러 현재 컷에 적용하세요." };
  }
  if (resolution.target.kind === "3d-asset-catalog") {
    const { prepareStudioMarketplaceCc0ModelScene } = await import("./studio-marketplace-cc0-model");
    const scene = await prepareStudioMarketplaceCc0ModelScene(
      resolution.target.runtimeRef,
      { isCurrent: () => actions.isCurrent() && actions.canMutate() },
    );
    if (!actions.isCurrent() || !actions.canMutate()) {
      return { status: "unsupported", message: "작업 대상이 바뀌어 3D 에셋 열기를 취소했습니다." };
    }
    actions.openBackground3d();
    actions.setInitialScene(scene);
    const modelName = scene.nodes.find((node) => node.kind === "model")?.name ?? "선택한";
    return { status: "opened", message: `${modelName} 모델을 3D 편집기에 불러왔어요. 렌더링을 확인하고 컷에 삽입하세요.` };
  }
  actions.openBackground3d();
  return { status: "opened", message: "배경 3D 도형·절차형 카탈로그를 열었어요. 원하는 항목을 직접 선택해 장면에 추가하세요." };
}

export async function confirmStudioMarketplacePackSync(
  synchronize: () => Promise<{ message: string }>, guard: StudioMarketplaceInstallGuard,
  onSuccess: () => void, onFailure: (issue: string) => void,
): Promise<{ status: "synchronized"; message: string }> {
  guard.assertCurrent();
  try {
    const synchronized = await synchronize();
    guard.assertCurrent();
    onSuccess();
    return { status: "synchronized", message: synchronized.message };
  } catch (caught: unknown) {
    guard.assertCurrent();
    const issue = caught instanceof Error && caught.message.trim()
      ? caught.message : "계정 라이브러리 설치 확인을 동기화하지 못했습니다.";
    onFailure(issue);
    throw caught;
  }
}

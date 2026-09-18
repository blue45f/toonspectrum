import { useLayoutEffect, useRef, useState } from "react";

import { createStudioCc0ModelFile, studioCc0AssetUrl } from "../studio-cc0-asset-delivery";
import { resolveStudioMarketplaceCc0Model } from "../studio-marketplace-cc0-registry";

import type { StudioBg3dModelImportActions } from "./studio-bg3d-editor-model-import-actions";

export function StudioMarketplaceModelImport({ modelId, scopeKey, disabled, onImport }: {
  readonly modelId: string | null;
  readonly scopeKey: string;
  readonly disabled: boolean;
  readonly onImport: StudioBg3dModelImportActions["importModelFiles"];
}) {
  const asset = resolveStudioMarketplaceCc0Model(`studio-3d-asset:cc0/${modelId ?? ""}`);
  const controllerRef = useRef<AbortController | null>(null);
  const latestRef = useRef({ disabled, onImport });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  useLayoutEffect(() => { latestRef.current = { disabled, onImport }; }, [disabled, onImport]);
  useLayoutEffect(() => {
    setPending(false);
    setNotice("");
    return () => { controllerRef.current?.abort(); controllerRef.current = null; };
  }, [modelId, scopeKey]);
  async function importSelected(): Promise<void> {
    if (!asset || latestRef.current.disabled || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setNotice("");
    try {
      const file = await createStudioCc0ModelFile(asset, controller.signal);
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (latestRef.current.disabled) throw new Error("현재 장면의 잠금·복원 상태를 확인해 주세요.");
      const imported = await latestRef.current.onImport([file], {
        status: "public-domain", commercialUse: true, attributionRequired: false,
        licenseName: "CC0 1.0", attribution: `${asset.provider} — ${asset.sourceUrl}`,
      }, controller.signal);
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      setNotice(imported ? `${asset.name}을(를) 장면에 배치했습니다.` : "모델을 배치하지 못했습니다. 3D 편집기의 오류 안내와 기기 예산을 확인해 주세요.");
    } catch (error: unknown) {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        setNotice(error instanceof Error ? error.message : "모델을 가져오지 못했습니다.");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  }
  if (!asset) return null;
  return (
    <section aria-label="선택한 마켓 3D 에셋" className="m-3 space-y-2 rounded-xl border border-accent/40 bg-card p-3">
      <h3 className="text-sm font-bold text-fg">{asset.name}</h3>
      {asset.previewPath ? <img src={studioCc0AssetUrl(asset.previewPath)} alt={`${asset.name} 모델 미리보기`} className="max-h-36 w-full rounded-lg object-contain" /> : null}
      <p className="text-xs text-fg-3">선택한 상품의 GLB를 해시·형식·기기 예산 검사 후 장면에 배치합니다. 최종 2D 컷 적용은 편집기의 삽입 버튼을 사용하세요.</p>
      <button type="button" disabled={disabled || pending} onClick={() => void importSelected()} className="min-h-11 w-full rounded-lg border border-line px-3 text-xs font-semibold text-fg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
        {pending ? "검증·가져오는 중…" : "선택한 마켓 모델 가져오기"}
      </button>
      {pending ? <button type="button" className="min-h-11 w-full rounded-lg border border-line px-3 text-xs text-fg-2 focus-visible:ring-2 focus-visible:ring-accent" onClick={() => {
        controllerRef.current?.abort(); setNotice("모델 가져오기를 취소했습니다.");
      }}>가져오기 취소</button> : null}
      <p role="status" aria-live="polite" className="text-xs text-fg-2">{notice}</p>
    </section>
  );
}

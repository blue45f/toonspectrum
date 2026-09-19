import { loadBrushStudioSavedMaterial } from "./brush-studio-saved-material-loader";
import { serializeBrushStudioV6Authoring } from "./brush-studio-v6-authoring-document";
import type { BrushStudioV6Program } from "./brush-studio-v6-engine";
import { LoaderCircle } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { MarketplaceBrushStudioBridge } from "../MarketplaceBrushStudioBridge";
import { StudioBrushV6Workbench } from "./StudioBrushV6Workbench";
import {
  brushStudioV6StorageKey,
  resolveBrushStudioRequestedRecipe,
} from "./brush-studio-version-integration";

const BRUSH_V6_PROGRAM_EVENT = "toonspectrum:brush-v6-program";

/** Connects product brushes, V6 editing and marketplace publishing on one Brush Editor route. */
export function StudioBrushIntegratedWorkbench({ scope }: { readonly scope: string }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [initialProgram, setInitialProgram] = useState<BrushStudioV6Program>();

  useLayoutEffect(() => {
    let cancelled = false;
    setReady(false); setLoadError(""); setInitialProgram(undefined); setSnapshot(null);
    const capture = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return;
      setSnapshot(event.detail);
    };
    window.addEventListener(BRUSH_V6_PROGRAM_EVENT, capture);

    const requested = resolveBrushStudioRequestedRecipe(location.search);
    const storageKey = brushStudioV6StorageKey(scope);
    if (requested) {
      try {
        window.localStorage.setItem(storageKey, serializeBrushStudioV6Authoring(requested.program));
        setSnapshot(requested.program);
        setGeneration((current) => current + 1);
        setNotice(requested.productBrushId
          ? `${requested.productBrushId} 제품 브러시의 특성을 참고한 새 레시피를 열었습니다. 원본 엔진·설정을 그대로 편집하는 기능은 아닙니다.`
          : `${requested.program.name} 레시피를 열었습니다.`);
      } catch {
        setInitialProgram(requested.program);
        setSnapshot(requested.program);
        setNotice("브라우저 저장소를 사용할 수 없어 이번 세션에서만 레시피를 엽니다.");
      }
    } else {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored !== null) { /* The guarded editor decodes and preserves the original text. */ }
        else if (scope.startsWith("brush:")) {
          void loadBrushStudioSavedMaterial(scope.slice("brush:".length)).then((loaded) => {
            if (cancelled) return;
            try {
              if (window.localStorage.getItem(storageKey) === null) {
                setInitialProgram(loaded.program); setSnapshot(loaded.program);
                setNotice(`‘${loaded.program.name}’의 실제 재료 설정을 열었습니다. 원본은 보존하고 저장 시 새 브러시로 추가합니다.${loaded.persistent ? "" : " 현재 라이브러리는 세션 전용입니다."}`);
              } else {
                setNotice("불러오는 동안 편집 내용이 변경되어 가장 최근의 저장된 편집 내용을 유지했습니다.");
              }
              setGeneration((current) => current + 1);
            } catch {
              setLoadError("편집 저장소를 확인하지 못했습니다. 원본은 변경하지 않았습니다.");
            }
            setReady(true);
          }, (error: unknown) => {
            if (cancelled) return;
            setLoadError(error instanceof Error ? error.message : "브러시 원본을 읽지 못했습니다.");
            setReady(true);
          });
          return () => { cancelled = true; window.removeEventListener(BRUSH_V6_PROGRAM_EVENT, capture); };
        }
      } catch {
        setLoadError("저장된 편집 내용을 읽지 못했습니다. 기존 설정을 덮어쓰지 않았습니다.");
      }
    }
    setReady(true);
    return () => { cancelled = true; window.removeEventListener(BRUSH_V6_PROGRAM_EVENT, capture); };
  }, [location.search, scope]);

  if (!ready) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-line bg-card/55 text-sm text-fg-3" role="status">
        <LoaderCircle size={16} className="mr-2 animate-spin" aria-hidden="true" />
        브러시 프로그램 연결 중
      </div>
    );
  }

  if (loadError) return <section role="alert" className="space-y-3 rounded-xl border border-warning p-4">
    <h2 className="font-bold">브러시 원본을 변경하지 않았습니다</h2><p>{loadError}</p>
    <a href="/studio/assets/brushes" className="inline-flex min-h-11 items-center">브러시 목록으로</a>
  </section>;

  return (
    <>
      {notice ? (
        <p className="rounded-xl border border-warning/35 bg-warning-soft/15 px-3 py-2 text-xs leading-5 text-warning" role="status">
          {notice}
        </p>
      ) : null}
      <StudioBrushV6Workbench key={`${scope}:${generation}`} scope={scope} initialProgram={initialProgram} />
      <div className="rounded-2xl border border-line bg-card/45 p-4">
        <p className="text-xs leading-5 text-fg-3">
          완성한 브러시는 ‘스튜디오에 브러시 저장’으로 라이브러리에 추가하세요.
          원고에서 사용한 재료 설정은 획마다 보존되며, 그리기와 내보내기에 같은 접촉 계산을 사용합니다.
        </p>
        <div className="mt-3">
          <MarketplaceBrushStudioBridge snapshot={snapshot} visible={snapshot !== null} />
        </div>
      </div>
    </>
  );
}

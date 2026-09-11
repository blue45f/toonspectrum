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

/**
 * Connects explicit V5→V6 recipe succession and the existing marketplace publish bridge without
 * pretending that V6 is already the normal canvas pixel authority.
 */
export function StudioBrushIntegratedWorkbench({ scope }: { readonly scope: string }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [notice, setNotice] = useState("");

  useLayoutEffect(() => {
    const capture = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return;
      setSnapshot(event.detail);
    };
    window.addEventListener(BRUSH_V6_PROGRAM_EVENT, capture);

    const requested = resolveBrushStudioRequestedRecipe(location.search);
    const storageKey = brushStudioV6StorageKey(scope);
    if (requested) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(requested.program));
        setSnapshot(requested.program);
        setGeneration((current) => current + 1);
        setNotice(requested.legacyBrushId
          ? `${requested.legacyBrushId}의 V5 설계를 가장 가까운 V6 레시피로 열었습니다. 픽셀 동일 변환이 아니므로 실제 획을 비교한 뒤 저장하세요.`
          : `${requested.program.name} V6 레시피를 열었습니다.`);
      } catch {
        setNotice("브라우저 저장소를 사용할 수 없어 이번 세션에서만 V6 레시피를 엽니다.");
      }
    } else {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) setSnapshot(JSON.parse(stored));
      } catch {
        // The workbench remains usable with its in-memory default.
      }
    }
    setReady(true);
    return () => window.removeEventListener(BRUSH_V6_PROGRAM_EVENT, capture);
  }, [location.search, scope]);

  if (!ready) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-line bg-card/55 text-sm text-fg-3" role="status">
        <LoaderCircle size={16} className="mr-2 animate-spin" aria-hidden="true" />
        브러시 프로그램 연결 중
      </div>
    );
  }

  return (
    <>
      {notice ? (
        <p className="rounded-xl border border-warning/35 bg-warning-soft/15 px-3 py-2 text-xs leading-5 text-warning" role="status">
          {notice}
        </p>
      ) : null}
      <StudioBrushV6Workbench key={`${scope}:${generation}`} scope={scope} />
      <div className="rounded-2xl border border-line bg-card/45 p-4">
        <p className="text-xs leading-5 text-fg-3">
          V6 프로그램은 이 제작 화면과 마켓 게시 브리지에 연결됩니다. 일반 캔버스의 기존 브러시
          snapshot·live/commit 렌더 권위는 아직 별도이므로, 현재 원고에서는 기존 브러시 세부 설정과
          실제 획 비교를 함께 사용합니다.
        </p>
        <div className="mt-3">
          <MarketplaceBrushStudioBridge snapshot={snapshot} visible={snapshot !== null} />
        </div>
      </div>
    </>
  );
}

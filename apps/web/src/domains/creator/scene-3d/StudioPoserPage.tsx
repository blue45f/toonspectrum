/**
 * `/studio/poser` — 포즈 스튜디오 독립 진입점.
 *
 * 감사 지적(데드 링크) 해소: `character-shaper-learn-clips`,
 * `studio-immersive-workflows`, 사이트 디렉터리·헤더 등이 `/studio/poser`를
 * 가리키나 라우트가 미등록이라 404가 났다. 이 페이지가 실제 포저
 * (`StudioMannequinPoserPanel`, 매직 포저 탭 포함)를 직접 마운트한다.
 *
 * - 닫기 → `/studio`로 복귀.
 * - 캡처 삽입 → 독립 진입점에는 삽입할 문서가 없으므로 PNG를 다운로드한다.
 * - `?starter=` 쿼리(예: `action-pose-rig`)는 현재 무시하고 포저를 바로 연다.
 *   스타터 프리셋 자동 적용은 후속 작업으로 남긴다.
 */

import { useCallback, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import {
  StudioMannequinPoserPanel,
  type StudioMannequinCaptureResult,
} from "./StudioMannequinPoserPanel";

export function StudioPoserPage(): ReactElement {
  const navigate = useNavigate();

  const handleClose = useCallback(() => {
    navigate("/studio", { replace: true });
  }, [navigate]);

  const handleInsert = useCallback(
    (result: StudioMannequinCaptureResult): boolean => {
      const anchor = document.createElement("a");
      anchor.href = result.pngDataUrl;
      anchor.download = `toonstudio-pose-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return true;
    },
    [],
  );

  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <StudioMannequinPoserPanel
        open
        onClose={handleClose}
        onInsert={handleInsert}
      />
    </main>
  );
}

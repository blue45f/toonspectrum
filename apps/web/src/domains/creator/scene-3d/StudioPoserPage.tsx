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
 * - `?starter=` 쿼리(예: `action-pose-rig`)는 데생 인형·웹툰 포즈 프리셋에서 찾아
 *   패널이 열릴 때 자동으로 적용한다. 알 수 없는 id는 무시하고 빈 포저를 연다.
 */

import { useCallback, type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { StudioPageIntro } from "../page-intro/StudioPageIntro";

import {
  StudioMannequinPoserPanel,
  type StudioMannequinCaptureResult,
} from "./StudioMannequinPoserPanel";

export function StudioPoserPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const starterPresetId = searchParams.get("starter")?.trim() || undefined;

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
    <div className="relative min-h-dvh bg-canvas text-fg">
      {/* 독립 페이지라 문서 제목(h1)이 필요하다 — 패널 제목은 다이얼로그용 h2라 별도로 둔다. */}
      <h1 className="sr-only">포즈 스튜디오</h1>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <div className="pointer-events-auto">
          <StudioPageIntro motif="pose" />
        </div>
      </div>
      <StudioMannequinPoserPanel
        open
        onClose={handleClose}
        onInsert={handleInsert}
        initialPosePresetId={starterPresetId}
      />
    </div>
  );
}

/**
 * 캐릭터 셰이퍼 편집기 코드와 3D 런타임을 내려받는 동안 보이는 자리표시 화면.
 *
 * 실제 편집기와 같은 세 영역(캐릭터 목록 · 3D 뷰포트 · 편집 탭)을 같은 자리에 그려 두어,
 * 준비가 끝나면 화면이 튀지 않고 내용만 채워진다. 무거운 모듈을 가져오지 않는 가벼운 컴포넌트다.
 */
import { LoaderCircle } from "lucide-react";
import { createPortal } from "react-dom";

import "../studio-3d-ui/studio-3d-reference-workspace.css";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const CATEGORY_COUNT = 6;
const LIBRARY_ROWS = 4;
const SHELF_TILES = 6;

export function CharacterShaperEditorLoading() {
  const bt = useBilingual("CharacterShaperEditorLoading");
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-studio-3d-reference="tooncraft"
      data-character-shaper-loading="true"
      className="character-editor-loading"
    >
      <div className="character-editor-loading__surface">
        <div className="character-editor-loading__bar">
          <span className="skeleton h-4 w-28 motion-reduce:animate-none" />
          <span className="skeleton h-9 w-40 rounded-xl motion-reduce:animate-none" />
          <span className="ml-auto skeleton h-9 w-24 rounded-xl motion-reduce:animate-none" />
        </div>
        <div className="character-editor-loading__body">
          <div className="character-editor-loading__library" aria-hidden>
            {Array.from({ length: LIBRARY_ROWS }, (_, index) => (
              <span key={index} className="skeleton h-[4.25rem] w-full rounded-xl motion-reduce:animate-none" />
            ))}
          </div>
          <div className="character-editor-loading__stage">
            <div className="character-editor-loading__card">
              <LoaderCircle size={26} aria-hidden className="animate-spin text-accent motion-reduce:animate-none" />
              <p className="character-editor-loading__title">{bt("캐릭터 편집기를 여는 중", "Opening the character editor")}</p>
              <p className="character-editor-loading__hint">
                {bt(
                  "3D 엔진과 샘플 캐릭터를 준비하고 있습니다. 처음 한 번은 조금 더 걸릴 수 있습니다.",
                  "Preparing the 3D engine and a sample character. The first launch can take a little longer.",
                )}
              </p>
            </div>
          </div>
          <div className="character-editor-loading__controls" aria-hidden>
            <div className="character-editor-loading__tabs">
              {Array.from({ length: CATEGORY_COUNT }, (_, index) => (
                <span key={index} className="skeleton h-11 w-full rounded-lg motion-reduce:animate-none" />
              ))}
            </div>
            <div className="character-editor-loading__tiles">
              {Array.from({ length: SHELF_TILES }, (_, index) => (
                <span key={index} className="skeleton aspect-square w-full rounded-xl motion-reduce:animate-none" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

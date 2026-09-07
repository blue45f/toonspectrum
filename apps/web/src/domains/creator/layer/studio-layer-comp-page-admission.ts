import {
  hasSameStudioCrdtPageMetadata,
  studioPageToCrdtPage,
} from "../live/studio-crdt-page-payload";

import type { PageState } from "../studio-page-state";

/** Keep accepted preset pages publishable without serializing metadata on every drawing sample. */
export function studioLayerCompPageAdmissionError(
  previous: PageState | undefined,
  next: PageState,
): string | null {
  if (next.layerComps === undefined || hasSameStudioCrdtPageMetadata(previous, next)) return null;
  try {
    studioPageToCrdtPage(next);
    return null;
  } catch {
    return "페이지의 콤프 저장 용량을 넘어 변경하지 않았어요. 콤프 개수나 캡처할 레이어를 줄이거나 페이지 메모를 정리해 주세요.";
  }
}

import { useEffect, useState } from "react";

import {
  parseStudioProjectThumbnailLocator,
  readStudioProjectThumbnailBlob,
} from "../studio-project-thumbnail";

/**
 * 라이브러리 항목의 thumbnailUrl을 실제 <img src>로 쓸 수 있는 값으로 해석한다.
 *
 * - 일반 URL(http·data 등)은 그대로 통과시킨다.
 * - `studio-thumbnail:v1/<projectId>` 로케이터는 IndexedDB에 저장된 Blob을 읽어
 *   Object URL로 바꾼다. 해석 전·실패 시에는 null이라 호출자는 기존 폴백
 *   (타이포그래픽 커버·빈 상태)을 그대로 보여 주면 된다.
 */
export function useResolvedStudioProjectThumbnailUrl(
  thumbnailUrl: string | null,
): string | null {
  const locatorProjectId = thumbnailUrl
    ? parseStudioProjectThumbnailLocator(thumbnailUrl)
    : null;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!locatorProjectId) {
      setObjectUrl(null);
      return undefined;
    }
    let disposed = false;
    let created: string | null = null;
    void readStudioProjectThumbnailBlob(locatorProjectId).then((blob) => {
      if (disposed || !blob) return;
      if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
      try {
        created = URL.createObjectURL(blob);
      } catch {
        return;
      }
      setObjectUrl(created);
    }, () => undefined);
    return () => {
      disposed = true;
      if (created && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(created);
      }
    };
  }, [locatorProjectId]);

  if (!thumbnailUrl) return null;
  return locatorProjectId ? objectUrl : thumbnailUrl;
}

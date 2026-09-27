import { useCallback, useState } from "react";

export function useStudioEditorStatusNotices(documentKey: string, ownerId: string | null) {
  // 일반 작업의 중립 안내와 오프라인 보호 성공을 분리한다. 필수 오류는 기존 오류 채널이 소유한다.
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<{
    documentKey: string;
    ownerId: string | null;
    message: string;
  } | null>(null);
  const reportOfflineNotice = useCallback((message: string) => {
    setOfflineNotice({ documentKey, ownerId, message });
  }, [documentKey, ownerId]);
  const dismissOfflineSceneNotice = useCallback(() => setOfflineNotice(null), []);

  return {
    statusNotice,
    setStatusNotice,
    offlineSceneNotice: {
      report: reportOfflineNotice,
      viewProps: {
        offlineSceneNotice: offlineNotice?.documentKey === documentKey && offlineNotice.ownerId === ownerId
          ? offlineNotice.message : null,
        dismissOfflineSceneNotice,
      },
    },
  };
}

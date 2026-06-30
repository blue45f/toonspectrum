import { requestNotificationAgreement } from '@apps-in-toss/web-framework';

/**
 * 토스 스마트 발송 - 기능성 알림 수신 동의 요청 도구.
 * 샌드박스/라이브 환경에 맞춰 requestNotificationAgreement 를 호출해요.
 */
export function requestPushAgreement(templateCode: string): Promise<'agree' | 'reject' | 'error'> {
  return new Promise((resolve) => {
    try {
      if (typeof requestNotificationAgreement !== 'function') {
        resolve('error');
        return;
      }
      let cleanupFn: (() => void) | null = null;
      let resolved = false;

      const handleEvent = (type: string) => {
        if (resolved) return;
        resolved = true;
        if (type === 'newAgreement' || type === 'alreadyAgreed') {
          resolve('agree');
        } else {
          resolve('reject');
        }
        setTimeout(() => {
          if (cleanupFn) {
            cleanupFn();
          }
        }, 0);
      };

      cleanupFn = requestNotificationAgreement({
        options: { templateCode },
        onEvent: ({ type }) => {
          handleEvent(type);
        },
        onError: () => {
          if (!resolved) {
            resolved = true;
            resolve('error');
          }
          setTimeout(() => {
            if (cleanupFn) {
              cleanupFn();
            }
          }, 0);
        },
      });
    } catch {
      resolve('error');
    }
  });
}

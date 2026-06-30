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
      const cleanup = requestNotificationAgreement({
        options: { templateCode },
        onEvent: ({ type }) => {
          if (type === 'newAgreement' || type === 'alreadyAgreed') {
            resolve('agree');
          } else if (type === 'agreementRejected') {
            resolve('reject');
          }
          cleanup();
        },
        onError: () => {
          resolve('error');
          cleanup();
        },
      });
    } catch {
      resolve('error');
    }
  });
}

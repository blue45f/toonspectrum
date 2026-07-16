/// <reference types="vite/client" />
interface ImportMetaEnv {
  // 배포된 toonspectrum API 오리진. 웹과 동일한 변수명(공유 ky 클라이언트가 절대 베이스로 푼다).
  readonly VITE_API_BASE?: string;
  // Socket.IO를 제공하는 장기 실행 Nest origin. Vercel serverless API와 독립적으로 지정한다.
  readonly VITE_STUDIO_LIVE_ORIGIN?: string;
  // 마이그레이션 호환 폴백(예전 변수명). 신규 설정은 VITE_API_BASE 를 쓴다.
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TOSS_AD_GROUP_ID?: string;
  readonly VITE_TOSS_FEED_AD_GROUP_ID?: string;
  readonly VITE_TOSS_INTERSTITIAL_AD_GROUP_ID?: string;
  readonly VITE_TOSS_REWARDED_AD_GROUP_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

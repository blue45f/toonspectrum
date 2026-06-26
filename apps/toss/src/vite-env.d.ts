/// <reference types="vite/client" />
interface ImportMetaEnv {
  // 배포된 toonspectrum API 오리진. 웹과 동일한 변수명(공유 ky 클라이언트가 절대 베이스로 푼다).
  readonly VITE_API_BASE?: string;
  // 마이그레이션 호환 폴백(예전 변수명). 신규 설정은 VITE_API_BASE 를 쓴다.
  readonly VITE_API_BASE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

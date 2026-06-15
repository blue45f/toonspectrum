/// <reference types="vite/client" />

interface ImportMetaEnv {
  // SurveyDesk 피드백 위젯 엔드포인트. 미설정 시 위젯을 마운트하지 않는다(앱 무영향).
  readonly VITE_SURVEYDESK_URL?: string;
}

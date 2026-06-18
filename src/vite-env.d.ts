/// <reference types="vite/client" />

interface ImportMetaEnv {
  // DeskCloud 네이티브 통합(@heejun/deskcloud) — 각 desk 의 API 베이스 URL.
  // 미설정 시 해당 통합을 마운트하지 않는다(앱 무영향). 선택 VITE_*_PK 는 publishable 키
  // (pk_…, 미설정 시 'pk_demo' 폴백, 브라우저 노출 안전).
  // SurveyDesk — 인앱 피드백 설문.
  readonly VITE_SURVEYDESK_URL?: string;
  readonly VITE_SURVEYDESK_PK?: string;
  // ChangelogDesk — 'What's new' 인앱 체인지로그.
  readonly VITE_CHANGELOGDESK_URL?: string;
  readonly VITE_CHANGELOGDESK_PK?: string;
  // NotifyDesk — 인앱 알림 벨/인박스.
  readonly VITE_NOTIFYDESK_URL?: string;
  readonly VITE_NOTIFYDESK_PK?: string;
}

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
  // desk-platform — 공개 문의(Inquiry) 게시판 백엔드 베이스 URL.
  // 미설정 시 prod 기본값(https://desk-platform.vercel.app)으로 폴백한다. (lib/inquiry-api.ts)
  readonly VITE_DESK_PLATFORM_URL?: string;
  // 통합 로그인(Firebase Auth, deskcloud-fleet-auth) — 리터럴 금지, env 로만 주입(lib/firebaseAuth/config.ts).
  // apiKey/appId 미설정 시 런타임 인증 비활성(isFirebaseAuthConfigured=false), 빌드/타입은 정상.
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

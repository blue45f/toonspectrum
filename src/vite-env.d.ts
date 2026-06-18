/// <reference types="vite/client" />

interface ImportMetaEnv {
  // SurveyDesk 피드백 위젯 엔드포인트. 미설정 시 위젯을 마운트하지 않는다(앱 무영향).
  readonly VITE_SURVEYDESK_URL?: string;

  // DeskCloud 위젯 — 각 desk 의 API 베이스 URL. 미설정 시 해당 위젯을 마운트하지 않는다(앱 무영향).
  // 선택 VITE_*_PK 는 publishable 키(미설정 시 'pk_demo' 폴백, 브라우저 노출 안전).
  // ChangelogDesk — 'What's new' 인앱 체인지로그.
  readonly VITE_CHANGELOGDESK_URL?: string;
  readonly VITE_CHANGELOGDESK_PK?: string;
  // NotifyDesk — 인앱 알림 벨/인박스.
  readonly VITE_NOTIFYDESK_URL?: string;
  readonly VITE_NOTIFYDESK_PK?: string;
  // SearchDesk — ⌘/ 검색 팔레트(전문 검색).
  readonly VITE_SEARCHDESK_URL?: string;
  readonly VITE_SEARCHDESK_PK?: string;
  // ReviewDesk — 평점·리뷰 위젯.
  readonly VITE_REVIEWDESK_URL?: string;
  readonly VITE_REVIEWDESK_PK?: string;
  // CommunityDesk — 게시판/카페 위젯.
  readonly VITE_COMMUNITYDESK_URL?: string;
  readonly VITE_COMMUNITYDESK_PK?: string;
  // MediaDesk — 미디어 업로더/갤러리.
  readonly VITE_MEDIADESK_URL?: string;
  readonly VITE_MEDIADESK_PK?: string;
  // ChatDesk — 실시간 채팅 런처(socket.io).
  readonly VITE_CHATDESK_URL?: string;
  readonly VITE_CHATDESK_PK?: string;
  // ModerationDesk — 신고 버튼.
  readonly VITE_MODERATIONDESK_URL?: string;
  readonly VITE_MODERATIONDESK_PK?: string;
}

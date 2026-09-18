# Creator Ecosystem Platform

## 목적

ToonSpectrum의 창작 기능을 교육 → 창작 → 협업/사업화 → 팬덤 → 소장·열람의 흐름으로 연결한다.
기존 creator-resources, community, creator-support, business 기능을 재사용하고,
계정 동기화가 필요한 데이터만 새 creator-ecosystem 모듈이 소유한다.

## 사용자 화면

- /ecosystem/education: 웹툰 학과·학원·공공 교육기관 디렉터리와 기존 지원사업 검색 연결
- /ecosystem/collaboration: 작가 제안 수신 설정, 기업 인증, 구조화 IP 제안, 받은/보낸 제안함
- /ecosystem/fandom: 기존 팬 커뮤니티 엔진을 재사용한 코스프레·행사·팬아트 허브
- /ecosystem/library: 기존 도서 제공처 검색, 개인 소장/읽음/대여 상태, 도서관 소장 조회
- /learn/education: 교육 허브로 리다이렉트하는 레거시 진입점

## 도메인 경계

### 재사용

- creator-resources: Kakao Books, Open Library, Google Books, openBD, Bizinfo
- community: 이미지 첨부, 댓글, 검색, 신고/운영 기반
- admin/growth/inquiries: 기업 인증 심사 UI를 함께 배치
- 공통 인증: HttpOnly 세션 → 서버가 x-user-id 문맥을 구성하는 기존 경계 유지

### 신규 영속 데이터

1. creator_collaboration_preference
   - 작가 공개 여부
   - 허용 제안 유형
   - 미인증 기업 허용 여부
2. creator_business_profile
   - 기업/단체 정보
   - 인증 상태와 운영자 검토 기록
3. creator_ip_proposal
   - 제안 유형, 예산 범위, 지역, 기간, 독점, 요청 권리
   - 작성 시점 기업 인증 상태 스냅샷
4. creator_collection_item
   - ISBN, 권차, 소장/대여/읽음/판본 상태

## 안전·운영 정책

- 작가는 제안 수신 유형과 미인증 기업 허용 여부를 직접 결정한다.
- 미인증 제안은 기본 차단이며 작가가 명시적으로 허용해야 한다.
- 동일 발신자 → 동일 작가 제안은 하루 최대 5건으로 제한한다.
- 기업 프로필 핵심 정보가 변경되면 기존 인증 상태를 draft로 되돌린다.
- 작가는 신규/검토 중 제안만 수락·거절할 수 있고, 발신자는 신규/검토 중 제안만 철회할 수 있다.
- 개인 서재의 동일 ISBN + 권차 중복 저장을 차단한다.
- 외부 URL은 HTTPS만 저장한다.
- 도서관 API 키가 없거나 제공처가 장애일 때 서비스 전체를 실패시키지 않고 공식 사이트 폴백을 제공한다.
- 도서관 소장 정보는 실시간 대출 가능 여부로 단정하지 않는다.

## 외부 연동

### 도서 검색

기존 /creator-resources/search를 그대로 사용한다.

### 도서관 정보나루

DATA4LIBRARY_AUTH_KEY가 설정된 경우 libSrchByBook을 호출한다.
키가 없으면 not_configured, 제공처 장애 시 unavailable 상태를 반환한다.

## 운영자 흐름

기존 /admin/growth/inquiries 화면 하단에서 기업 인증 큐를 확인한다.

- pending → verified
- pending → rejected + 보완 메모

인증 표시는 플랫폼이 공개 정보와 연락처를 확인했다는 의미이며 계약 이행·지급 능력 보증이 아니다.

## 마이그레이션

apps/api/src/db/migrations/0074_creator_ecosystem.sql

기존 테이블 수정 없이 신규 테이블/인덱스만 추가하는 additive migration이다.

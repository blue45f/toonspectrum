# Studio 게시 정책의 공개 독자 화면 적용

## 배경

게시 명령 센터는 `doc.publication`에 읽기 방식, 진행 방향, 콘텐츠 등급, 댓글·리믹스,
검색 색인과 공유 카드 메타데이터를 저장한다. 저장만 하고 공개 화면이 소비하지 않으면
작가가 최종 확인한 게시 계약과 독자가 경험하는 결과가 달라진다.

## 적용 범위

- `vertical`: 기존 효과툰 세로 리더와 BGM·컷 연출을 그대로 사용한다.
- `paged`: 한 페이지 집중 보기, 썸네일 점프, 이전/다음, Home/End/PageUp/PageDown을 제공한다.
- `rtl`: 문서 페이지 순서는 보존하고 물리적 좌우 화살표의 논리 이동만 반전한다.
- `mature`: 소유자 미리보기를 제외한 독자에게 명시적 확인 단계를 제공한다.
- `comments=closed`: 댓글 API를 불필요하게 호출하지 않고 닫힘 상태를 설명한다.
- `allowRemix=false`: 공개 화면에서 리믹스 진입점을 제거하며 서버 차단과 UI를 일치시킨다.
- `searchIndexing=false`: SPA head에 `noindex,nofollow,noarchive`를 설정하고 이탈 시 복원한다.
- `socialTitle/socialDescription`: 브라우저 title, description, Open Graph, Twitter와 JSON-LD에 반영한다.

## 벤치마크 반영

- WEBTOON CANVAS: PC·모바일 미리보기, 연령 등급, 예약 게시 전 최종 검토
- GlobalComix: 세로/전통식 레이아웃, 예약 공개, 독자 알림 및 분석
- Clip Studio Share: 좌→우/우→좌/세로 읽기와 배포 전 레이아웃 확인
- Tapas: 데스크톱·모바일 미리보기, 예약 게시, 댓글 운영

## 안전성과 호환성

- publication 계약이 없는 레거시 작품은 세로 스크롤·댓글 허용·리믹스 허용으로 유지한다.
- 공개 API가 제거한 예약 시각과 시간대는 독자 UI에서 다시 추론하지 않는다.
- 성인 확인은 콘텐츠 경고 UX이며 법적 연령 검증을 가장하지 않는다.
- 저장·예약·권한 판단은 기존 서버 계약이 계속 권위(authoritative)를 가진다.
- canonical slug 전용 공개 라우트가 아직 없으므로 canonical URL은 안정적인 작품 ID 경로를 쓴다.

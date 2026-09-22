# 고정 검수본 외부 공유 UI 완결

## 목적

기존 `studio-pinned-review-share-v1` 서버 권위를 실제 사용자 흐름에 연결한다. 현재 편집 원고를 복사하거나 별도 승인 체계를 만들지 않고, 서버가 고정한 이미지 해시·페이지 범위·검수 revision만 공유한다.

## 소유자 흐름

- 검수 패널에서 공유 가능한 고정 페이지를 조회하고 필요한 페이지만 선택한다.
- 외부 검토와 멘토링은 열람 또는 댓글 권한을 선택할 수 있다.
- 비공개 토큰은 링크 생성 응답에서 한 번만 표시하며 브라우저 저장소에 보관하지 않는다. URL fragment로 전달해 HTTP 요청·referrer에 포함하지 않는다.
- 결과가 불확실한 재시도는 동일 `id`·`operationId`를 재사용하여 중복 링크를 만들지 않는다.
- 만료 전 링크는 소유자가 철회할 수 있고, 철회 이후 이전 토큰은 다시 표시하지 않는다.

## 공개 전시 흐름

- 승인된 검수본, 읽기 전용 역할, 권리 확인문, 명시적 공개 동의가 모두 있어야 생성할 수 있다.
- 일반 작품 공개와 승인본 전시는 별도 목록이다.
- `/showcase/reviews`에는 서버가 공개 가능하다고 판정한 고정본만 나타난다.
- 공개 상세는 opaque public ID만 사용하며 비공개 토큰과 동시에 제공된 모호한 URL은 거절한다.

## 외부 검토자 경계

- `/production/pinned-review?token=…`은 선택된 고정 이미지와 해당 페이지 댓글만 제공한다.
- 프로젝트 ID, 팀원, 저장 위치, 현재 원고, 내부 승인 메모는 응답·UI에 노출하지 않는다.
- 페이지 bytes는 허용된 이미지 MIME과 32 MiB 상한을 다시 확인한다.
- 탭 비표시·포커스 복귀·lease 만료 시 권위를 다시 조회하고 이전 이미지 object URL을 폐기한다.
- 댓글은 `commenter` 역할에서만 정확한 page ordinal에 기록한다. 공개 전시는 항상 읽기 전용이다.

## 검증

```bash
pnpm exec vitest run \
  apps/web/src/domains/creator/review-share/StudioPinnedReviewShareManager.test.tsx \
  apps/web/src/domains/creator/review-share/StudioPinnedReviewSharePage.test.tsx \
  apps/web/src/domains/creator/review-share/StudioPinnedReviewShowcasePage.test.tsx
```

추가로 pinned-share 서버·모델 계약, 공개 경로·라우트 회귀, 전체 타입 검사, 아키텍처 경계, 프로덕션 빌드를 통과해야 한다.

## 의도적으로 포함하지 않은 것

이 기능은 원고를 수정하거나 승인·게시를 새로 생성하지 않는다. 실시간 통화 녹음, 이메일·푸시 발송, 외부 플랫폼 업로드, DRM, 법적 권리 인증, 운영 DB migration 적용은 별도 승인된 기능·릴리스 범위다.

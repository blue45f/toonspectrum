# 무료 배경·소품 소재 도감

## 기능 범위

`/research/materials`는 기존 미술관 콘텐츠 팩/창작 재료실과 중복되지 않는 배경·재질·소품 연구 페이지다. `/insights/resources` 진입 카드와 리서치 메뉴에서 연결한다. 기본 스튜디오·기존 자료 보드·API 계약은 변경하지 않는다.

- Poly Haven 96개(재질/3D 모델/HDRI 각 32개), ambientCG 45개, 총 141개 선별 스냅샷. 갱신 결과가 바뀌면 실제 수량과 확인 날짜를 UI가 읽는다.
- 한글 별칭 검색, 제공처/종류/8개 장면 가이드 필터, 24개 페이지 단위 표시.
- 장면별 최대 12개 선택, 메모 4,000자, 출처/제작자/CC0 안내/확인 시점을 포함한 Markdown 명세서.
- 선택 ID/가이드만 URL로 공유한다. 메모는 URL·서버에 전송하지 않는다. 메모는 새로고침/페이지 이탈 때 사라진다는 안내를 표시하고 JSON 백업/복원을 제공한다.
- 잘못된 JSON 또는 40KB 초과 파일은 현재 보드를 변경하지 않는다. 현재 카탈로그에 없는 ID는 건수를 알려 제외하며, 가져온 임의 URL은 사용하지 않는다.
- 기본 이미지 요청은 없다. 사용자가 켜면 공급자의 소형 이미지만 지연 로딩한다. 대형 모델/HDRI 원본은 공급자 페이지에서 사용자가 선택한다.
- 가이드는 ToonStudio의 고정 연습 문장이다. AI 생성·영상 제작·자동 이미지 분석으로 표시하지 않는다.

## 비용·권리 검토 (2026-09-14 KST)

Poly Haven은 2026-07-18 공개한 API 안내와 현재 ToS에서 개인/상업 이용 무료, 키·로그인 불필요를 명시한다. 예전 유료 상업 API 계약 대기 표기를 수정했다. API 호출에는 고유 User-Agent를 넣고 UI·명세서에서 제공처를 표시하며 공식 제휴로 오인시키지 않는다. 프리미엄 지원/보장 플랜은 신청하지 않는다.

- https://polyhaven.com/our-api
- https://github.com/Poly-Haven/Public-API/blob/master/ToS.md
- https://polyhaven.com/license

ambientCG 공식 API v2를 사용한다. 자산과 미리보기 렌더의 CC0 정책을 확인했으며 등록/서비스키 없이 실제 JSON 응답을 확인했다. CORS 또는 방문자 트래픽에 의존하지 않고 메타데이터를 정적으로 배포한다.

- https://docs.ambientcg.com/api/
- https://docs.ambientcg.com/license/

공개 제공처의 자산 정책이 CC0 판단 근거다. 이것이 상표·초상 등 모든 제3자 권리를 일괄 면제한다는 의미는 아니며 사용 시 원문을 다시 확인하도록 안내한다. API 이용 조건과 자산 라이선스는 구분한다.

신규 가입·API 신청·카드 등록·유료 AI·DB 마이그레이션·추가 의존성·cron·워크플로·CSP 완화는 없다. 기존 도메인·호스팅/전송량의 무료 한도까지 무제한을 보장하지 않는다. 공급자 약관이 바뀌면 갱신을 중단하고 재검토한다.

## 갱신 방법

```sh
# 네트워크 없이 커밋된 스냅샷 검증
pnpm exec tsx scripts/update-material-catalog.mts --check
# 약관 재검토 후 운영자가 수동 실행: 고정된 공식 API 11회, 순차 호출
pnpm exec tsx scripts/update-material-catalog.mts --refresh
```

일반 빌드/방문자 검색에는 API 갱신이 연결되지 않는다. 응답은 건당 6MB/15초, 목록은 192개로 제한한다. 고정 엔드포인트 이외 요청과 리다이렉트, 임의 페이지네이션, 자동 재시도, 유료 폴백을 허용하지 않는다. 응답 계약·모든 제공처/종류를 검증한 뒤 원자적으로 교체하므로 공급자 오류 때 기존 파일이 보존된다.

## 검증

```sh
pnpm exec vitest run apps/web/src/domains/creator-resources/material-atlas/model.test.ts apps/web/src/domains/creator-resources/MaterialAtlasPage.test.tsx scripts/material-catalog-source.test.ts
node scripts/check-creator-resources.mjs
pnpm run typecheck
pnpm run build
pnpm exec tsx scripts/check-material-atlas-browser.mts
```

브라우저 검사는 실제 프로덕션 번들에 `vercel.json`의 전역 보안 헤더를 적용한다. 별도 API는 명시적인 503 fixture로 대체하여 새 페이지의 서버 독립성을 확인하며 운영 DB나 계정을 쓰지 않는다. 실제 공급자 API 검증은 수동 스냅샷 갱신으로 별도 수행한다. UI 검사 성공과 운영 배포 성공은 다른 상태다.


### 구현 검증 기록

2026-09-14 KST: 신규 Vitest 80/80, 기존 creator-resource 85/85, 변경 파일 ESLint, 아키텍처 검사, 프론트/API 전체 타입 검사, 운영용 build를 통과했다. 실제 API 11회로 생성한 141개 스냅샷의 오프라인 계약 검사도 통과했다.

실제 production dist와 운영 보안 헤더를 사용한 Chromium 검사는 1440/390/320px 모두 통과했다. 출처 페이지 진입, 한글 검색, 선택 유지, 클립보드 거부 시 수동 복사, 실제 JSON/Markdown 다운로드, 새로고침, 보드 복원, 잘못된 JSON의 원상태 보존, 필터/빈 결과를 확인했다. 가로 넘침 0px, pageerror 0건, 미리보기 선택 전 제공처 요청 0건, 메모 POST 0건이다. 데스크톱에서는 실제 Poly Haven CDN 미리보기의 naturalWidth도 검증했다. API 503은 테스트가 명시한 fixture이며 운영 API 검증 성공으로 표시하지 않는다.

전역 `check:studio-bundle` ratchet는 기존 main에서도 실패했다. 기준 커밋 `0673cd3529f9240423a0b24314bced296191c7c7`의 네 진입 파일을 읽기 전용 Vite load 플러그인으로 복원해 별도 출력에 비교 빌드했다. main 비교 1920.7KiB, 이번 변경 1920.8KiB, 허용 1920.3KiB다. 새 141개 카탈로그는 MaterialAtlasPage의 dynamic chunk에 있으며 초기 스튜디오 정적 의존성에 포함되지 않는다. 이 전역 실패는 기준 완화나 검증 우회로 숨기지 않았으며 병합 전 확인 사항으로 남긴다. 로컬 기능 검증은 운영 배포 완료를 뜻하지 않는다.

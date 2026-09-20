# 승인 검수본 원본 이미지 ZIP 저장

상태: **current 구현 / 로컬 검증 완료 / 운영 object storage 통합은 미검증**. 고정 검수 Panel에서 승인된 검수본의 원본 이미지 묶음을 명시적으로 저장한다. 이 기능은 원고의 graph approved revision을 만들거나 공개 Release를 게시하지 않는다.

## 사용자 동작과 저장 결과

- 승인 상태에서만 `승인 검수본 ZIP 저장`을 표시한다. 클릭 시 현재 로그인 세션으로 검수 결정·프로젝트 열람 권한·고정 revision/hash를 새로 읽는다.
- 해당 revision의 전체 preview 목록을 순서대로 읽고, 원본 bytes의 길이와 SHA-256을 확인한다. 원고 재렌더링, 이미지 재인코딩·축소 없이 기존 ZIP worker의 store 방식으로 묶는다.
- ZIP에는 `pages/`의 원본 이미지, 페이지 순서·고정 검수 식별자·결정 시각·길이·해시가 있는 `manifest.json`, 로컬 기록의 의미를 설명하는 `README.txt`가 들어간다. 편집 원고·의견·참가자 명단·결정자 ID·서명 URL·자격 증명은 넣지 않는다.
- 파일 준비 후 승인·권한·동일 결정·전체 preview 소유권을 다시 확인하고 브라우저 다운로드를 요청한다. UI는 브라우저에 요청한 사실만 알리며 디스크 저장 완료를 단정하지 않는다.
- 취소, 문서 숨김, 계정/세션 변경, unmount 및 접근 회수 시 pending 결과를 폐기한다. 일반 창 blur 자체는 취소 조건이 아니다.

## 무결성과 접근 경계

페이지가 누락·중복되거나 pagination cursor가 순환하면 실패한다. 이미지 요청은 cookies 없이, referrer 없이, redirect 거부로 수행한다. URL 만료가 임박한 다음 페이지는 정확한 ordinal/hash의 읽기 URL만 갱신하고 이미 받은 페이지를 다시 내려받지 않는다. 기존 archive 파일 수·총량·단일 항목 제한을 그대로 재사용한다.

검수는 열람 가능한 기존 서버 승인 기록이며 ZIP manifest는 서명된 인증서가 아니다. 이미 내려받은 로컬 파일을 이후 권한 회수로 삭제한다고 약속하지 않는다. 파일 생성은 source 저장·검수 상태 변경·게시 API를 호출하지 않는다.

## 실행 근거

| 검증 | 결과 |
| --- | --- |
| export 모델 및 React 제어, 기존 Panel·Workflow 회귀 | 4 suites, 51 tests PASS |
| 독립 export 모델·UI 재검토 | 2 suites, 24 tests PASS |
| 필수 CI target/shard 계약 | 8 tests PASS |
| 전체 Web TypeScript | 저장소의 12 GiB 설정으로 PASS |
| 최종 프로덕션 build | 전체 Web tsc, Vite 8.0.16, 라이선스 고지와 CSP PASS. 실제 manifest에 승인 ZIP의 lazy chunk가 포함됨 |
| 번들 구조 검사 | PASS: Studio 256 chunks, 6,668.2 KiB raw / 2,230.8 KiB gzip, 기존 관찰 경고 13개. 출력된 과거 startup 측정은 이번 runtime 결과가 아님 |
| scoped ESLint | PASS |
| 실제 Chromium, 1280px·390px 저장 | 다운로드 2회, 각 2개 원본 이미지 bytes/해시와 ZIP 추출 결과 일치 |
| 손상·다운로드 중 권한 회수·취소·계정 변경 | 4개 시나리오 모두 다운로드 0 |
| browser console, 원고 쓰기 | page errors 0, source writes 0 |

브라우저는 실제 UI·HTTP parser·WebCrypto·CRC worker·다운로드 경로를 실행한다. 승인·preview HTTP와 PNG는 개발 fixture이며 실제 Core API나 private object storage를 통한 다운로드 성공을 증명하지 않는다. 서버의 signed URL 저장소에 브라우저 읽기 CORS가 설정되어 있어야 한다. 현재 환경에는 실제 private storage가 없어 이 경계를 확인하지 못했으며 운영 CORS·환경변수를 임의로 바꾸지 않았다.

재현: 개발 서버를 이 작업트리에서 시작하고 `STUDIO_QA_BASE_URL=http://127.0.0.1:5253 node scripts/verify-virtual-studio-review-export.mjs`로 실행한다. 결과는 `.qa/virtual-studio-review-export/report.json`, `export-{1280,390}.png`, `approved-review-{1280,390}.zip`에 보관했다. 두 viewport의 렌더 결과를 직접 확인했으며 44px 터치 영역·가로 넘침 검사도 통과했다.

직접 source: [export 준비](../../apps/web/src/domains/creator/review-export/studio-review-export.ts), [저장 UI](../../apps/web/src/domains/creator/review-export/StudioReviewExport.tsx), [browser verifier](../../scripts/verify-virtual-studio-review-export.mjs).

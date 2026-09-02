# ToonSpectrum Studio 7일 자율 포화 고도화 캠페인

- 캠페인 ID: `studio-saturation-2026-09-02`
- 시작: 2026-09-02 20:30 KST (`2026-09-02T11:30:00Z`)
- 종료: 2026-09-09 20:30 KST (`2026-09-09T11:30:00Z`)
- 실행 간격: 3시간
- 추적 Epic: #555
- 구현 큐: #557–#563

## 1. 실제로 자동화되는 범위

`.github/workflows/studio-seven-day-campaign.yml`은 캠페인 기간 동안 다음 순서를 반복한다.

1. 최신 `main`과 열린 PR·P0 이슈 상태를 읽는다.
2. 성숙 제품 59개, 신규·스타트업·브라우저 도구 레지스트리, 그래픽스·페인팅·애니메이션·3D 관련 논문 출처를 검사한다.
3. 외부 페이지 제목과 연구 메타데이터를 명령이 아닌 신뢰하지 않는 데이터로 정규화한다.
4. 이미 열린 캠페인 PR이 있으면 다음 구현을 만들지 않고 CI·자동 병합을 기다린다.
5. 실행 가능한 슬롯이 있고 `OPENAI_API_KEY` 저장소 Secret이 구성돼 있으면, 고정된 OpenAI Codex Action과 CLI 버전으로 한 개의 작은 기능 패치를 생성한다.
6. 에이전트가 수정한 working tree를 별도 정책기로 검사한다.
7. 에이전트 Job에는 push 권한을 주지 않는다. 패치는 artifact로 넘기고, API 키를 받지 않는 별도 Job이 현재 `main` SHA가 그대로일 때만 브랜치·커밋·PR을 만든다.
8. PR은 기존 전체 CI, Studio 위험 게이트, SonarQube, exact-head 자동 병합을 통과해야 `main`에 들어간다.
9. 병합된 캠페인 브랜치는 자동 정리되고 Vercel Git Integration이 배포를 수행한다.

## 2. 연속 실행의 정확한 의미

채팅 세션이나 단일 프로세스를 7일 동안 붙잡아 두는 방식이 아니다. GitHub Actions의 예약 실행과 독립 runner를 사용한다. 각 회차는 앞 회차가 종료되더라도 다음 cron에서 다시 시작한다.

GitHub 예약 작업은 플랫폼 부하, 저장소 Actions 한도, 결제·사용량 제한, 네트워크 장애 때문에 지연되거나 실행되지 않을 수 있다. 따라서 “한 순간도 중단되지 않는 프로세스”를 주장하지 않는다. 대신 다음 회차가 저장소 상태를 다시 읽고 중단 지점 없이 재계획할 수 있는 반복 가능한 캠페인으로 구성한다.

동시에 열 수 있는 캠페인 PR은 기본 1개다. 이는 작업을 늦추기 위한 승인이 아니라 다음 문제를 막기 위한 직렬화 장치다.

- 같은 대형 Studio 파일에 대한 병렬 충돌
- 실패한 기반 위에 후속 기능이 누적되는 현상
- 저장 포맷·Undo/Redo·GPU authority 변경이 서로 다른 기준선을 사용하는 현상
- CI runner와 Vercel 배포가 과도하게 밀리는 현상

## 3. 구현 우선순위

회차마다 #557–#563의 시작 위치를 순환한다. 단, 실제 선택 시에는 해당 이슈가 열려 있고 동일 이슈를 진행 중인 열린 PR이 없어야 한다.

- #557: operation replay·codec·crash recovery
- #558: editable Smart Shape·recent-stroke correction
- #559: non-destructive adjustment/live-effect graph
- #560: deterministic natural-media simulation
- #561: 3D surface painting·attachment·texture export
- #562: cel animation·camera·audio·animatic timeline
- #563: structured layered AI editing·provenance

작업 큐가 막히거나 안전한 기능 slice가 없으면 제품·스타트업·논문 신호를 기반으로 작은 측정 가능한 실험을 선택한다. 연구 프로토타입도 제품 코드로 승격되려면 실제 실행 경로, 저장·복원, Undo/Redo, 오류 경계, 성능과 브라우저 증거가 필요하다.

## 4. 외부 소스와 소재 재사용

저장소 소유자의 캠페인 범위 허락은 `docs/third-party/studio-owner-attestation-2026-09-02.md`에 기록돼 있다. 같은 자료를 사용할 때마다 다시 승인을 요청하지 않는다.

실제로 가져오는 항목은 다음 정보를 `docs/third-party/studio-reuse-registry.json`에 남긴다.

- 원본 URL
- 고정 버전·릴리스·커밋
- 실제 원본 바이트 SHA-256
- 소유자 확인 또는 공개 라이선스 근거
- 반영 경로
- 필요한 NOTICE·출처

자동 에이전트 patch에는 바이너리 외부 파일 추가를 허용하지 않는다. 모델 가중치·대형 3D·브러시 패키지는 출처와 해시를 검토한 별도 통합 PR 또는 runtime-download/BYOM 경로로 처리한다. 접근 가능한 소스가 없으면 기능, 알고리즘, 데이터 모델, 작업 흐름과 품질 기준을 분석해 ToonSpectrum 엔진에 구현한다.

## 5. 에이전트 격리와 패치 제한

자동 구현 Job은 다음 조건을 사용한다.

- `openai/codex-action` commit `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`
- Codex CLI `0.152.1`
- 모델 `gpt-5.3-codex`
- reasoning effort `high`
- permission profile `:workspace`
- 저장소 push 권한 없음
- 최대 24개 파일, 3,200 변경 라인

자동 패치에서 금지되는 항목:

- `.github/workflows`와 Actions 정의 수정
- dependency manifest와 lockfile 수정
- 환경변수·배포 설정·비밀값 수정
- 캠페인 자체 설정과 안전 정책 수정
- 파일 삭제
- 바이너리 payload 추가
- 테스트 없는 제품 소스 변경
- 출처 registry가 없는 외부 payload 경로

에이전트가 안전하고 의미 있는 변경을 만들지 못하면 working tree를 비워 둔다. 이 경우 PR을 만들지 않고 다음 회차에서 다시 연구·선택한다.

## 6. 필수 검증과 병합

패치 생성 Job의 최소 검증:

- 변경된 Node/Vitest 계약
- `git diff --check`
- `pnpm run lint:quick`
- `pnpm run typecheck`
- 패치 admission policy

PR 생성 뒤에는 더 강한 저장소 기준을 적용한다.

- 전체 CI
- Studio 변경 위험 자동 분류
- 캔버스·저장·history·WebGPU·UI 변경별 targeted verifier
- 프로덕션 빌드와 bundle ratchet
- SonarQube
- 브라우저·OPFS·GPU 검증
- exact-head squash merge
- 병합 브랜치 삭제
- Vercel 배포

`main`이 패치 생성 중 바뀌면 오래된 패치를 억지로 재베이스하지 않는다. PR 생성 Job이 해당 회차를 버리고 다음 회차에서 최신 기준선으로 다시 생성한다.

## 7. API 키가 없을 때

GitHub Actions에서 코드를 작성하는 Codex Job은 저장소 Secret `OPENAI_API_KEY`가 필요하다. Secret은 고정된 OpenAI Action 단계에만 전달되며 push·PR Job에는 전달되지 않는다.

Secret이 없는 경우에도 다음은 계속 작동한다.

- 제품·스타트업 공식 출처 감시
- 논문·연구 검색과 fingerprint
- 기존 CI와 회귀 탐지
- 열린 PR의 자동 병합
- 병합 브랜치 정리
- 배포와 smoke 검증

코드 작성만 비활성화되고, Epic #555에 한 번만 상태가 기록된다.

## 8. 캠페인 종료

종료 시각 이후 예약 실행은 새 코드를 작성하지 않는다. 완료 메시지를 Epic #555에 한 번 기록하고 가벼운 audit-only 상태로 남는다. 기간을 연장하려면 설정 파일의 새 7일 window를 별도 PR로 검증하거나 유지관리자가 `force_active` 수동 회차를 실행한다.

완료 평가는 커밋 수가 아니라 다음으로 판단한다.

- 실제 병합·배포된 기능과 버그 수정
- P0/P1 capability gap 감소
- 캔버스·저장·Undo/Redo·GPU 안정성
- 성능·메모리·bundle 비악화
- 연구 프로토타입의 제품 승격 근거
- 미완료 항목의 구체적인 blocker와 다음 실행 단위

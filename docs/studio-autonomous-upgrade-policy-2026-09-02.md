# ToonSpectrum Studio 자율 고도화 운영 정책

- 시행일: 2026-09-02
- 범위: `/studio`와 연결된 캔버스, 브러시, 저장/복원, Undo/Redo, WebGPU/WebGL2/WASM, 3D, 애니메이션, 협업, 소재, AI 보조, 배포
- 사용자 승인 정책: 기능별 또는 위험 영역별 사전 승인을 요구하지 않는다.
- 브라우저 검증: 저장소 내 Playwright와 실제 배포 프리뷰를 사용하며 Testifly는 사용하지 않는다.

## 1. 기본 원칙

Studio 고도화 작업은 캔버스, 저장 포맷, Undo/Redo, WebGPU 렌더러를 포함해 위험 등급과 무관하게 자율적으로 수행한다. 다만 “승인 생략”은 검증 생략이나 `main` 직접 덮어쓰기를 의미하지 않는다.

모든 변경은 다음 불변식을 지킨다.

1. 변경 단위마다 독립 브랜치와 Pull Request를 사용한다.
2. 타입 검사, 관련 단위 테스트, 관련 브라우저 검증, 프로덕션 빌드 중 하나라도 실패하면 병합하지 않는다.
3. 데이터 손실 가능성이 있는 변경은 이전 버전의 프로젝트를 읽을 수 있는 역호환 경로와 실패 시 원본 보존 경로를 갖춘다.
4. 저장 포맷 변경은 버전 필드, 마이그레이션, 손상 입력 거부, round-trip 검증을 동반한다.
5. Undo/Redo 변경은 실행 결과뿐 아니라 redo 재실행, 분기 후 redo 폐기, 연속 입력 병합, 저장/복원 이후 history 경계를 검증한다.
6. WebGPU 변경은 지원 브라우저의 GPU 경로와 WebGL2/Canvas2D 안전 폴백을 함께 유지한다.
7. 프로덕션 오류가 확인되면 새 기능을 유지하기보다 마지막 검증 커밋으로 되돌릴 수 있어야 한다.
8. API 키, 배포 토큰, OAuth 비밀값은 코드·문서·브라우저 번들에 저장하지 않는다.
9. UI가 보이는 것만으로 완료로 판정하지 않는다. 실행, 저장/복원, 오류 경계, 접근성, 테스트 증거가 연결돼야 완료다.
10. Clip Studio Paint의 상표, 독점 파일 포맷, 비공개 API, 유료 소재를 복제하지 않는다. 공개 기능 개념을 독자 구현한다.

## 2. 자율 의사결정 범위

별도 사용자 확인 없이 다음 작업을 수행할 수 있다.

- 캔버스/렌더러 구조 변경과 성능 최적화
- WebGPU, WebGL2, WASM, Worker, OPFS 관련 구현 교체
- 저장 스키마 버전 상승과 마이그레이션 추가
- Undo/Redo command 또는 transaction 모델 교체
- 브러시 엔진, 혼색, 텍스처, 안정화, 입력 예측 고도화
- 레이어, 마스크, 선택, 벡터, 필터, 색 관리 기능 추가
- 3D 배경·캐릭터·포즈·카메라·조명·텍스처 편집 기능 추가
- 애니메이션 타임라인과 출력 기능 추가
- UI/UX 재배치, 인스펙터 및 도킹 시스템 변경
- 테스트, CI, 프리뷰, 배포 자동화 변경
- 성능이나 안정성을 위해 내부 API와 폴더 구조를 리팩터링

다음 작업도 승인 대상은 아니지만 반드시 격리된 변경으로 수행한다.

- 프로젝트 파일을 다시 쓰는 마이그레이션
- committed scene의 렌더링 authority 전환
- 기존 브러시 출력이 달라지는 알고리즘 변경
- GPU readback, texture pool, tile cache 수명주기 변경
- collaboration mutation 또는 CRDT 모델 변경
- 데이터베이스 destructive migration

## 3. 브랜치와 병합 정책

권장 브랜치 접두사는 다음과 같다.

- `feat/studio-*`: 사용자 기능
- `fix/studio-*`: 회귀와 버그
- `perf/studio-*`: 성능
- `refactor/studio-*`: 동작 보존 구조 개선
- `test/studio-*`: 검증 강화
- `codex/studio-*`: 자율 고도화 오케스트레이션

`main`에는 직접 쓰지 않는다. Pull Request가 기존 CI와 `studio-autonomous-risk-gate`를 통과하고, 충돌이나 unresolved review thread가 없을 때만 병합한다. 사용자의 수동 승인 여부는 병합 조건에 포함하지 않는다.

동시에 열린 PR과 겹치는 파일을 변경해야 하면 다음 순서를 따른다.

1. 최신 `main`을 기준으로 별도 브랜치를 만든다.
2. 겹치는 PR이 사용자 기능을 변경한다면 해당 PR을 먼저 분석해 중복 구현을 피한다.
3. 서로 독립적인 변경으로 분해할 수 없으면 먼저 열린 PR의 병합 결과를 기준으로 다시 베이스를 맞춘다.
4. 강제 push로 다른 작업자의 브랜치를 덮어쓰지 않는다.

## 4. 고위험 영역별 필수 계약

### 4.1 캔버스와 브러시

- pointer capture 종료와 취소 처리
- pressure/tilt/twist/coalesced event 입력 보존
- live draft와 committed output의 허용 오차 내 일치
- 확대/회전/미러/고해상도에서 좌표 변환 일치
- 활성 stroke 중 도구 전환과 문서 종료의 안전한 정리
- 큰 브러시, 긴 스트로크, 다중 레이어에서 메모리 상한 확인

### 4.2 저장 포맷과 자동 복원

- 원본을 먼저 보존하고 새 manifest를 원자적으로 commit
- checksum/length/version 검증 실패 시 부분 문서를 정상 문서로 노출하지 않음
- 이전 포맷 fixture 읽기
- 새 포맷 save→close→reload round-trip
- 두 탭 leader 충돌과 중단된 쓰기 복구
- quota 부족, worker 종료, 브라우저 강제 종료에 대한 실패 경계

### 4.3 Undo/Redo

- 단일 command의 apply/revert/redo 대칭성
- 새 작업 수행 시 redo branch 폐기
- continuous gesture의 transaction 병합
- raster, vector, 3D, text, layer tree 각각의 history 연결
- undo 중 실패해도 문서가 중간 상태로 남지 않는 원자성
- 저장 복원 후 history 지원 범위를 UI에 정확히 표시

### 4.4 WebGPU 렌더러

- adapter/device 획득 실패와 `device.lost` 처리
- texture/buffer 명시적 해제와 pool 회수
- zero-size surface, resize, DPR 변경, context reconfigure 처리
- WGSL validation 오류와 pipeline 생성 실패의 진단
- GPU 경로와 폴백 경로의 캡처·필터·브러시 패리티
- 인앱 브라우저와 GPU 미지원 장치에서 WebGL2/Canvas2D로 fail-safe
- readback을 hot path에서 사용하지 않는지 검증

## 5. 자동 검증 등급

변경 파일은 자동으로 위험 범주를 분류한다.

- `canvas`: 캔버스, 브러시, raster/vector, 선택, 변형
- `storage`: OPFS, SQLite, autosave, codec, import/export, PSD
- `history`: command, mutation, transaction, undo/redo
- `webgpu`: WebGPU, WGSL, GPU texture/buffer, WASM 렌더 경로
- `ui`: inspector, palette, menu, dialog, toolbar, responsive chrome
- `collaboration`: CRDT, Socket.IO, presence, cursor, lock
- `deployment`: workflow, Vercel, CSP, service worker, build configuration

고위험 범주가 감지되면 관련 targeted gate를 추가 실행한다. 기존 전체 CI는 최종 release oracle로 유지한다.

## 6. 배포 정책

프로덕션 기본 경로는 Vercel Git Integration이다. GitHub Actions의 Vercel CLI workflow는 수동 비상용 경로로 유지한다.

배포 가능한 커밋은 다음 조건을 모두 만족해야 한다.

- Pull Request의 필수 CI 성공
- 프로덕션 빌드 성공
- Studio bundle budget 성공
- CSP 검증 성공
- 핵심 `/studio` Playwright 시나리오 성공
- 저장/복원 또는 GPU 변경 시 해당 전용 gate 성공

배포 후 smoke 검증에서 페이지 오류, 저장 손상, 빈 캔버스, GPU device-lost 반복, 핵심 도구 무응답이 확인되면 기능 유지보다 rollback을 우선한다.

## 7. 기능 패리티 판정

Clip Studio Paint 기능은 이름만 같은 placeholder가 아니라 아래 증거가 모두 있을 때 `완료`로 표시한다.

1. 실제 Studio UI에서 접근 가능
2. 문서 모델에 반영
3. 저장 후 복원 가능
4. Undo/Redo 가능하거나 지원하지 않는 이유가 명시됨
5. 오류와 미지원 환경의 안내 존재
6. 키보드와 포인터 입력 가능
7. 자동 테스트 또는 재현 가능한 브라우저 증거 존재
8. 내보내기 결과 또는 후속 작업에서 기능의 효과가 유지됨

기능이 외부 모델, OAuth, 라이선스, 운영 비용을 요구하면 실행 가능한 adapter와 비활성 상태 안내까지 구현하되, 자격 증명이나 상업적 권리를 허위로 가정하지 않는다.

## 8. 종료 조건

“더 고도화할 것이 없음”은 절대적인 선언이 아니라 현재 기준의 종료 조건으로 판정한다.

- 공식 Clip Studio Paint 최신 기능 기준표에 미구현 P0/P1 항목이 없음
- 미구현 P2 항목은 브라우저 기술·외부 라이선스·운영 비용 등 명확한 blocker가 기록됨
- 주요 사용자 여정의 오류·접근성·성능 회귀가 없음
- 캔버스, 저장, history, GPU 장시간 soak 결과가 설정된 한도를 충족
- 배포 프리뷰와 프로덕션 smoke 검증이 모두 통과
- capability audit와 실제 코드·테스트 증거가 일치

이 조건을 충족한 뒤에도 브라우저, GPU 드라이버, Clip Studio Paint 최신 버전, 사용자 요구가 변하면 기준표를 다시 갱신한다.

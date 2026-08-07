# ToonStudio V11 — natural-media 라이선스·배포 (license & deployment)

- 기준일: 2026-08-07
- 대상: libmypaint (E11), Hokusai/`studio-hokusai-wasm` (E12), ToonWet (E28)
- 상위 정책: V11 §3.1 (라이선스·안전성 하드 게이트), §11 (라이선스와 배포)
- 주의: 이 문서는 엔지니어링 관점 정리다. 최종 배포 방식은 V11 §11에 따라 법무 검토를 거쳐 확정한다.

## 1. 후보별 라이선스 의무와 배포 방식

| Candidate | License | 주요 의무 | 배포 방식 | Copyleft 격리 |
| --- | --- | --- | --- | --- |
| libmypaint (E11) | ISC (배치 매트릭스 E11) | permissive — 저작권·라이선스 고지 유지. 소스 공개 의무 없음 | **직접 WASM 번들** 가능. 실행은 **Worker 격리** 권장(라이선스 사유가 아니라 C 코드 메모리 경계·크래시 격리 사유) | 불필요 |
| Hokusai — `studio-hokusai-wasm` (E12) | MIT OR Apache-2.0 (택일) + 전이 의존 `unicode-ident` 데이터 테이블의 Unicode-3.0 고지 | 라이선스 전문·고지 동봉. Apache-2.0 선택 시 NOTICE 관행 준수. **세 고지 모두 이미 `pkg/`에 동봉됨** (`LICENSE-MIT`, `LICENSE-APACHE`, `LICENSE-UNICODE`) | **직접 WASM 번들** (현행 방식). `pkg/` 커밋 + `INTEGRITY.sha256` 봉인 + `verify:studio-hokusai-wasm`(경량 검증) / `verify:studio-hokusai-wasm:rebuild`(핀 고정 툴체인 재현 빌드)로 공급망 무결성 보장. 실행은 Worker 격리(수명·메모리 회수 목적) | 불필요 |
| ToonWet — wgpu/WebGPU + ToonGpuExtensions (E28) | internal + wgpu permissive (배치 매트릭스 E28) | 자체 코드는 내부 라이선스. wgpu 계열 의존은 permissive 고지 유지 | **직접 통합** (frame graph 내 자체 WGSL pass). 별도 프로세스·서버 불필요 | 불필요 |

### 배포 채널 4종에 대한 판정

V11 §11이 정의하는 채널(직접 WASM 번들 / Worker 격리 / Local ToonBridge / 서버) 기준:

- **직접 WASM 번들**: natural-media 3후보 전부 가능. permissive 계층은 browser/worker 직접 통합 우선(V11 §11 첫 항목)이며 이 서브시스템은 전원 permissive다.
- **Worker 격리**: 라이선스 요구가 아니라 **엔지니어링 선택**으로 채택한다 — lazy load, Worker 종료를 통한 메모리 회수(V11 §9.1), C→WASM(libmypaint) 크래시 격리.
- **Local ToonBridge / 서버**: 이 서브시스템에서는 **불필요**. 해당 채널은 G'MIC(CeCILL 계열)·GEGL(LGPL/GPL) 같은 copyleft 인접 계층용으로 유보한다(V11 §11). 자연매체 스트로크는 지연 요구(p50 4ms)상 브리지·서버 경유가 원천적으로 부적합하기도 하다.
- **사용자 파일 서버 전송 없음**: 3후보 모두 로컬 실행이므로 V11 §3.1의 "사용자 파일의 서버 전송 여부" 게이트를 자동 통과한다.

## 2. 후보별 상세

### 2.1 libmypaint (E11)

- ISC는 BSD 계열과 동급의 짧은 permissive 라이선스다. WASM으로 정적 컴파일해 상용 웹 번들에 포함해도 소스 공개 의무가 발생하지 않는다. 고지문은 third-party notices 산출물(현행 리포의 `scripts/generate-third-party-notices.mjs` 파이프라인)에 포함한다.
- **자산 주의 — `.myb` 브러시 프리셋은 코드와 별개 라이선스다.** 업스트림 mypaint-brushes 기본 세트와 서드파티 프리셋 팩은 각각의 배포 조건을 개별 확인해야 하며, 프리셋마다 license를 Rights BOM에 기록한다(V11 §6.4 — preset에 license 저장, §11 — 모든 asset은 Rights BOM). 마켓플레이스 유통 프리셋은 서명 패키지에 provider/version/license를 고정한다(V11 §5 소재 마켓 행).
- 포팅 산출물은 Hokusai 패키지와 동일한 재현 빌드·INTEGRITY 봉인 규율을 적용하는 것을 권장한다(고정 커밋, 클린 2회 빌드 바이트 일치).

### 2.2 Hokusai — `studio-hokusai-wasm` (E12)

- 듀얼 라이선스(MIT OR Apache-2.0)는 택일 가능하며, 패키지와 핀 고정된 Hokusai 크레이트(`hokusai-core`/`hokusai-brush`/`hokusai-tile-mem` =0.3.0) 모두 동일 조건이다(패키지 README).
- 전이 의존 `unicode-ident`의 Unicode-3.0 고지가 추가로 필요하고, 이미 `pkg/LICENSE-UNICODE`로 동봉되어 있다. **이 서브시스템의 라이선스 고지 의무는 현행 자산에서 이미 이행 완료 상태**이며, 번들 파이프라인이 `pkg/`의 고지 파일을 최종 배포물까지 전달하는지만 확인하면 된다.
- 공급망·무결성: 릴리스 아티팩트는 Rust/Cargo 1.97.1 + wasm-pack 0.15.0으로 byte-for-byte 재현되어야 하고, 빌드는 체크인된 Cargo v4 lockfile과 리뷰된 crate 체크섬으로 오프라인 실행된다. verify 스크립트는 생성 WASM에 로컬 홈·리포·임시 빌드 경로가 새는 것도 거부한다(패키지 README). 이는 V11 §3.1 하드 게이트의 "메모리 안전성과 sandbox 가능성"(Rust, `unsafe_code = "forbid"`)과 함께 상용 배포 안전성 근거가 된다.
- 브러시 JSON은 신뢰된 brush pack에서만 로드한다(README 권고). 마켓 유입 프리셋은 서명 패키지 경로로만 받는다.

### 2.3 ToonWet (E28)

- 자체 구현 코드이므로 외부 라이선스 의무가 없다. wgpu/WebGPU 스택의 permissive 고지만 유지한다.
- 협업·bake 산출물: wet 시뮬레이션 결과 bake는 사용자 저작물이므로 엔진 라이선스와 무관하다. 다만 command+seed+bake 동기화 규약(E24)에 따라 bake에 provider/version을 기록해 다른 클라이언트가 결과를 재현·검증할 수 있게 한다.

## 3. Copyleft 격리 요구 (경계 명시)

natural-media 서브시스템 내부에는 copyleft 구성요소가 없다. 격리 의무는 **인접 계층과의 경계**에서 발생한다:

- **libvips (LGPL-2.1-or-later, E17)**: 자연매체 레이어의 대형 export가 libvips 파이프라인을 지날 수 있다. LGPL 의무(교체 가능성 보장 등)는 export 계층의 배포 방식 결정에 따르며, natural-media 엔진 번들과 정적으로 결합하지 않는다. V11 §11 — "정적 링크를 무조건 금지하는 대신 실제 라이선스 의무에 맞는 배포 방식을 법무 검토해 결정한다."
- **G'MIC (CeCILL 계열, E18) / GEGL (LGPL/GPL, E19)**: 자연매체 결과에 창작 필터를 적용하는 경우 Local ToonBridge·격리 Provider·서버 실행이 기본 후보다(V11 §11). natural-media Worker와 같은 번들·같은 링크 단위에 두지 않는다.
- **Krita GPL 코어**: 브러시 동작 참고(format/behavior reference)로만 사용하고 상용 웹 번들에 혼합하지 않는다(V11 §11). parity lab에서 Krita 결과 이미지를 비교 참조로 쓰는 것은 코드 결합이 아니므로 무방하다.

## 4. 게이트 체크리스트 (배포 전)

- [ ] libmypaint WASM 포팅 산출물에 ISC 고지 포함, third-party notices 파이프라인 등록
- [ ] `studio-hokusai-wasm` `pkg/` 고지 3종이 최종 번들 산출물까지 전달되는지 확인
- [ ] `verify:studio-hokusai-wasm` 및 `verify:studio-hokusai-wasm:rebuild` CI 게이트 유지
- [ ] 배포 번들 license scan (매트릭스 공통 검증 게이트 항목) 통과
- [ ] 기본 제공 `.myb` 프리셋 전수의 Rights BOM 작성 및 개별 라이선스 확인
- [ ] ToonWet 의존(wgpu 계열) 고지 포함
- [ ] copyleft 인접 계층(libvips/G'MIC/GEGL)과의 링크·번들 경계 법무 검토 완료 (V11 §11)

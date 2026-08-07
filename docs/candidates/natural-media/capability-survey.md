# ToonStudio V11 — natural-media 엔진 후보 능력 조사 (capability survey)

- 기준일: 2026-08-07
- 담당 서브시스템: **natural-media** (자연매체 브러시: 연필·색연필·수채·수묵·유화·혼색·스머지)
- 관련 배치 매트릭스 행: **E11 (libmypaint)**, **E12 (Hokusai)**, **E28 (wgpu/WebGPU + ToonGpuExtensions → ToonWet)**
- 상위 권위 문서:
  - `docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md`
  - `docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv`
- 원칙: **Verified-first, Hybrid-by-strength, Evidence-driven Custom**. 자체 구현(ToonWet)은 금지 대상이 아니라 벤치마크를 통과해야 하는 비교 후보다.

## 1. 조사 범위와 포커스

이 문서의 포커스는 **libmypaint vs Hokusai parity lab**이다. 두 엔진을 동일 입력·동일 preset corpus로 비교해 자연매체 주력 Provider를 선택하고, 검증 엔진에 없는 습식 현상(backrun·granulation·건조 타임라인 등)만 **ToonWet**이 증거 기반으로 확장한다(V11 §5 수채·수묵 행, §6.2).

### 현행 자산: `packages/studio-hokusai-wasm`

이 리포에는 이미 Hokusai 후보의 실측 가능한 자산이 존재한다. parity lab은 이 패키지를 Hokusai 측 기준 구현으로 사용한다.

- Rust/WASM 래퍼 크레이트. `hokusai-core` / `hokusai-brush` / `hokusai-tile-mem`을 **정확히 0.3.0으로 고정**(`Cargo.toml`의 `=0.3.0`).
- 업스트림 `hokusai-wasm` 래퍼는 **의도적으로 사용하지 않는다** — 업스트림은 타일을 흰색 위에 합성하지만, 이 래퍼는 `MemSurface`의 premultiplied-alpha linear-sRGB fix15 타일을 읽어 **straight-alpha sRGB RGBA8**(미터치 픽셀 `[0,0,0,0]`)을 반환한다(패키지 README).
- 픽셀 계약: `fullFrame()` / `dirtyBounds()`(64px 타일 단위 보수적 사각형) / `dirtyFrame()` / `clearDirty()` / `reset()` / `dispose()`.
- 결정성 계약: 동일 초기 캔버스·브러시·seed·정렬된 샘플 스트림이면 **바이트 단위 결정적**(README 명시). `beginStroke`가 브러시를 스냅샷하고 `BrushState::new(seed)`를 초기화한다.
- 재현 빌드: `pkg/` 커밋 + `pkg/INTEGRITY.sha256` 봉인 + `verify:studio-hokusai-wasm`(Rust 불필요 경량 검증) + `verify:studio-hokusai-wasm:rebuild`(핀 고정 툴체인 2회 독립 클린 빌드로 바이트 일치 요구). 릴리스 아티팩트는 Rust/Cargo 1.97.1 + wasm-pack 0.15.0으로 재현되어야 한다.
- 라이선스 고지 3종(`LICENSE-MIT`, `LICENSE-APACHE`, `LICENSE-UNICODE`)이 `pkg/`에 동봉된다.
- 알려진 제약: wasm-pack 0.15.0 동봉 Binaryen이 Rust 1.97의 bulk-memory/nontrapping 명령을 거부해 `wasm-opt` 후처리를 끈 상태다(`Cargo.toml` 주석). 크기·속도 후처리 여지는 벤치마크 항목으로 남는다.

## 2. 능력 조사 표

성능 수치는 아직 **미실측**이다. 수치를 지어내지 않고, 전부 `tests/benchmarks` 하니스(V11 §12 그린필드 트리의 `/tests/benchmarks`, 현행 리포의 `scripts/studio-brush-*-benchmark.ts` 계보)로 측정한다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| libmypaint (E11) | MyPaint·GIMP 등 다수 페인팅 프로그램이 실사용으로 검증한 brush dynamics·tiled surface·smudge와 방대한 `.myb` 프리셋 생태계. 자연매체 손맛의 사실상 레퍼런스. | 습식 유체 현상(backrun·granulation·건조 타임라인) 없음. 재질 높이(height/normal) 없음. 공식 웹/WASM 배포 없음(자체 C→WASM 포팅 필요). 다중 레이어 비파괴 smudge 참조는 문서 계층 확장 필요. | 자연매체 기준선(레퍼런스 품질). Golden Master corpus로 실측 확정 — 미실측 구간은 단정하지 않음. | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | C→WASM 포팅 빌드 필요. Worker 격리 권장(C 메모리 경계). 번들 크기 미실측 — tests/benchmarks 하니스로 측정 | dab 배치에 RNG 사용. seed 고정 시 재현 가능 여부·버전 간 안정성을 parity lab에서 계약으로 검증해야 함(현재 미검증) | ISC (배치 매트릭스 E11) | tile → CanvasKit/Skia tile surface 업로드 경로 필요. fix15/부동소수 내부 표현 ↔ RGBA8 변환 비용 미실측 | C 기반 WASM 포팅·메모리 경계 관리 필요. 업스트림 업데이트 정체(매트릭스 E11 위험 항목) | **자연매체 기준선** (V11 §4 판정). parity lab의 품질 레퍼런스 |
| Hokusai 0.3.0 — `packages/studio-hokusai-wasm` (E12) | 순수 Rust 브러시 엔진(libmypaint 영감·`.myb` 호환 지향). 리포에 **이미 커밋된 재현 빌드 자산**: 투명 배경 straight-alpha 픽셀 계약, dirty-rect 증분 API, 바이트 결정성, INTEGRITY 봉인, `unsafe_code = "forbid"`. WASM/native 동시 목표. | libmypaint 대비 기능·픽셀 동등성 미입증(parity lab의 검증 대상). 습식 유체 현상 없음. 재질 높이 없음. 신규 프로젝트라 프리셋 커버리지·엣지 동작이 레퍼런스와 다를 수 있음 | libmypaint와 동일 입력·동일 preset corpus로 픽셀 diff 실측 후 판정 — 미실측 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 직접 WASM 번들 가능(`pkg/` 커밋 완료, wasm-bindgen 0.2.123). wasm-opt 후처리 비활성 상태라 크기 최적화 여지 있음. 실제 크기·로드 시간 미실측 — tests/benchmarks 하니스로 측정 | **바이트 단위 결정적** (동일 캔버스·브러시·seed·샘플 스트림 — 패키지 README 계약, 재현 빌드로 봉인) | MIT OR Apache-2.0 (+ 전이 의존 unicode-ident의 Unicode-3.0 고지, 3종 모두 `pkg/` 동봉) | RGBA8 straight-alpha 출력이라 CanvasKit/GPU 텍스처 업로드 직결. dirtyBounds 64px 타일 단위 보수적(불필요 재업로드 가능) — 비용 미실측 | 신규 프로젝트(매트릭스 E12 위험 항목): 장기 유지보수·업스트림 활성도 검증 필요. 단, 버전 핀·재현 빌드·verify 스크립트로 공급망 위험은 이미 완화됨 | **품질 게이트 후보** (V11 §4 판정). parity 통과 시 Rust/WASM 주력 자연매체 Provider 승격 후보 |
| ToonWet — wgpu/WebGPU + ToonGpuExtensions (E28) | 검증 엔진에 없는 제품 고유 습식 현상만 채우는 얇은 GPU 확장: wet-tile simulation(backrun·granulation·건조 타임라인), height/normal 재질 확장, sparse tile residency, frame graph 내 texture interop. 기존 엔진 결과와 같은 frame graph에서 합성 가능 | 범용 자연매체 dynamics는 스스로 구현하지 않음(정책상 libmypaint/Hokusai 재사용 — V11 §5). 아직 설계·프로토타입 이전 단계로 코드 자산 없음. WebGPU 미지원 장치에서는 동작 불가(폴백 필수) | 목표: 습식 현상에서 CSP 대비 차별화. 시각 자료·벤치마크로 우위 입증 전에는 채택하지 않음(V11 §3.3) — 미실측 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 자체 WGSL pass 모듈(작음 예상이나 미실측). WebGPU 필요. Worker + OffscreenCanvas 상주 여부는 island 설계에 따름 — 미실측 | 시뮬레이션은 command+seed+bake만 동기화하는 협업 규약(E24)에 맞춰 **seed 고정 결정성 설계가 요구사항**. 부동소수 GPU 연산의 장치 간 결정성 한계는 bake로 봉인 | internal + wgpu permissive (배치 매트릭스 E28) | libmypaint/Hokusai tile → GPU 텍스처 → wet pass → composite. GPU→CPU readback 금지 규칙(V11 §9.1) 하에서 설계해야 함 | 자체 코드 유지보수 부담. V11 §3.3 조건(기존 Provider가 목표 시각 품질 미재현 등) 입증 실패 시 채택하지 않는 것이 정책 | **필수 얇은 확장** (V11 §4 판정). 증거 기반으로만 확장, 우위 입증 시 주력 승격 가능(§6.3) |

## 3. 후보별 정성 근거

### 3.1 libmypaint (E11)

- 근거: V11 §4·매트릭스 E11 — "MyPaint와 여러 페인팅 프로그램이 사용한 brush dynamics, tiled surface, smudge, .myb 생태계", 판정 "자연매체 기준선", 라이선스 ISC.
- 위험 근거: 매트릭스 E11 위험 항목 — "C 기반 WASM 포팅·메모리 경계·업데이트 정체를 관리해야 한다."
- 역할: V11 §5에서 연필·색연필·수채·수묵·유화·스머지의 dynamics 계산 담당. 합성은 CanvasKit/Skia tile surface, 오버레이는 Vello.

### 3.2 Hokusai (E12) — 현행 자산 있음

- 근거: 매트릭스 E12 — "libmypaint에서 영감을 받은 순수 Rust 브러시 엔진으로 WASM/native를 목표로 하고 .myb 호환을 지향", 판정 "품질 게이트 후보".
- 이 리포의 `packages/studio-hokusai-wasm`이 위 §1의 픽셀·결정성·재현빌드 계약을 이미 구현했으므로, parity lab은 "포팅 가능한가"가 아니라 **"libmypaint와 픽셀·성능 동등 이상인가"**만 검증하면 된다. 이는 Hokusai 후보의 착수 비용을 실질적으로 0에 가깝게 만드는 현행 우위다.
- 위험 근거: 매트릭스 E12 위험 항목 — "신규 프로젝트이므로 기능·픽셀 동등성과 장기 유지보수를 검증한다." 브러시 JSON은 신뢰된 brush pack에서만 로드한다(패키지 README — Hokusai는 복잡한 고밀도 libmypaint 매핑을 의도적으로 지원).

### 3.3 ToonWet (E28)

- 근거: V11 §5 수채·수묵 행 — "기본 수채는 검증 엔진으로 구현하고 backrun·granulation·건조 타임라인처럼 차별화된 현상만 자체 확장한다." §6.2 `ToonWetProvider` — "검증 엔진에 없는 습식 현상 또는 명확한 품질 우위가 입증된 경우."
- 채택 조건: V11 §3.3의 8개 조건 중 최소 1개를 벤치마크와 시각 자료로 입증. 입증 전에는 훅만 유지한다.

## 4. 미실측 수치 정책

- p50/p95/p99, Peak Memory, 번들 크기, interop 복사 비용은 이 문서에서 **전부 미실측**으로 표기했다. 어떤 수치도 추정으로 기입하지 않는다.
- 측정 주체: `tests/benchmarks` 하니스(측정 설계는 `benchmark-plan.md`).
- 측정 완료 후 이 표의 해당 칸을 실측값 + 측정 커밋 해시로 갱신한다.

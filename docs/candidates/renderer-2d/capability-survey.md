# renderer-2d 후보 역량 조사 (Capability Survey)

- 담당 서브시스템: **renderer-2d** — 2D 렌더러와 island 합성
- 관련 매트릭스 행: **E01~E06, E08, E13~E15, E28** (`docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv`)
- 권위 소스: `docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md`
- 원칙: **Verified-first, Hybrid-by-strength, Evidence-driven Custom** (V11 §0.1)

> 성능 수치 규율: 아래 표의 p50/p95/p99와 Peak Memory는 **아직 미실측**이다. 수치를 지어내지 않으며, 전부 `tests/benchmarks` 하니스(V11 Phase 0)로 측정한 뒤에만 기입한다. 정성적 사실(예: Vello 저장소가 알파 상태를 명시)은 공개 근거와 함께 기록한다.

## 1. 조사 요약

V11 1차 구현에서 실코드로 들어가는 renderer-2d 엔진은 **두 개**다.

1. **CanvasKit (Skia)** — 생산 기준선(Production Baseline). 일반 레이어 합성·마스크·텍스트·실시간 필터·기준 출력의 주 소유자.
2. **vello_cpu 0.2.0 crate** — 결정적 CPU 기준선(Deterministic CPU Baseline). wasm-pack으로 빌드해 cross-renderer diff, golden image, GPU 장애 복구, 백그라운드 export를 담당.

나머지 후보(Vello Classic/Hybrid, ThorVG, vello_svg+Velato, resvg+tiny-skia, Glifo, ToonGpuExtensions)는 벤치마크 게이트를 통과한 뒤 단계적으로 승격되는 **후보 Provider**로 유지한다. Kurbo·Peniko는 렌더러가 아니라 renderer-2d가 소비하는 기하·스타일 계층이므로 1차부터 IR 어댑터 수준에서 동행한다.

## 2. 후보 역량 매트릭스

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CanvasKit (Skia) [E01] | Path·Paint·Paragraph·ImageFilter·RuntimeEffect·Skottie를 하나의 성숙한 코어에서 제공. 마스크·혼합·텍스트·기준 출력의 검증된 기준선 | 대량 동적 벡터 장면의 GPU compute 상한은 Vello 계열 대비 설계상 낮을 수 있음(미실측·벤치 대상). Rust IR과의 직결 부재(JS/WASM 바인딩 경유) | Skia 계보의 프로덕션 품질. Chrome/Android/Flutter에서 장기 검증됨 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | WASM 번들이 큼(수 MB급, 정확 수치는 빌드 산출물로 실측). lazy load + Worker 상주 관리 필요 | GPU 백엔드는 드라이버 의존 변동 가능. CPU(Software) 서페이스는 기준선으로 활용 가능 | BSD 계열 (permissive) | 낮음~중간: 타 엔진 결과를 이미지/텍스처로 받아 최종 합성하는 허브. GPU context 분리 비용은 관리 필요 | 낮음: Google이 유지보수하는 성숙 프로젝트. 단 CanvasKit 공개 API 표면 변화 추적 필요 | **생산 기준선 — V11 1차 실코드 채택.** 기본 페인팅 Surface, 래스터 브러시, 텍스트, 마스크, 실시간 필터, 기준 출력의 주 소유자 |
| Vello Classic [E02] | Rust/wgpu GPU compute 렌더러. 복잡한 path가 많고 자주 바뀌는 장면의 처리 상한이 높음. Kurbo·Peniko 직접 결합 | 저장소가 **알파 상태를 명시**(근거: github.com/linebender/vello README). 복합 필터·일부 마스크·성숙한 텍스트 스택 미비. WebGPU 필수 | 벡터 래스터화 품질은 유망하나 프로덕션 검증 이력이 짧음 — golden diff로 실증 필요 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Rust→WASM+WebGPU. wgpu 파이프라인 컴파일·셰이더 캐시 워밍 비용 존재(실측 대상) | GPU compute 기반이라 장치·드라이버별 픽셀 차이 가능 → vello_cpu와 diff로 감시 | MIT / Apache-2.0 | 중간: Vello scene 허브로 쓰면 낮으나, CanvasKit과 병용 시 texture island 왕복 비용 발생(복사 비용 사다리 §9.2 적용) | 중간~높음: 알파 상태·API 변동. Linebender 커뮤니티 활발하나 안정성 게이트 필요 | **조건부 가속기 — 1차 미채택.** 선화·컷·말풍선·효과선·대규모 벡터 장면용으로 Phase 1 벤치 통과 시 island 단위 승격 |
| Vello Hybrid [E03] | CPU 경로 준비 + GPU 래스터의 역할 분담. 이미지 atlas·texture binding 결합 가능. 저전력 벡터 편집의 균형형 후보 | API·기능 동등성이 계속 변화(근거: docs.rs/vello_hybrid). 마스크·필터 지원은 capability probe로 확인해야 함 | Classic과 동일 계보이나 경로가 달라 별도 golden 검증 필요 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Classic보다 GPU 요구가 낮을 것으로 기대되나 실측 전 단정 금지 | Classic과 동일: GPU 결과는 vello_cpu 기준과 diff | MIT / Apache-2.0 | 중간: Classic과 문서별 벤치로 택일. 미지원 구간은 CanvasKit 결과 재주입 필요 | 중간~높음: 신생 crate, 버전 간 파괴적 변경 가능 | **조건부 가속기 — 1차 미채택.** 이미지·텍스트·벡터 혼합 장면, 저전력 프로파일 후보로 후보군 유지 |
| vello_cpu (Vello CPU) [E04] | GPU와 분리된 순수 CPU 렌더. 시각 회귀·썸네일·장애 복구·서버 렌더에 동일 코드 경로 제공 | 대형 실시간 장면 처리량은 GPU 대비 낮을 수 있음(설계상 예상, 실측 대상). 인터랙티브 주 렌더러 용도 아님 | 결정적 CPU 래스터 기준 이미지 생성에 적합 — resvg·CanvasKit Software와 교차 기준 구성 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | **0.2.0 crate를 wasm-pack으로 빌드**해 Worker에 적재. GPU 초기화 불필요라 콜드스타트 유리(수치는 실측) | **높음(핵심 가치)**: GPU 비의존 결정적 출력이 채택 이유. 스레드 수·SIMD 경로별 동일성은 하니스로 검증 | MIT / Apache-2.0 | 낮음: PNG/타일 버퍼로 결과를 넘기는 오프라인·검증 경로 중심이라 hot path 왕복 없음 | 중간: Vello 계열과 같은 저장소·릴리스 주기. 알파 생태계이나 CPU 경로는 표면이 좁아 고정(commit pin) 용이 | **결정적 CPU 기준선 — V11 1차 실코드 채택(vello_cpu 0.2.0, wasm-pack).** cross-renderer diff, golden image, GPU 장애 복구, 백그라운드 export 소유 |
| Kurbo [E05] | Rust Bézier·path 기하 연산(arc-length, split, fitting). Vello 생태계와 자연 결합 | 렌더러 아님. 강건 boolean 전량을 단독 해결한다고 가정 금지(V11: Skia PathOps·Clipper2와 결합) | 해당 없음(기하 계층) — 곡선 근사 오차는 수치 허용치로 검증 | 미실측 — tests/benchmarks 하니스로 측정 (path 연산 처리량) | 미실측 — tests/benchmarks 하니스로 측정 | 작음(순수 Rust 라이브러리, 렌더 파이프라인 없음). PathIR 어댑터 crate에 포함 | 높음: 순수 CPU 수치 연산, 플랫폼 간 부동소수점 차이만 관리 | MIT / Apache-2.0 | 낮음: PathIR ↔ Kurbo 변환이 곧 인터페이스. CanvasKit SkPath로의 변환기 1개 필요 | 낮음~중간: Linebender 핵심 crate로 활발히 유지 | **핵심 기하 계층 — 1차부터 IR 어댑터로 동행.** 중심선·outline 후처리·guide·balloon tail 기하 담당 |
| Peniko + Linebender Color [E06] | 색·그라데이션·이미지·블렌드 표현을 Vello 계열 공통 언어로 제공. wide-gamut 대응 | 렌더러 아님. 엔진별 alpha·gamma·색공간 차이는 소비자가 보정해야 함 | 해당 없음(스타일 계층) — cross-renderer 색 차이는 color chart diff로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 작음(타입·변환 라이브러리). PaintIR 어댑터에 포함 | 높음: 순수 데이터 변환 | MIT / Apache-2.0 | 낮음~중간: PaintIR ↔ Peniko ↔ CanvasKit Paint 매핑 테이블 필요. premultiplied alpha·sRGB/linear 정합이 핵심 리스크 | 낮음~중간: Vello와 동일 릴리스 궤도 | **핵심 스타일 계층 — 1차부터 PaintIR 매핑으로 동행.** gradient·image brush·blend 매핑과 cross-renderer 색 검증 담당 |
| Glifo [E08] | 반복 glyph outline/image/hint 캐시로 텍스트 다량 캔버스의 렌더 비용 절감 가능 | 실험적(매트릭스 판정: 실험적 보조). 단독 텍스트 스택 아님 — Parley 산출 glyph run 소비자 | 미검증 — CanvasKit Paragraph 결과와 비교로 판단 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 작을 것으로 예상하나 실측 전 단정 금지. GlyphCacheAdapter 뒤 lazy load | 캐시 계층이므로 원 렌더러의 결정성을 따름 | permissive | 중간: Parley glyph run→Glifo→Vello 경로가 전제라 Vello 승격과 운명 공동체 | 높음: 실험적 프로젝트. **GlyphCacheAdapter 인터페이스 뒤에서만 사용**해 교체 가능성 확보 | **실험적 보조 — 1차 미채택.** Vello 텍스트 island 승격 시 glyph atlas 후보로 재평가 |
| ThorVG [E13] | retained scene·blending·masks·text·effects·Lottie·partial rendering. CPU/WebGL/WebGPU 백엔드 선택 가능 | SVG/Lottie **완전 사양 커버리지 가정 금지**(매트릭스 E13 위험 항목) — 파일별 feature scan 필수 | Lottie·경량 벡터에서 생산 보조급. 정적 SVG 정확도는 resvg 기준과 diff로 판정 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | C++→WASM 별도 번들. animated brush tip·asset 렌더 용도로 Worker 격리 lazy load | CPU 백엔드는 기준화 가능, GPU 백엔드는 diff 감시 대상 | MIT | 중간: 프레임 캐시(이미지)로 주 렌더러에 전달하는 island 모델이라 경계는 단순, 대신 rasterize 왕복 존재 | 중간: 활발한 오픈소스이나 사양 커버리지 변동 추적 필요 | **생산 보조 — 1차 미채택.** SVG/Lottie asset, animated brush tip, low-power 벡터 island 담당 후보. Velato/Skottie와 파일별 라우팅 |
| vello_svg + Velato [E14] | SVG/Lottie를 Vello scene fragment로 직접 편입 — 벡터 장면·편집 overlay를 같은 렌더러에서 합성(rasterize 왕복 제거) | 미지원 SVG/Lottie 사양 존재 — scanner가 사전 분리 필수(매트릭스 E14 위험 항목). Vello 자체가 알파 | Vello 계보 품질. resvg를 정확한 정적 reference로 두고 diff | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Vello 채택 시 증분 비용 작음(scene 변환기). 단독 채택 유인 없음 | Vello Classic과 동일 특성 | MIT / Apache-2.0 | 낮음(Vello 내부에서는) / 높음(Vello 미채택 시 무의미) | 중간~높음: Vello 종속 + 사양 커버리지 갭 | **조건부 보조 — 1차 미채택.** Vello island 승격 시 웹툰 장식·motion asset·vector brush stamp의 Vello-native 편입 경로 |
| resvg + tiny-skia [E15] | 정확한 정적 SVG 렌더 + 결정적 CPU 래스터. 서버·테스트에서 기준 이미지 생성에 최적 | 동적 편집기 전체 렌더러 아님(매트릭스 E15가 역할을 reference/export로 한정). 애니메이션 미담당 | SVG 정합성 기준선으로 업계에서 참조되는 수준 — 본 프로젝트에서는 정적 SVG의 최종 심판 역할 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Rust→WASM 소형 번들 예상(실측 대상). 테스트·CI에서는 native 실행 우선 | **높음**: CPU 결정적 렌더가 존재 이유. vello_cpu와 함께 이중 기준 구성 | MIT / Apache-2.0 | 낮음: PNG 산출→pixel diff 소비라 파이프라인 결합 없음 | 낮음~중간: 성숙한 Rust 프로젝트 | **필수 기준선 — 1차 벤치 하니스에 편입.** SVG import preview·golden image·export validation·GPU 장애 복구의 정적 기준. 런타임 주 렌더러로는 미사용 |
| wgpu/WebGPU + ToonGpuExtensions [E28] | 검증 엔진 결과를 같은 frame graph에 연결. sparse tile residency·final composite·진단 등 제품 특화 공백을 얇게 채움 | 범용 렌더 기능 없음(의도적) — 범용 기능은 기존 엔진 우선(V11 §4 E28). 자체 엔진 전체 신작 금지 | 해당 없음(합성·확장 계층) — composite 정확도는 reference composite와 diff | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 자체 WGSL pass 소수 — 번들 증가 미미 예상(실측 대상). WebGPU 미지원 브라우저 폴백 필요 | 자체 pass는 결정적 작성 가능하나 GPU 부동소수점 차이는 허용치 diff로 관리 | internal + wgpu는 MIT/Apache-2.0 | 핵심 임무가 interop: texture 공유·external texture·복사 비용 사다리(§9.2) 구현 담당 | 자체 코드 유지보수 부담 — **작게 유지**가 정책. 입증된 우위 시에만 주력 승격 | **필수 얇은 확장 — 1차에는 island 합성 최소 pass만.** texture interop·final composite·진단. ToonWet 등은 증거 확보 후 |

## 3. 1차 구현 판정 근거

| 판정 | 근거 |
| --- | --- |
| CanvasKit을 생산 기준선으로 즉시 채택 | V11 §4 E01 판정("생산 기준선")과 §13 Phase 1. 마스크·텍스트·필터·출력까지 한 코어에서 제공하는 유일한 성숙 후보. permissive 라이선스로 직접 WASM 통합 가능 |
| vello_cpu 0.2.0을 결정적 CPU 기준선으로 즉시 채택 | V11 §4 E04 판정("필수 기준선"). GPU 비의존 결정적 출력이 시각 회귀·장애 복구·백그라운드 export의 전제. wasm-pack 빌드로 Worker 격리 적재 가능. 알파 생태계 리스크는 CPU 경로의 좁은 표면 + commit/버전 고정(0.2.0)으로 통제 |
| Vello Classic/Hybrid는 1차 보류 | 저장소가 알파 상태를 명시. WebGPU 필수 요건과 마스크·필터 공백. Phase 1 cross-renderer diff와 벤치 게이트 통과 시 island 단위로 승격 |
| ThorVG·vello_svg+Velato는 asset 계층 후보로 보류 | renderer-2d의 주 표면이 아닌 SVG/Lottie asset island 담당. 파일별 feature scanner 구축이 선행 조건 |
| resvg+tiny-skia는 하니스에 즉시 편입 | 런타임 코드가 아니라 벤치·golden 기준 자산. 1차 구현의 품질 게이트를 구성하는 데 필요 |
| ToonGpuExtensions는 최소 pass만 | V11 §0.1 증거 기반 자체 구현 원칙. 1차에서는 CanvasKit island 합성에 필요한 texture interop·composite pass만 작성 |

## 4. 측정 완료 시 갱신 규칙

- `tests/benchmarks` 하니스가 산출한 p50/p95/p99·Peak Memory는 **장치 프로파일·코퍼스 ID·엔진 commit과 함께** 이 표를 갱신한다.
- "미실측" 셀을 수치로 바꿀 때는 반드시 측정 리포트 경로를 각주로 남긴다.
- 판정(Final Role) 변경은 benchmark-plan.md의 통과 게이트를 근거로만 수행한다.

---

## Vello GPU(Classic) 네이티브 실검증 (2026-08-08, ADR-0010 §4)

`crates/studio-engine-vello/tests/gpu_parity.rs` — vello 0.9.0을 headless wgpu(Metal, Area AA)로
구동해 동일 SceneIR 코퍼스를 vello_cpu 골든과 3×3/δ48 퍼지 비교. 원시:
tests/benchmarks/results/vello-gpu-native.json.

| 장면 | GPU↔CPU 퍼지 불일치 | GPU p50 | GPU p95 |
| --- | --- | --- | --- |
| 01-solid-shapes | **0.0000%** | 1.61ms | 2.59ms |
| 02-strokes | **0.0000%** | 1.54ms | 1.58ms |
| 03-curves | 0.0366% | 1.54ms | 1.76ms |
| 04~07 (gradient·blend·group) | **전부 0.0000%** | ~1.6ms | ~1.7~2.9ms |

판정:
- **품질 리스크 해소**: Vello GPU는 결정적 CPU 기준선과 사실상 픽셀 동일(최악 0.037%, 게이트 0.6%의
  1/16). "알파라서 품질 불안"이라는 유보는 실측으로 기각 — ADR-0010의 게이트 조건 (a) 충족.
- 성능: 128² 소형 장면에서 readback 포함 p50 ~1.6ms(오버헤드 지배 구간). 대량 path 상한 검증은
  대형 장면(30k 스트립·8K) 벤치가 다음 단계.
- 측정 시 readback은 테스트 전용 증거 수집이며 인터랙티브 경로 금지 규칙(§9.1)과 무관.
- 다음: wgpu WebGPU(wasm) 어댑터 PoC — 브라우저에서 같은 패리티/성능 게이트 재현.

---

## V12 wasm GPU 빌드 게이트 (2026-08-08)

위 "다음" 항목의 첫 게이트(컴파일·링크)를 실측 통과했다.

- 명령: `crates/studio-engine-vello`에서
  `cargo build --release --target wasm32-unknown-unknown --features gpu`
- 결과: 성공 — `` Finished `release` profile [optimized] target(s) in 21.28s `` (빌드 로그 실측).
  컴파일 목록에 vello 0.9.0 · wgpu 29.0.4 · wgpu-types 29.0.4 · wasm-bindgen-futures 0.4.76 포함.
- 산출물: `target/wasm32-unknown-unknown/release/studio_engine_vello.wasm` = **4,406,493바이트(≈4.4MB)**
  (opt-level="s" + LTO). `gpu` 피처는 optional lane으로, 기본 wasm-pack 산출물(vello_cpu 기준선)에는
  포함되지 않는다.
- 의미: "WebGPU 필수라 wasm 채택 불가" 유보 중 **빌드 실패 리스크는 실측으로 기각** — Vello GPU 레인이
  wasm32 타깃에서 링크된다. 핀·라이선스·증거 전체는 `docs/engines/vello-baseline.md` 참조.
- 남은 게이트: 실브라우저 WebGPU 구동(디바이스 획득·렌더·네이티브와 동일한 퍼지 패리티·성능 실측).
  통과 전까지 이 레인의 상태는 격리 원장
  `docs/adr/0011-v12-frontier-quarantine-ledger.md` 레인 2("빌드 게이트 통과")로 관리한다.

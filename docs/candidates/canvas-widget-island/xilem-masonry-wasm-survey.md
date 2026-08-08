# Xilem/Masonry CanvasWidgetIsland — wasm 빌드·실구동 조사 (2026-08-08)

V12 §8.2 `CanvasWidgetIsland`(ADR-0011 레인 6)의 격리 사유였던 "웹 타깃 실험 단계, 리포 내
PoC 0건"을 실측으로 대체한 기록. PoC 크레이트는 `~/toolchains/xilem-poc`(리포 밖), 수치 원본은
`tests/benchmarks/results/xilem-wasm-attempt.json`.

## 1. 버전 정합 실측 (crates.io 인덱스, 2026-08-08)

| 항목 | 실측 | 함의 |
| --- | --- | --- |
| xilem / masonry 최신 | 0.4.0 (2025-10-29) | 알파, breaking-changes 리스크는 V12 매트릭스 표기 그대로 |
| masonry → vello | **^0.6.0** (해상 0.6.0, wgpu 26.0.1) | 리포 핀 vello **0.9**와 3마이너 격차 — 아일랜드가 우리 Scene/Renderer 객체를 공유 불가. 공존 시 이중 vello(+이중 wgpu 디바이스) 또는 상류 추격 대기 |
| xilem → tokio | ^1.48, **rt-multi-thread 비옵션** | wasm32에서 tokio가 compile_error로 하드 차단 → **xilem view 레이어는 0.4.0에서 웹 불가** |
| accesskit | 0.21.1 + accesskit_winit 0.29.2 | 어댑터는 macos/windows/android/unix뿐 — **웹 어댑터 크레이트 부재**. TreeUpdate 데이터 생성은 wasm에서 동작(실측 §3), 브라우저 a11y 트리 투영은 자체 DOM 미러 구축 필요 |

## 2. 빌드 시도 (wasm32-unknown-unknown, rustc 1.97.1)

1. **xilem 0.4.0 → 실패**: `tokio-1.53.1/src/lib.rs:479` `compile_error!("Only features
   sync,macros,io-util,rt,time are supported on wasm.")` — 실패 지점 유일·정밀.
2. **masonry 0.4.0 발행판 → 실패**: masonry_core의 wasm 경로(`src/app/tracing_backend.rs`)가
   Cargo.toml에 **미선언**인 `tracing_wasm`·`console_error_panic_hook`를 참조(E0433×3) + 코드
   부패(비한정 `Registry`, tracing-wasm 0.2.1 `set_max_level` 타입 불일치 E0308). 상류가 발행판
   wasm 경로를 한 번도 컴파일하지 않았다는 물증. **git main에서는 이미 수정됨**.
3. **masonry_core 0.4.0 벤더 + 2의존/2행 로컬 패치(상류 main 미러) → 성공**: masonry_core(패치)
   + masonry + masonry_winit + vello 0.6 + wgpu 26 + parley 0.6 + accesskit(+winit) + copypasta
   전 스택 컴파일. 산출 `poc_masonry_bg.wasm` **2,990,509B**(임베드 Roboto 488,584B 제외 순중량
   ≈2.50MB), JS 글루 59.9KB.

## 3. 실구동 (Chromium 140 headless WebGPU, metal)

- **masonry_winit은 웹 구동 불가**: `event_loop_runner.rs:965`
  `pollster::block_on(create_surface)` — JS 비동기 어댑터 획득을 동기 블로킹, 컴파일은 되나
  브라우저에서 영원히 미해결. **winit 글루를 버리고 `masonry_core::RenderRoot`를 직접 구동**
  (`handle_pointer_event` 입력 → `redraw() -> (vello Scene, accesskit TreeUpdate)` 출력 →
  자체 WebGPU 디바이스에서 `render_to_texture`+블릿). 이 형태가 곧 §8.2 아일랜드다 — winit
  창 없이 장면 조각을 우리 캔버스에 합성.
- 위젯 3종 실구동: Button(Roboto 실텍스트, parley 글리프런) + Slider + 커스텀 `ColorPatch`
  Widget(vello 페인트). 스크린샷·리드백 픽셀 검증 통과, 콘솔 에러 0.
- **입력 왕복**: 클릭 → ButtonPress 액션 → `edit_widget` 변이 → 재렌더 → 픽셀
  (200,40,40)→(24,160,88), 벽시계 **1.4ms**. 슬라이더 드래그(이벤트 10개+렌더) 0.3→0.935,
  원 중심 x 135.5→339, **2.8ms**. pointer_move 왕복(이벤트→패스→렌더→present submit)
  **p50 0.1 / p95 0.3 / p99 0.9ms** (n=100).
- **AccessKit**: `WindowEvent::EnableAccessTree` 후 초기 트리 8노드, 상호작용 증분 2노드 —
  wasm에서 TreeUpdate 생성 동작. 단 브라우저 투영 어댑터 부재(§1).
- 초기화: wasm 로드 21.2ms + 앱 init(어댑터/디바이스/vello 셰이더 컴파일 포함) 콜드 224.9ms /
  웜 37ms.

## 4. 판정

- 레인 6 상태 **격리 → 빌드 게이트 통과**(주의사항 명기): retained 위젯 트리(masonry_core)
  아일랜드는 실브라우저 WebGPU에서 빌드·구동·입력 왕복까지 실측 통과.
- 잔여 승격 게이트(§8 그대로): React+Vello 오버레이 대비 pointer latency **동률 이상 A/B**,
  focus·IME·스크린리더 무회귀(웹 어댑터 자체 구축 필요), 120Hz repaint budget, 결정적 이벤트
  리플레이.
- 실용 전제: (a) masonry 차기 릴리스의 wasm 패키징 수정 반영(로컬 패치 제거), (b) masonry의
  vello 0.9 추격(이중 vello 회피) — 이 둘이 재검토 관측점.

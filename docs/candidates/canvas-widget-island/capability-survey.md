# V12 CanvasWidgetIsland 후보 역량 조사

- 범위: 펜 디스플레이 모드의 캔버스 인접 retained widget island
- raw evidence: `tests/benchmarks/results/xilem-wasm-attempt.json`
- 상세 빌드 조사: `xilem-masonry-wasm-survey.md`

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| React 19 + 기존 Vello overlay | 현재 `/studio`의 focus/IME/DOM 접근성·번역·테스트 생태계와 정합 | retained canvas widget 대비 React commit/DOM 비용 가능성 | 현재 제품 기준선. CSP 작업 흐름 비열위는 사람 lab 미실측 | 후보 A/B 미실측 | 미실측 | 기존 bundle | 이벤트/상태 reducer 범위 결정적 | React MIT, Vello MIT/Apache-2.0 | 최저 | 낮음 | **제품 기준선/폴백** |
| Xilem 0.4.0 view stack | Rust retained view 모델과 Masonry 조합 | tokio `rt-multi-thread` 비옵션이 wasm32 compile_error. 현재 웹 빌드 자체 불가 | 미실측 | 미실측 | 미실측 | 산출물 없음 | 잠재적으로 결정적 | Apache-2.0/MIT 계열 | 높음: 전체 앱 state/view bridge | 매우 높음 | **격리: 상류 wasm 불가** |
| Masonry core 0.4.0 direct `RenderRoot` | retained widget layout/input/paint와 Vello Scene fragment, AccessKit TreeUpdate를 winit 없이 생성 | 발행판 wasm 경로 부패, vello 0.6/wgpu 26으로 리포 vello 0.9/wgpu 29와 불일치, 웹 AccessKit 투영·IME 없음 | Button/Slider/ColorPatch 실제 WebGPU 픽셀 변화 검증, console error 0. 제품 UI parity는 미실측 | pointer move **0.1/0.3/0.9ms**(n=100); click roundtrip 1.4ms; drag 2.8ms | 미실측 | patched wasm 2,990,509B(폰트 포함), JS 59.9KB. cold 224.9ms/warm 37ms | 동일 이벤트 replay gate는 미구현 | Apache-2.0/MIT 생태계 | 높음: 이중 Vello/wgpu, Scene fragment와 DOM a11y bridge | 높음: 로컬 patch·alpha API | **조건부 challenger; 제품 기본 아님** |
| Masonry winit web shell | desktop event loop 통합을 재사용 | browser surface init이 `pollster::block_on`에서 미해결. 실구동 불가 | 없음 | 없음 | 없음 | core보다 큼 | N/A | permissive | 매우 높음 | 매우 높음 | **기각: 웹 shell** |
| 자체 CanvasWidgetIsland + existing React semantics | 제품에 필요한 pen HUD만 bounded scene/input island로 직접 구현, DOM semantics는 React mirror 유지 | 자체 focus/navigation/event replay 비용 | 기준 overlay와 교차 diff 가능 | 미실측 | 미실측 | 필요한 widget만 포함 | reducer/seed 고정 가능 | 내부 코드 | 중간 | 기능 증가 시 자체 widget toolkit 위험 | **Masonry가 정합되지 않을 때 제한적 후보** |

## 판정

Masonry core의 실브라우저 PoC는 빌드 가능성과 저지연 가능성만 증명한다. 다음 이유로 제품 기본
승격은 보류한다.

1. 리포와 세 마이너 다른 Vello, 다른 wgpu device를 포함한다.
2. AccessKit `TreeUpdate` 생성은 되지만 브라우저 접근성 트리에 투영되지 않는다.
3. IME, focus traversal, screen reader, 한국어/일본어 입력, 120Hz A/B가 없다.
4. 발행판에 로컬 patch가 필요하다.

따라서 React 19 + Vello overlay를 기준선으로 유지하고, Masonry는 `CanvasWidgetIsland` 경계 뒤
challenger로만 둔다.

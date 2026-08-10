# V12 CanvasWidgetIsland 벤치마크 계획

## 이미 측정된 PoC

`tests/benchmarks/results/xilem-wasm-attempt.json`과 `xilem-masonry-wasm-survey.md`가 다음을 고정한다.

- Xilem 0.4.0 wasm build: 실패(tokio rt-multi-thread)
- Masonry 0.4.0 published wasm: 실패, local upstream-mirror patch 후 성공
- wasm 2,990,509B(폰트 포함), JS 59.9KB
- Chromium 140 Metal WebGPU에서 Button/Slider/custom paint 실구동
- pointer move p50/p95/p99 0.1/0.3/0.9ms, click 1.4ms, drag 2.8ms
- AccessKit 초기 8노드/증분 2노드 생성
- 웹 a11y 투영·IME·제품 A/B는 미측정

## 승격 A/B

같은 production build, device, viewport, widget tree에서 React overlay와 CanvasWidgetIsland를
프레임마다 교차 실행한다.

| 축 | 코퍼스 | gate |
| --- | --- | --- |
| pointer latency | pen hover/move/press/drag 10k replay | island p95가 React보다 열위 아님, 120Hz p95≤8.33ms |
| visual | slider, color patch, brush HUD, transform handles | δ48 fuzzy 및 구조 probe 통과, 텍스트 기준선 일치 |
| focus | Tab/Shift+Tab/arrow/escape 500 replay | 순서·active owner·복귀 지점 완전 일치 |
| IME | 한글 조합, 일본어 변환, CJK punctuation, emoji | composition loss/duplicate command 0 |
| screen reader | role/name/value/action/bounds snapshot | axe + VoiceOver/NVDA 수동 시나리오 무회귀 |
| device loss | paint 중 GPUDevice destroy | React fallback, 입력/command loss 0 |
| memory | 1/10/100/1000 widget | JS/WASM/GPU peak 각각 기록, 숨은 이중 device 0 |
| bundle/startup | cold/warm load | incremental compressed bytes와 shader compile 분리 기록 |
| replay | 같은 event stream 100회 | state digest와 command sequence 동일 |

## 품질 우선 판정

낮은 pointer latency만으로 승격하지 않는다. IME 또는 screen reader가 하나라도 실패하면 전체
candidate는 해당 surface에서 탈락한다. canvas text가 React/CanvasKit reference보다 흐리거나
font fallback/bidi/selection 의미를 잃으면 React owner를 유지한다.

## 실기기

- Wacom/Huion/XP-Pen pen display
- Apple Pencil/S Pen/Surface Pen
- macOS VoiceOver, Windows NVDA
- 60/120/144Hz, DPR 1/2/3

물리 장치 결과가 없으면 “Pen Display Surface Mode CSP 비열위”를 완료로 표시하지 않는다.

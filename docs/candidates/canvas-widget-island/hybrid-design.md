# V12 CanvasWidgetIsland 하이브리드 설계

## 소유권

```text
Studio document / command / focus authority
  React 19 + CommandRegistry + stable IR
       │
       ├─ DOM semantics, IME, screen reader, menus, dialogs
       │
       └─ bounded CanvasWidgetIsland port
            input event subset → retained widget state
            redraw → Vello Scene fragment + semantic delta
            compose → existing StudioGpuFabric
```

Masonry 또는 자체 challenger가 선택되어도 문서·focus·command 권위를 소유하지 않는다. island는
펜 HUD, slider, color patch처럼 캔버스에 가까운 bounded widget만 소유한다. 대화상자·텍스트 입력·
메뉴·파일 작업은 DOM/React에 남긴다.

## admission

다음을 모두 만족한 island만 활성화한다.

- WebGPU와 shared fabric 사용 가능
- 같은 Vello/wgpu major/minor 또는 zero-copy fragment adapter 증명
- widget count·backing pixels 상한 이하
- DOM semantic mirror와 focus target 존재
- 해당 widget corpus의 React A/B visual/input/accessibility gate 통과

불충족 시 React overlay가 유일한 owner다. 한 기능을 React와 canvas가 동시에 hit-test하지 않는다.

## 렌더 파이프

```text
pointer/coalesced input
  → island event normalization
  → deterministic retained update
  → dirty widget/layout only
  → Vello Scene fragment
  → shared GPUTexture/canvas composite
```

hot path readback은 0이다. accessibility snapshot은 픽셀 readback이 아니라 semantic tree delta다.
Masonry가 다른 GPUDevice를 만들면 제품 admission을 거부한다. PoC의 이중 vello/wgpu 경로를
제품에 그대로 넣지 않는다.

## 접근성·IME

AccessKit tree 생성만으로 웹 접근성이 완료되지 않는다. `role`, name, value, bounds, focus,
actions를 DOM mirror로 투영하고 양방향 action routing을 검증해야 한다. 텍스트 조합은 hidden DOM
input/textarea가 authority이며 compositionstart/update/end를 deterministic command로 변환한다.

screen reader가 읽을 수 없는 캔버스 widget, keyboard focus trap, IME 조합 손실이 한 건이라도
발견되면 해당 island를 remote kill하고 React로 되돌린다.

## 폴백과 교체

- Masonry init/paint/device-loss 실패: last-good frame을 버리고 React overlay 복귀.
- semantic mirror 실패: canvas widget 비활성, DOM owner 유지.
- 상류가 vello 0.9+/wgpu 정합과 wasm 패치를 릴리스하면 로컬 patch 제거 후 재측정.
- 자체 island가 동일 corpus에서 번들·latency·접근성 우위를 입증하면 Masonry 대신 선택 가능.

제품 전체 UI를 Xilem으로 재작성하지 않는다. 후보의 장점은 pen-adjacent bounded island에만 쓴다.

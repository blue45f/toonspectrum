# SVG Vello-native 하이브리드 설계

## 결론

SVG 하나를 모든 엔진에 억지로 통과시키지 않는다. source audit 결과와 사용자 의도에 따라 큰 asset
island 단위로 라우팅한다.

```text
SVG bytes
  │
  ├─ strict source audit + usvg normalized-tree audit
  │    │
  │    ├─ 지원됨 + 인터랙티브 Vello island
  │    │      └─ vello_svg 0.10 → Vello 0.9 Scene → browser WebGPU
  │    │             └─ 동일 usvg tree → vello_cpu 0.2 sibling reference
  │    │
  │    ├─ 편집 가능한 import 요청
  │    │      └─ 기존 FormatGateway → stable SceneIR → renderer tournament
  │    │
  │    └─ strict subset 밖 / final correctness
  │           └─ resvg reference/final raster → texture island
  │
  └─ unsupported 목록을 UI에 표면화; 조용한 drop·빨간 placeholder·bbox clip 금지
```

## Surface 소유권

- native SVG Provider는 **SVG asset island**만 소유한다. 문서 전체 surface, input, brush pixel 권위는
  가져가지 않는다.
- WebGPU 경로는 Vello Scene을 기존 Vello device/renderer 안에서 합성하는 것이 최종 목표다. 이번
  `render_svg_gpu_json`의 pixel readback은 품질 증거와 export 테스트 전용이며 interactive hot path에서
  호출하지 않는다.
- 객체마다 renderer를 바꾸지 않는다. 하나의 SVG 자산이 strict native, editable SceneIR, resvg final 중
  한 lane을 선택한다.

## CPU reference의 정확한 의미

vello_cpu 0.2는 Vello 0.9 GPU scene encoding을 직접 소비하지 않는다. 따라서 이 구현은 이를 거짓으로
주장하지 않고, **동일한 strict audit와 동일한 usvg tree를 두 frontend가 나눠 소비**한다.

- GPU: `vello_svg::append_tree_with` → `vello::Scene`
- CPU: usvg path/paint/group/clip을 vello_cpu `RenderContext`에 직접 하강

두 경로는 소스 의미와 정규화 tree를 공유하되 raster backend는 독립적이어서, GPU 오류를 CPU가
감지하는 reference 역할을 유지한다.

## 폴백 및 오류 계약

1. source XML 크기 2MiB, element 100,000, depth 128, target edge 65,535 제한을 먼저 검사한다.
2. 지원 밖 기능이 하나라도 있으면 전체 자산을 `svg-native-unsupported`로 거부한다. 부분 렌더는 없다.
3. 지원되는 SVG에서 WebGPU가 없거나 device init이 실패하면 상위 tournament가 명시적으로 SceneIR 또는
   resvg Provider를 선택한다. native wrapper 내부의 묵시적 CPU downgrade는 없다.
4. final export는 native가 빨라도 resvg reference gate를 통과한 결과만 완료 처리한다.

## 승격 범위

실측 후 승격되는 범위는 path/shape, solid/linear/radial gradient, group opacity/blend, 단일 geometry
user-space clip이다. text·image·filter·mask 등은 구현했다고 표시하지 않으며, 각 기능은 별도 후보
조사와 corpus가 생길 때만 strict 목록에서 제거한다.

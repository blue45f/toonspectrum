# SVG Vello 제품 배선 후보 조사

- 제품 범위: `/studio`의 `StudioAssetToolPopoverBody → StudioElementsPanel → StudioSvgAssetPreview`
- 원본 권위: 클릭·드래그·저장은 항상 원본 SVG data URL을 사용한다. 미리보기 픽셀은 문서 원본이 아니다.
- 품질 근거: `tests/benchmarks/results/vello-svg-native-browser.json`
- 승격 원칙: 정적 strict audit와 자산별 resvg 시각 게이트를 모두 통과하기 전에는 `vello-svg-native`를 선택하지 않는다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vello_svg 0.10 + vello_cpu 0.2 | vello_svg가 해석한 동일 scene을 결정적 CPU raster로 만들며 WebGPU readback 없이 Vello 결과를 제품 tile에 표시 | text, image, pattern, mask, filter, marker, use/symbol, nested SVG, external reference, objectBoundingBox·복합 clip | resvg 대비 SSIM 0.995692~0.997639, PSNR 36.841~42.790dB, 퍼지 불일치 최대 0.036621% | Node gradient end-to-end 3.552/3.712/3.866ms | 관측 RSS delta 147,456B; true peak 아님 | SVG 기능 포함 GPU wasm 증분 1,117,145B(+24.143%), lazy load | 반복 결과 byte-equal | MIT OR Apache-2.0 | 원본→vello scene 직결, 낮음 | upstream 부분집합 변경을 strict audit로 추적해야 함 | **strict audit + per-asset resvg gate를 통과한 Elements preview winner** |
| FormatGateway SceneIR + CanvasKit | 안정 IR로 의미를 편집·renderer 전환할 수 있음 | gateway warning/unsupported가 하나라도 있으면 editable 완전 보존을 주장할 수 없음 | 기존 native corpus와 평균 SSIM 0.996422로 동률권 | 기존 Node gradient 3.844/3.994/4.188ms | 관측 RSS delta 278,528B; true peak 아님 | CanvasKit wasm 0.41.1 lazy 경계 | 동일 입력 반복 byte-equal | ToonSpectrum code + CanvasKit BSD-3-Clause | SVG→IR→CanvasKit 하강, 중간 | root 앱의 좁은 CanvasKit 타입 경계 때문에 배포 해석 실패 가능 | **ledger가 완전히 비었을 때만 editable fallback 후보; 실패는 resvg로 명시 우회** |
| resvg-wasm 2.6.2 | 넓은 정적 SVG 의미와 독립 quality reference | ToonStudio IR 편집성을 만들지 않음 | 제품 gate의 reference owner | Node gradient 0.642/1.008/1.031ms | 관측 RSS delta 65,536B; true peak 아님 | wasm 2,478,606B, lazy | 반복 byte-equal | MPL-2.0 | RGBA preview copy 필요, 중간 | 낮음~중간 | **시각 심판이자 native/SceneIR 실패 시 실제 static fallback** |
| trusted browser SVG image | 번들 카탈로그의 font-dependent 원본 의미를 그대로 표시 | renderer 간 결정성과 full SVG 안전성을 제품이 보증하지 않음 | 브라우저/runtime 의존; 품질 승격 근거로 사용하지 않음 | 미측정 | 브라우저 소유 | 추가 wasm 0B | 미보장 | browser runtime | 가장 낮음 | 브라우저 차이 | **번들된 text/font 자산의 preserve-only 최후 경로** |
| 직접 full-SVG renderer | 고유 편집 의미를 확장할 수 있음 | SVG 전체 사양·폰트·필터·보안·색관리 구현 필요 | 증거 없음 | 미측정 | 미측정 | 미측정 | 미입증 | project implementation | 매우 높음 | 매우 높음 | **격리** |

## 제품 판정

현재 제품 winner는 WebGPU renderer 자체가 아니라 `vello_svg → vello_cpu`의 결정적 interactive preview다. 기존 GPU API는 픽셀 readback을 반환하므로 증거·export 용도로만 유지하며 이 caller에서는 호출하지 않는다. Unsupported 의미는 숨기지 않고 decision의 `reasons`, `warnings`, `unsupported`에 유지한다.

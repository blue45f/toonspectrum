# SVG Vello 제품 라이선스·배포

## 공급자와 고지

| Component | Pin | License | Product role |
| --- | --- | --- | --- |
| vello_svg | 0.10.0 | MIT OR Apache-2.0 | strict SVG lowering |
| usvg | 0.46.0 | Apache-2.0 OR MIT | SVG normalization |
| vello_cpu | 0.2.0 | MIT OR Apache-2.0 | deterministic interactive pixels |
| Vello | 0.9.0 | MIT OR Apache-2.0 | GPU evidence/future direct-surface lane |
| CanvasKit wasm | 0.41.1 | BSD-3-Clause | clean SceneIR editable candidate |
| @resvg/resvg-wasm | 2.6.2 | MPL-2.0 | independent reference/static fallback |

버전과 npm 라이선스는 설치된 package manifest, Rust 핀은 `crates/studio-engine-vello/Cargo.lock`과 기존 SVG engine 후보 문서에서 확인했다. 외부 공급사 인증이나 SVG 전체 적합성을 주장하지 않는다.

## 배포 경계

- SVG 제품 라우터는 Elements tile을 hover/focus하기 전에는 provider를 초기화하지 않는다.
- Vello SVG 기능은 integrity-pinned `pkg-gpu`에 포함되어 있지만 제품 preview는 그 artifact의 CPU export만 호출한다. GPU readback export는 evidence/final 용도다.
- CanvasKit과 resvg는 fallback에서만 lazy-load한다. resolver 실패는 원본 `<img>`를 유지하거나 다음 provider로 이동하며 빈 tile로 성공 처리하지 않는다.
- resvg MPL-2.0 artifact와 고지는 MIT/Apache 계열과 분리해 BOM에서 추적한다.
- 원본 SVG는 data URL로 project/drag authority를 유지한다. renderer-specific object 또는 RGBA cache는 저장하지 않는다.

## 보안·격리

script, foreignObject, iframe/object/embed, event attributes, javascript/vbscript URI, 외부 href/url은 provider 초기화 전에 거부한다. text/font fallback은 제품이 직접 저작·번들한 catalog trust에만 허용한다. arbitrary user SVG를 browser-native fallback으로 보내지 않는다.

전체 canvas primary renderer, arbitrary SVG file picker, full DOM editing, external font/image resolution은 이번 제품 island에 포함되지 않으며 별도 security/quality/license gate 전까지 격리한다.

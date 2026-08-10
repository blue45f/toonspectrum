# SVG Vello-native 라이선스·배포

## 핀과 라이선스

| Component | Pin | License | 역할 |
| --- | --- | --- | --- |
| vello_svg | 0.10.0 exact | MIT OR Apache-2.0 | usvg tree → Vello Scene |
| usvg | 0.46.0 | Apache-2.0 OR MIT | SVG parse/normalization |
| roxmltree | 0.21.1 exact | MIT OR Apache-2.0 | 원문 source audit |
| Vello | 0.9.0 | MIT OR Apache-2.0 | 브라우저 WebGPU scene renderer |
| vello_cpu | 0.2.0 | MIT OR Apache-2.0 | 동일 usvg tree의 CPU reference |
| @resvg/resvg-wasm | 2.6.2 | MPL-2.0 | 독립 quality/final reference |

vello_svg 0.10.0과 usvg 0.46.0의 license/version 값은 로컬 crates.io manifest에서 확인했고, npm
resvg package의 MPL-2.0도 설치된 package manifest에서 확인했다. resvg를 MIT/Apache 계열로 잘못
표시하지 않는다.

## 배포 형태

- native SVG 기능은 기존 `pkg-gpu` optional feature에만 포함한다. CPU `pkg/`는 빌드·바이트 모두
  변경하지 않았고 기존 `INTEGRITY.sha256` 검증을 통과했다.
- `pkg-gpu`는 lazy load한다. SVG를 사용하지 않거나 WebGPU가 없는 세션에 필수 초기 번들로 넣지 않는다.
- 실측 wasm 변화: 4,627,278B → **5,744,423B**, +1,117,145B(+24.143%). 압축 전 파일 크기이며,
  전송 크기로 오인하지 않는다.
- resvg 2,478,606B wasm은 final/reference Worker로 분리한다. Vello GPU 번들과 한 링크 단위로 섞지 않는다.
- 모든 SVG 처리는 로컬 브라우저에서 실행하며 서버 업로드를 요구하지 않는다.

## 무결성

- `crates/studio-engine-vello/pkg-gpu/INTEGRITY.sha256`은 SVG export를 포함한 wasm-pack 결과로 재봉인했다.
- CPU `pkg/INTEGRITY.sha256`의 package.json, d.ts, JS, wasm, wasm.d.ts 다섯 항목은 모두 OK다.
- 재빌드 명령은 기존 기능을 보존하도록 `--features lottie,fabric,svg`를 사용한다. SVG만 지정해 기존
  GPU lane을 조용히 제거하면 안 된다.

## 고지와 유지보수

1. 배포 고지에 vello_svg, usvg, roxmltree, Vello/vello_cpu의 MIT/Apache 선택 및 저작권 고지를 포함한다.
2. MPL-2.0 resvg wasm과 수정 파일이 생길 경우 MPL 의무를 별도 BOM에서 추적한다. 현재는 수정 없는 npm
   binary를 reference Worker로 사용한다.
3. Cargo 업데이트는 `vello_svg = =0.10.0`, `roxmltree = =0.21.1` exact pin을 의도적으로 변경하는 PR에서만
   허용하고, 동일 quality/browser corpus를 다시 실행한다.
4. upstream vello_svg의 unsupported callback 또는 clip 처리 의미가 바뀌면 strict audit를 먼저 갱신하고,
   feature claim을 확대하기 전에 resvg diff와 typed rejection 테스트를 추가한다.

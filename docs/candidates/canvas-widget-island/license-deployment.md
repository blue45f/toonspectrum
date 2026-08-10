# V12 CanvasWidgetIsland 라이선스·배포

## 후보 경계

| Component | License / maturity | 배포 판정 |
| --- | --- | --- |
| React 19 | MIT, stable | 현재 제품 기준선 |
| Vello 0.9 계열 | MIT OR Apache-2.0, alpha | 기존 V12 핀·NOTICE·integrity gate 유지 |
| Xilem 0.4.0 | Apache-2.0/MIT 생태계, alpha | wasm build 불가이므로 제품 번들 금지 |
| Masonry 0.4.0 | Apache-2.0/MIT 생태계, alpha | 로컬 patch PoC만. 제품 채택 전 정확한 crate별 notice와 patch provenance 필요 |
| AccessKit | MIT/Apache 계열 | TreeUpdate 생성과 웹 DOM 투영 코드는 별도 책임 |
| PoC Roboto font | Apache-2.0 | 제품 font policy와 별개; 파일/NOTICE 포함 여부 감사 |

## 배포 조건

Masonry challenger를 제품 chunk로 배포하려면 다음을 모두 충족해야 한다.

1. 상류 릴리스 또는 감사 가능한 vendor patch와 commit 핀
2. 리포 Vello/wgpu와 단일 버전·단일 GPUDevice
3. wasm/JS/font의 compressed incremental bundle 측정
4. LICENSE/NOTICE/SBOM 갱신
5. CSP `worker-src`/`script-src`/WASM 정책 통과
6. source map에 사용자 데이터나 외부 font license 누락 없음
7. remote kill switch와 React fallback이 eager duplicate bundle을 강제하지 않음

리포 밖 `~/toolchains/xilem-poc`는 재현 조사 자산이지 제품 소스가 아니다. PoC 산출물을 앱에
복사하지 않는다. 제품 도입 시 repository 안의 별도 vendor/build recipe, integrity manifest,
license inventory와 CI 재현 빌드를 새로 만든다.

## 데이터·접근성

widget island는 사용자 문서를 서버로 보내지 않는다. AccessKit/DOM semantic tree에 작품 본문이
포함될 수 있으므로 telemetry에 tree payload를 기록하지 않는다. 접근성 mirror는 로컬 런타임
내에서만 유지하고 로그에는 node count·error code만 남긴다.

## 격리

이 격리는 copyleft 때문이 아니라 alpha API, 이중 engine/device, 접근성·IME 실패 범위를 제한하기
위한 제품 격리다. G’MIC/GEGL의 license isolation과 같은 것으로 문서화하지 않는다.

## 철회 조건

- 상류가 wasm support를 회수하거나 CVE가 발생
- Vello/wgpu 이중 bundle 또는 device가 재발
- IME/screen reader correctness blocker 1회
- React 대비 3회 연속 성능 회귀

철회 시 stable IR/command는 그대로 두고 canvas widget provider만 제거한다.

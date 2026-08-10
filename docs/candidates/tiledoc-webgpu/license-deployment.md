# Tiled document WebGPU 라이선스·배포

## 구성요소와 라이선스

이번 레인은 새 runtime package를 추가하지 않았다.

| Component | Role | Distribution | License / policy |
| --- | --- | --- | --- |
| ToonStudio tiledoc store/planner/bridge/compositor/fabric | 제품 sparse tile authority와 WebGPU presentation | 기존 application JS bundle | ToonSpectrum 내부 코드 |
| Browser WebGPU API / WGSL | GPU upload, RGBA16F composite, Canvas presentation | 브라우저 구현; 별도 library 배포 없음 | Web platform API |
| Vite 8 | 독립 production evidence bundle | 개발·빌드 전용 | MIT |
| Playwright 1.55.1 + bundled Chromium 140 | Metal 브라우저 자동화·진단 | 테스트 전용, 제품 번들 제외 | Apache-2.0; Chromium notices는 Playwright 배포 규율 따름 |
| Canvas2D | WebGPU 명시적 폴백 | 브라우저 구현 | Web platform API |
| CanvasKit 0.41.1 | reference/export 후보, 본 primary path 미포함 | 기존 선택적 WASM | BSD-3-Clause |
| Vello 0.9 | selection/vector island, 본 raster primary path 미포함 | 기존 선택적 GPU WASM | MIT / Apache-2.0 |

`package.json`, lockfile, dependency graph은 변경하지 않았다. 이번 제품 번들에는 브라우저 WebGPU를
호출하는 TypeScript/JavaScript만 추가되며 새로운 notice 항목이 없다.

## 배포 헤더와 기능 조건

제품 경로 자체는 secure context에서 WebGPU를 capability probe한다. evidence preview는 메모리 API와
격리 조건을 정확히 관측하기 위해 아래 헤더를 고정한다.

```text
Content-Security-Policy:
  default-src 'none'; script-src 'self'; connect-src 'self';
  worker-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'none'; font-src 'none'; object-src 'none';
  base-uri 'none'; frame-ancestors 'none'
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

프로덕션 `/studio`의 기존 CSP가 WebGPU를 막지 않는지 launch verifier와 실제 페이지 QA에서 별도
확인한다. WebGPU가 없거나 context/configure가 실패하면 사용자를 막지 않고 Canvas2D island로
명시적 handoff한다. 조용한 memory fallback이나 축소 canvas를 “GPU 성공”으로 기록하지 않는다.

## 리소스·메모리 정책

- source texture cache 기본 상한: 512 entries / 512MiB.
- retained composite 기본 상한: 256 entries / 512MiB.
- frame upload 기본 상한: 128MiB.
- tile 크기: 제품 store의 512² contract를 그대로 사용.
- shared device: consumer가 `StudioGpuFabric` lease를 보유하고 dispose 시 release한다.
- isolated device: test/diagnostic에서 명시적 `gpu` override를 넣은 경우에만 consumer가 destroy한다.
- device loss: source/retained/pool texture를 전부 파기하고 다음 fabric epoch에서 store snapshot으로
  재구축한다.

실측 peak tracked GPU는 8K 208MiB, webtoon 354MiB였다. webtoon 수치는 512MiB source·retained
상한 안에 있으며 device recovery 후 final resident set은 104MiB source + 4MiB retained였다.
브라우저 전체 GPU heap은 표준 API로 노출되지 않으므로 추정치로 오표기하지 않는다.

## CSP·네트워크·콘솔 배포 게이트

하니스는 모든 request/response와 CSP violation event를 수집한다. 통과 조건은 다음과 같다.

- console error 0, console warning 0, uncaught page error 0.
- failed request 0, HTTP 4xx/5xx 0.
- CSP violation 0.
- production assets가 실제 JS bundle을 포함.
- host가 Darwin이고 launch args가 Metal을 강제하며 software rasterizer가 비활성.

2026-08-09 실측은 위 조건을 모두 통과했다.

## quarantine과 재검토 조건

| Lane | Current status | Quarantine reason | Promotion / replacement condition |
| --- | --- | --- | --- |
| Apple Metal 3 / Chromium 140 | **활성 검증됨** | 없음 | raw contract를 CI/장치 랩에서 계속 재현. regression 시 Canvas2D remote kill |
| Windows D3D12 | 미검증 장치 격리 | 이 작업에서 물리 Windows GPU를 사용할 수 없음 | 동일 하니스의 exact workload, quality ≤0.002, hot readback 0, diagnostics 0 |
| Linux Vulkan | 미검증 장치 격리 | 이 작업에서 물리 Linux GPU를 사용할 수 없음 | Windows와 동일 |
| Browser total GPU heap | 계측 불가 항목 | WebGPU 표준이 총 allocation bytes를 노출하지 않음 | 표준 memory API 또는 브라우저 공식 telemetry가 제공되면 제품 byte ledger와 교차 검증 |
| `measureUserAgentSpecificMemory` | 노출 불가 기록 | cross-origin isolation에도 Chromium 140이 SecurityError 반환 | API가 활성화된 Chromium에서 재실행; 현재는 `performance.memory` peak와 reason을 raw에 보존 |

격리 lane은 지원 완료로 표시하지 않는다. 단, Apple Metal 제품 vertical slice와 release blocker는
실제 upload/composite/presentation, fault recovery, 품질, diagnostics 증거로 닫혔다.

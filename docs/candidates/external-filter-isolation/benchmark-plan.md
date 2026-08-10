# ToonStudio V12 — 외부 필터 격리 벤치마크 계획

## 현재 완료된 프로토콜 하니스

`external-filter-bridge.test.ts`의 결정적 인메모리 하니스는 실제 `structuredClone` transfer를 사용하고, 시간만 주입형 virtual clock으로 통제한다. 32×32 RGBA8 입력·출력, 동시성 1, 엔진 작업 0, 네트워크 0 조건에서 1,000회 실행했다.

| Metric | Result | 의미 |
| --- | ---: | --- |
| p50 | 0.110ms | 가상 client post 0.025ms + 결정적 provider delivery 모델의 중앙값 |
| p95 | 0.135ms | 같은 가상 모델의 nearest-rank p95 |
| p99 | 0.135ms | 같은 가상 모델의 nearest-rank p99 |
| Peak in-flight bytes | 8,192B | 4,096B input + 4,096B expected output 예약 |
| Completion/error/leak | 1,000 / 0 / 0 | 완료 뒤 pending 0, reserved bytes 0 |

원시 값은 `tests/benchmarks/results/external-filter-bridge.json`에 있다. 이 숫자는 wall-clock serialization, browser Worker, OS IPC, network, G'MIC/GEGL 연산 또는 native memory를 측정하지 않는다. 따라서 provider 선택 점수의 성능 축에 입력하지 않는다. 현재 목적은 회계·routing·percentile 산출의 결정적 회귀 핀이다.

재현 명령:

```bash
pnpm exec vitest run packages/studio-engine-registry/src/__tests__/external-filter-bridge.test.ts
```

## 실제 provider 승격 하니스

### 후보와 corpus

| Corpus | 입력 | 비교 대상 | 목적 |
| --- | --- | --- | --- |
| CREATIVE-30 | 512², 2K, 8K 일러스트·톤·사진 혼합 30종 | G'MIC recipe pin ↔ 허용 reference | 창작 효과 품질·결정성·성능 |
| NDE-10 | 3~8개 조정/복원 DAG, 16개 대표 장면 | GEGL chain ↔ EffectGraphIR reference | 비파괴 의미·색관리·graph grouping |
| TILE-SEAM-12 | 8K×8K와 2K×30,720 웹툰, halo radius 다양 | full-frame reference ↔ tiled provider | 경계 seam/halo 정확성 |
| FAULT-20 | cancel 5시점, crash, malformed, oversize, slowloris | bridge contract | 프로세스 중단·회수·late suppression |
| CSP-BLIND | 동일 입력/장치/작업의 CSP 결과와 무기명 비교 | 사람 평가 + reference metric | CSP 비열위/초월 판정 |

### 측정 항목

1. client `postMessage` 직전부터 validated result 수용까지 p50/p95/p99와 throughput. cold start와 warm을 분리한다.
2. Studio JS heap, Worker/WASM memory, 외부 native process RSS, GPU memory를 별도 peak로 기록한다. 합계만 쓰지 않는다.
3. input/output transfer bytes, 타일 수, IPC/network 실제 전송량, encode/decode 시간을 분리한다.
4. PSNR/SSIM/ΔE00와 구조적 visual diff, alpha edge, tile seam, HDR/linear clipping, NaN/overflow를 reference와 비교한다.
5. seed/thread/build를 고정한 반복 hash, 장치 간 tolerance, provider version update drift를 기록한다.
6. AbortSignal 이후 cancel 전송, provider ACK, 실제 CPU/RSS 감소까지 각각 타임스탬프한다. ACK만 보내고 연산이 계속되면 실패다.
7. 8h/24h soak에서 완료/취소/timeout/crash 후 pending requests, timers, listeners, reserved bytes, process handles가 0으로 돌아오는지 확인한다.

### 초기 release gate

- descriptor/provider/license/origin/version mismatch: 100% handshake 거부
- malformed/unknown request/progress regression: 100% fatal cleanup, 성공 표시 0
- cancel ACK: interactive cancel p95 목표 250ms 이내, 미응답은 bounded timeout으로 실패
- visual quality: 각 operation class의 golden floor 통과. 성능이 빨라도 floor 미달이면 탈락
- tile seam: reference 대비 seam 전용 gate 통과, 임의 blur로 숨기지 않음
- runtime/memory: 장치 tier별 명시 예산 내 p95와 peak. 미실측은 neutral이 아니라 **quarantine**
- CSP blind gate: 동일 장치·동일 작업에서 동률 이상을 입증하기 전 “CSP 초월” 표시 금지

## fault matrix

| Fault | 기대 결과 |
| --- | --- |
| Provider binary crash / Worker error | 모든 요청 `TRANSPORT_ERROR`, 타이머·Abort listener·예약 0, port close |
| Structured clone failure | messageerror를 crash와 동일 처리 |
| Result after cancel | cancel ACK 전/후 모두 완료로 승격하지 않고 late suppression |
| Cancel ACK 누락 | `CANCEL_ACK_TIMEOUT`, 요청 회수, 다음 요청과 ID 혼합 없음 |
| Runtime 초과 | cancel 발행 후 ACK면 `RUNTIME_TIMEOUT`, 무응답이면 ACK timeout 세부 원인 보존 |
| Oversize dimensions/bytes/params/concurrency | transfer 전에 `QUOTA_EXCEEDED`, 입력 buffer 소유권 유지 |
| Wrong origin/provider/license/version/fingerprint | handshake 또는 bridge 전체 즉시 실패 |
| Malformed/extra keys/NaN progress | strict schema 실패, 조용한 무시 없음 |

실제 provider와 결과가 없으므로 visual quality와 native provider memory gate는 현재 차단 상태다.

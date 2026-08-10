# ToonStudio V12 — FormatGateway 외부 브러시 벤치마크 계획

- 기준일: 2026-08-09
- 측정 대상: container 안전성, semantic 보존률, import latency/memory, 결정성, 실제 획 품질
- 원칙: 성능 통과만으로 승격하지 않는다. 의미 보존·권리·실제 획 품질 gate를 먼저 통과해야 한다.

## 1. Corpus 계층

| 계층 | 구성 | 현재 상태 | 용도 |
| --- | --- | --- | --- |
| A — authored conformance | 코드로 생성한 SQLite SUT/SUTG, ZIP Krita bundle, PNG/KPP, MYB | 구현 완료 | 경계값, 결정성, fuzz, CI 재배포 안전성 |
| B — public/redistributable | 명시적 permissive/CC0 sample 및 upstream conformance corpus | 아직 없음 | Krita 버전/resource 다양성 |
| C — permissioned user corpus | 사용자가 명시적으로 제공한 CSP/Krita assets, 원본 재배포 금지 vault | 차단됨 | 실제 SUT/SUTG version/schema 분포, CSP 비교 |
| D — target-app references | 같은 asset을 CSP/Krita에서 열어 만든 획·썸네일·재개방 결과 | 차단됨 | 최종 visual/semantic parity |

CI에는 A와 재배포 허가가 명확한 B만 둔다. C/D는 hash·측정 결과만 저장하고 원본은 접근 제어 vault에 둔다.

## 2. 현재 자동 게이트

### 2.1 Container·보안

- Krita ZIP: truncation의 여러 cut, CRC/MD5 mismatch, path traversal, duplicate path, compression bomb, entry/size limit, missing manifest/meta, unsupported version.
- XML: DTD/entity 거부, nesting/node/attribute/text bounds, invalid UTF-8.
- SUT: opaque/truncated SQLite, page/header/schema/read-write version, source/table/column/row/text/blob bounds, invalid reader snapshot, abort.
- Pressure graph: short header, version, count, stride, reserved word, exact length, NaN/overflow/out-of-range.
- PNG extraction: signature, chunk bounds, CRC, IHDR dimensions/pixel limit, complete IEND.
- Deterministic mutation smoke: Krita ZIP 64개 one-byte mutation과 SUTG SQLite 48개 one-byte mutation을 고정 seed/offset으로 재생한다. typed hard failure 또는 원본을 포함한 bounded result만 허용한다.

### 2.2 의미·결정성

- 같은 fixture bytes → 같은 `BrushProgramIR.id`, resource order, rights, warning/unsupported order.
- ZIP stored와 deflate가 같은 semantic result를 만든다.
- SUT/SUTG DB builder가 같은 bytes를 만들고 reader가 결정적 row order를 반환한다.
- 모든 반환 프로그램은 `brushProgramIRSchema.parse`를 다시 통과한다.
- unknown metadata/column/resource/version가 구조화 issue 또는 source payload 중 하나가 아니라 **둘 다**에 보존되는지 확인한다.

### 2.3 실제 렌더 품질

`tests/format-gateway/external-brush-format-fidelity.test.ts`가 실제 `studio-hokusai-wasm`을 로드한다.

| Gate | 현재 결과 |
| --- | --- |
| SUT 5단 pressure alpha mass 단조 증가 | 통과: 1,660 → 25,146 → 86,158 → 224,580 → 560,796 |
| pressure↔alpha mass Pearson | **0.905894**, gate > 0.9 통과 |
| high/low alpha mass ratio | **337.828916×**, gate > 1.5 통과 |
| 동일 seed/input byte determinism | 모든 pressure frame SHA-256 고정, 통과 |
| Krita bundle→KPP actual render | alpha mass 169,219 / 1,700 inked px, SHA-256 `921f2b…abbdf3d`, 통과 |

이 결과는 authored curve가 BrushProgramIR와 Hokusai까지 전달된다는 vertical-slice 증거다. CSP/Krita의 원본 앱과 같다는 증거가 아니다.

## 3. 성능 측정 방법

재현 명령:

```bash
node --expose-gc --import tsx tests/format-gateway/format-import-benchmark.ts
```

- lane별 warm-up 20회, 측정 300회.
- wall latency는 전체 `import*` Promise의 시작~결과 생성까지로 source payload base64와 semantic parse를 포함한다.
- p50/p95/p99는 nearest-rank 방식이다.
- 두 lane은 한 Node process에서 순차 실행한다.
- memory는 lane 시작 강제 GC 후 `process.memoryUsage().heapUsed` 최대 증가량이다. 단일 import peak, native SQLite memory, browser Worker RSS를 뜻하지 않는다.
- raw result: `tests/format-gateway/results/external-format-import.json`.

### 3.1 현재 기준선

| Lane | Fixture | p50 | p95 | p99 | max | Peak JS heap delta/300회 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SUTG structured-partial + Node SQLite reader | 12,288B | 1.3508ms | 1.5272ms | 1.6353ms | 1.6939ms | 16,746,008B |
| Krita bundle, 모든 entry raw-DEFLATE, 2 KPP + 1 MYB + preserved pattern | 3,339B | 0.4598ms | 0.7690ms | 0.9962ms | 1.5302ms | 18,596,552B |

환경은 Apple M2 Max, macOS arm64, Node v24.16.0이다. fixture가 매우 작으므로 release SLA 판정 수치가 아니라 regression 기준선이다.

## 4. 다음 성능 matrix

| 축 | 값 |
| --- | --- |
| archive size | 4KB, 1MB, 16MB, 64MB, limit-1B, limit+1B |
| resource count | 1, 10, 100, 1,000, 2,048 |
| compression | stored, raw-DEFLATE 1/6/9, high-ratio rejection |
| SUT rows | 1, 10, 100, 1,000, 4,096 |
| BLOB | none, PNG tip, multiple material, 32MB limit |
| runtime | Chromium Worker, Firefox Worker, Safari Worker, Node reference |
| device | desktop M-series, Windows integrated GPU/CPU, iPad, Android mid-tier |

목표는 interactive Worker import p95 100ms 이하(1MB 일반 preset pack), progress/cancel 첫 반응 50ms 이하, main-thread long task 0건이다. 대형 pack은 streaming inventory와 per-resource lazy lowering으로 별도 목표를 둔다. 현재 parser가 source 전체 base64를 만드는 메모리 비용은 CAS blob reference 전환 후보로 측정한다.

## 5. Fidelity matrix

실제 permissioned corpus가 확보되면 각 preset에 아래를 실행한다.

```text
same device-calibrated InputIR
  → CSP/Krita reference render
  → imported BrushProgramIR
  → Hokusai and libmypaint candidate render
  → blind panel + numeric profiles
```

지표:

- pressure: size/alpha/ink-area correlation, quantization jump, hysteresis, low-pressure onset.
- geometry: centerline deviation, endpoint, stabilization lag.
- texture: frequency spectrum, repeat/seam, rotation/scatter distribution.
- natural media: alpha/color mass, smudge transport, edge darkening.
- semantic: mapped fields/total confirmed fields, unsupported accuracy, resource-link recall.
- visual: SSIM/PSNR는 보조. brush feel blind test가 최종 gate다.

승격 기준:

1. 확인된 field에 대한 semantic preservation 100%; 모르는 field는 unsupported recall 100%.
2. pressure correlation ≥0.95 목표, 최저 허용 0.90. 급격한 양자화 jump는 CSP reference 이하.
3. 같은 seed/input의 ToonStudio render byte determinism.
4. CSP/Krita blind panel에서 비열위; 실패 preset은 provider pin 또는 preserve-only.
5. round-trip을 주장하려면 target app 재개방이 별도 통과해야 한다.

## 6. Fuzz 계획

- mutation fuzz: 현재 PR smoke는 ZIP 64개 + SQLite 48개 deterministic mutation이다. 다음 단계에서 ZIP header/offset/size/flags, XML delimiters/entities, SQLite header, pressure graph u32/f64, PNG chunks별 10,000개로 확장한다.
- structure fuzz: manifest/reference 불일치, duplicate names, Unicode normalization collision, nested resource path.
- differential fuzz: package ZIP reader vs browser trusted inflater는 decompressed bytes/CRC만 비교한다. 의미 결과를 다른 GPL parser 코드와 differential-copy하지 않는다.
- budget: PR smoke 10,000 deterministic mutations, nightly 10분/seed 기록, release 1시간 + sanitizer native helper(도입 시).
- crash, hang, unbounded allocation, silent import가 하나라도 있으면 release blocker다.

## 7. 남은 blocker와 담당 증거

| Blocker | 상태 | 해제 조건 |
| --- | --- | --- |
| 실제 SUT/SUTG schema/version corpus 없음 | 외부 협조 필요 | 권리 확인된 여러 CSP 버전 파일 + 공식 앱 결과 |
| Krita target-app reopen 없음 | 자동화/로컬 bridge 필요 | bundle/KPP import→export→Krita reopen corpus |
| Browser SQLite Worker 반복 분포·메모리 | Chromium + Vite module Worker(dev transform) cold 2회 127.80~160.20ms와 기능/취소/격리 실패는 측정 완료 | production build에서 충분한 반복 warm/cold p50/p95/p99, peak WASM/RSS, worker chunk 크기, 1MB·128MB 크기 행렬 |
| CSP/Krita blind feel test 없음 | human lab 필요 | 같은 태블릿/입력/작업으로 평가 |
| 대형 bundle memory | 미측정 | size/count matrix + CAS payload strategy |

이 blocker가 남아 있는 동안 SUT/SUTG “완전 지원”과 CSP 비열위 상태는 `false`다.

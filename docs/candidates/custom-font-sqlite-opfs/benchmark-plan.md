# Custom font durable authority — benchmark and fault plan

## 자동화된 현재 게이트

```bash
pnpm exec vitest run \
  src/domains/creator/studio-custom-fonts.test.ts \
  src/domains/creator/studio-custom-font-sqlite-opfs-repository.test.ts \
  src/domains/creator/studio-custom-font-sqlite-opfs-product-boundary.test.ts \
  src/domains/creator/StudioCustomFontsPanel.test.tsx
NODE_OPTIONS='--max-old-space-size=8192' pnpm exec tsc -p tsconfig.json --noEmit --pretty false
pnpm exec eslint --max-warnings=0 <changed custom-font and inspector files>
```

저장소 테스트는 mock SQL이 아니라 `@sqlite.org/sqlite-wasm`의 실제 memory DB를 사용하고 OPFS만
결정적 memory filesystem으로 주입한다. 다음을 고정한다.

- SQLite close/reopen + 새 CAS store에서 원본 바이트 복구
- SQLite raw manifest에 data URL/base64/binary JSON 0건
- blob 누락 및 같은 길이 byte tamper 검출
- torn JSON, whitespace noncanonical JSON, extra field, forged total, MIME 불일치 거부
- save 3개 겹침의 호출 순서 보존
- OPFS put/get/owner protection 뒤 SQLite manifest-last 순서
- 강제 `SQLITE_FULL`에서 이전 manifest와 owner refs 복구
- 128 MiB/2 GiB/512개 및 2 MiB manifest 상한
- ambient localStorage/IndexedDB 제품 참조 0건
- stale hydration generation 차단, durable save/delete, memory-only/unavailable UI 의미

## 실제 브라우저 완료 측정

재현 명령:

```bash
pnpm exec tsx tests/benchmarks/harness/custom-font-sqlite-opfs-browser.ts
pnpm exec vitest run tests/visual/custom-font-sqlite-opfs-browser-contract.test.ts
```

Chromium 140.0.7339.186 production build의 module Dedicated Worker/OPFS SAH-pool에서 다음 corpus를
클래스별 30회 warm save + 30회 verified load했다. 시스템 폰트 바이트는 로컬 preview에서만
스트리밍하며 결과/빌드/저장소에 복사하지 않는다.

| Corpus | 작업 | 기록 |
|---|---|---|
| Arial Unicode TTF 23,278,008 B | save×30, load×30, close/reopen, FontFace.load | save 136.660/143.310/143.675 ms; load 74.300/80.000/85.130 ms; decode 33.015 ms; exact SHA |
| Songti TTC 66,933,080 B — 장치 내 128 MiB 이하 최대 | save×30, load×30, close/reopen, FontFace.load | save 383.640/396.450/399.880 ms; load 217.575/234.320/238.990 ms; decode 47.855 ms; exact SHA |
| 두 폰트 canonical manifest | 정상 close + 매번 새 Worker×30 | DB 8.795/9.555/9.770 ms; verified list 297.055/312.840/313.680 ms; 합 305.855/321.795/322.120 ms; 30/30 exact SHA |
| committed Arial Unicode entry | receipt 직후 Worker terminate + 새 Worker | terminate 호출 0.005 ms; 내부 DB+list 384.210 ms; page 관측 738.860 ms; exact SHA; 파괴적 단일 표본 |
| recovered 두 `ArrayBuffer` | FontFace + 한/일/중 Canvas2D 2회 | pixel/PNG hash 각각 byte-equal, non-white 45,247 px |

결과 JSON은 nearest-rank-ceil p50/p95/p99와 raw 표본을 모두 보관한다. save/load/정상 복구는 각
30표본이며, 강제 종료 복구는 단일 파괴 표본이라 p50/p95/p99가 같은 값임을 명시한다. 정상/장애 Worker마다
localStorage, IndexedDB, memory DB, memory CAS probe를 설치했고 전부 0이었다. missing CAS, 동일 길이
byte tamper, SQLite metadata mismatch는 `corrupt`로 fail-closed했으며 복원 뒤 exact SHA를 확인했다.

### 남은 외부·장치 게이트

- OPFS put 직후와 owner protection 직후의 정밀 process-kill 주입. 이번 자동 게이트는 SQLite commit
  영수증 직후를 실제 Worker terminate로 검증했다.
- 두 탭/두 Worker가 동시에 쓰는 Web Locks 경합의 장시간 반복, quota exhaustion, OS storage eviction.
- Safari/Firefox의 unavailable 분류와 실제 장치 메모리/long-task/512-entry 패널 탐색.
- 실제 Konva 편집 UI에서 zoom/transform을 포함한 visual diff 및 최신 CSP와의 사람 평가.

이 항목들은 현재 로컬 Chromium 증거 범위를 넘으므로 완료나 CSP parity로 표시하지 않는다.

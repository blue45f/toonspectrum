# Custom font durable authority — capability survey

기준일: 2026-08-09. 제품 대상은 기존 `/studio`의 사용자 TTF/OTF/TTC/WOFF/WOFF2 보관함이다.
품질의 단일 기준은 원본 폰트 바이트가 재인코딩 없이 보존되고, 로드 때 SHA-256으로 다시 검증된
바이트만 `FontFace`에 전달되는지다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `@sqlite.org/sqlite-wasm` 3.53.0-build1 + OPFS SHA-256 CAS | canonical metadata 질의·원자 쓰기와 대형 원본 바이트 dedupe를 분리 | Safari/Firefox SAH-pool 장치 매트릭스 미측정 | 원본 바이트 그대로, 로드마다 SHA-256 + 포맷 서명 검증; CJK 픽셀/PNG 2회 결정성 통과 | Chromium 140: 23.28 MB save 136.660/143.310/143.675 ms, load 74.300/80.000/85.130 ms; 66.93 MB TTC save 383.640/396.450/399.880 ms, load 217.575/234.320/238.990 ms; 새 Worker 복구 305.855/321.795/322.120 ms | Worker 메모리 API 미노출=`null`; page used JS 0.71 MB→185.78 MB 스냅샷(peak 아님) | production Worker JS 313,451 B + 기존 SQLite WASM 864,752 B; 폰트 바이트 번들 0 | canonical JSON byte equality, SHA-256 content address, pixel/PNG hash byte equality | Apache-2.0 (`@sqlite.org/sqlite-wasm` package manifest) | 낮음: 기존 `StudioLocalDatabase` KV + `StudioOpfsAssetStore` | 브라우저 OPFS/VFS·OTS 차이 | **제품 정본 — Chromium 실증** |
| IndexedDB blob + metadata | 브라우저 지원 범위가 넓고 blob 저장이 직접적 | 엄격 canonical manifest·다중 소비자 단일 SQL authority 부재 | 바이트 보존 가능 | 이 레인에서 미측정 | 구현별 상이 | 추가 번들 없음 | 트랜잭션 구현에 의존 | Web platform | 중간: 별도 DB·upgrade·transaction 코드 | 기존 Studio IDB 다중 authority 재발 | 명시적 legacy import/test seam만, 제품 자동 읽기 금지 |
| raw OPFS files + JSON manifest | 대형 파일 I/O 단순 | 메타데이터 질의·canonical 원장·다중 탭 writer 조정 직접 구현 필요 | 바이트 보존 가능 | 이 레인에서 미측정 | 낮음 | 추가 번들 없음 | 직접 manifest 원자성에 의존 | Web platform | 중간 | custom DB 재구현 위험 | CAS 바이트 계층으로만 사용 |
| localStorage base64/data URL | 구현이 작음 | 전문 CJK/TTC 용량, 원자성, 검증, quota 모두 부적합 | base64 해제 후 원본 가능하나 저장 실패 위험 | 조사 제외 | base64 4/3 + UTF-16/JSON 복제 | 번들 없음 | 동기 write | Web platform | 낮음 | 5 MB 전후 구현 관성·main-thread stall | **제품 역할 없음**; 명시적 구버전 import/test seam만 |

## 승인 근거

- 기존 2 MB/3 MB 제한은 localStorage 문자 쿼터에서 유래했으므로 제품 제한으로 폐기했다.
- 제품 경계는 파일 128 MiB, 합계 2 GiB, 512개다. 수십 MiB CJK TTC·다축 variable font를
  수용하면서 한 번의 `arrayBuffer()`와 FontFace decode 폭주를 유한하게 제한한다.
- SQLite에는 `id/family/fileName/format/MIME/contentHash/byteLength/createdAt`만 저장한다.
  base64, data URL, `Uint8Array` JSON은 저장하지 않는다.
- 시각 품질은 렌더러 추정치가 아니라 저장 전후 SHA-256 및 바이트 동등성으로 고정한다.

## Chromium 140 실제 제품 경로 실측

증거 원본은 `tests/benchmarks/results/custom-font-sqlite-opfs-browser.json`, 고정 계약은
`tests/visual/custom-font-sqlite-opfs-browser-contract.test.ts`다. Vite production build에서
module Dedicated Worker가 무옵션 `createStudioCustomFontSqliteOpfsRepository()`를 호출했고,
`/studio-local-v12.db`의 OPFS SAH-pool과 `toonspectrum-studio-assets` native OPFS CAS를 사용했다.

| 로컬 입력 | 크기 | SHA-256 | warm save p50/p95/p99 | verified load p50/p95/p99 |
|---|---:|---|---:|---:|
| `/System/Library/Fonts/Supplemental/Arial Unicode.ttf` | 23,278,008 B | `876af2cd4854644e7f3e7feb2f688997fdb3343c6df6693611209c9dfb47ccec` | 136.660 / 143.310 / 143.675 ms | 74.300 / 80.000 / 85.130 ms |
| `/System/Library/Fonts/Supplemental/Songti.ttc` — 이 장치에서 128 MiB 이하 최대 TTC | 66,933,080 B | `6873ac2ccab5c2e74d87d6b690f3773098dd6a6238805363a3b3567f2caf6f47` | 383.640 / 396.450 / 399.880 ms | 217.575 / 234.320 / 238.990 ms |

각 클래스마다 실제 save 30회와 repository `list()` verified load 30회를 수행했고 raw 60+60 표본을
결과 JSON에 남겼다. 모든 로드는 내부 `get(hash,{verify:true})` SHA 검증을 거쳤으며 클래스 종료 뒤
별도 SHA 계산도 일치했다. 정상 close 뒤 매번 새 Worker로 수행한 복구 30회는 DB open
8.795/9.555/9.770 ms, 검증 목록 297.055/312.840/313.680 ms, 합계
305.855/321.795/322.120 ms(p50/p95/p99)였고 전부 exact SHA였다. committed manifest 영수증 직후
Worker terminate 호출 지연은 0.005 ms였고, 새 Worker의 내부 DB+검증 목록 복구는 384.210 ms,
page 관측 전체는 738.860 ms였다. 강제 종료는 파괴적 단일 표본이므로 해당 p50/p95/p99는 모두
각 단일값과 같으며 통계적 분포로 해석하지 않는다.

복구한 `ArrayBuffer`를 그대로 `FontFace`에 전달했을 때 Arial Unicode 33.015 ms, Songti TTC
47.855 ms에 load됐다. 한글·일본어·중국어 3줄을 1400×340 sRGB canvas에 두 번 그린 결과
RGBA hash `6c496d748ba2d3af84e7e4b31306748acba4f6fba65704e54789f9291b218911`,
PNG hash `654ff4798b8c4a0d86111fd2f8c32b871a2eb7a727f1218a43691ac0fa68d063`가
각각 두 번 동일했고 non-white pixel은 45,247개였다.

우선 후보였던 `/System/Library/Fonts/Supplemental/AppleGothic.ttf` 15,255,648 B는 저장·SHA 복구에는
성공했지만 Chromium 140 OTS가 `bad table directory rangeShift` 및 `OS/2: missing required table`로
`FontFace(ArrayBuffer)`를 거부했다. 이 실패를 숨기지 않고 시각 게이트 후보에서 탈락시킨 뒤,
5–30 MiB이면서 한·중·일을 포함하고 실제 OTS decode를 통과한 Arial Unicode를 측정 corpus로 골랐다.

누락 CAS, 동일 길이 마지막 바이트 XOR 변조, canonical manifest의 `byteLength/totalBytes + 1` 세
장애 모두 partial list 없이 `StudioCustomFontRepositoryError(code="corrupt")`로 닫혔고 원본 복원 뒤
SHA가 다시 일치했다. localStorage/IndexedDB/memory SQLite/memory CAS 접근은 모든 Worker에서 0회,
console/page/network/CSP 오류도 0건이었다. 이는 이 로컬 harness의 배포 경계 증거이지 CSP 제품 대비
우위나 타 OS·브라우저 호환성 증명은 아니다.

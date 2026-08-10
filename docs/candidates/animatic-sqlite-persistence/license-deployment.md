# Animatic SQLite persistence license and deployment

## 구성과 라이선스

| Component | Deployment role | License / notice action |
| --- | --- | --- |
| SQLite / official sqlite-wasm 3.53.0-build1 | browser WASM DB, OPFS SAH-pool VFS | SQLite core는 public domain. 배포 artifact의 exact version, checksums, 생성 도구와 third-party notices/SBOM을 릴리스에 유지 |
| ToonSpectrum animatic validation/persistence | canonical JSON validation, namespace/key routing | 저장소 프로젝트 라이선스와 배포 정책 적용 |
| Chromium Web Platform OPFS/Worker | runtime capability | 브라우저 제공 API. 앱 번들에 Chromium binary를 포함하지 않음 |

이 문서는 법률 의견을 대신하지 않는다. 릴리스 SBOM과 notice generator가 실제 배포 artifact를
검사하는 것이 최종 권위다.

## Production artifact receipt

2026-08-09 standalone Vite production evidence bundle에서 source map을 제외한 주요 파일은 다음과
같았다.

| Asset | Bytes |
| --- | ---: |
| `sqlite3-*.wasm` | 864,752 |
| `sqlite3-worker1-*.js` | 210,936 |
| `sqlite3-opfs-async-proxy-*.js` | 32,289 |
| animatic benchmark Worker client | 251,115 |
| page launcher | 2,628 |

이는 제품 전체 앱의 incremental chunk 크기나 네트워크 압축 크기가 아니라 독립 evidence bundle의
실제 비압축 runtime asset 크기다. source map은 런타임 비용에서 제외한다.

## 배포 요구사항

- Secure Context.
- module Dedicated Worker.
- `navigator.storage.getDirectory`와 `FileSystemFileHandle.createSyncAccessHandle`.
- COOP `same-origin`, COEP `require-corp`, CORP `same-origin`.
- CSP에서 self script/worker와 SQLite WASM 초기화를 위한 `wasm-unsafe-eval` 허용.
- logical database filename `/studio-local-v12.db`와 SAH-pool directory
  `toonspectrum-studio-sqlite` 고정.
- cache/version 전환 시 이전 `/studio-local.db`를 자동 재개방하거나 병합하지 않음.

## 권리·데이터 경계

애니매틱 DB에는 edit-decision metadata만 저장한다. 픽셀, 영상, 음성, 원격 URL 또는 외부 창작
자산 binary를 이 namespace에 넣지 않는다. cue text와 speaker는 사용자 콘텐츠이므로 브라우저
origin storage 권한, quota, 사용자 삭제/cutover 절차의 적용을 받는다.

## 실패·fallback 정책

OPFS/SAH-pool/WASM을 사용할 수 없으면 제품 persistence는 unavailable을 반환한다. memory VFS와
localStorage로 조용히 downgrade하지 않는다. 기존 synchronous localStorage adapter는 명시적
test/embed seam이며 제품 기본 배포 경로가 아니다. `LEGACY_DATA_MIGRATION=FALSE`에 따라 이전
Studio localStorage와 이전 DB 파일은 자동 import하지 않는다.

## 유지·교체 조건

- sqlite-wasm 업데이트 시 동일 Vite production Worker corpus와 license/SBOM 검사를 다시 실행.
- DB filename, namespace, OPFS directory, migration chain 변경 시 discard inventory와 contract를 함께
  갱신.
- 다른 provider 승격에는 canonical bytes/digest exact, corruption fail-closed, close/reopen,
  diagnostics 0, raw p50/p95/p99 및 배포 권리 검토가 모두 필요.

# Asset library SQLite/OPFS license and deployment

## 구성요소

| Component | Version/source | License | Deployment role |
|---|---|---|---|
| SQLite core | `@sqlite.org/sqlite-wasm`가 제공하는 현재 workspace 핀 | Public Domain | `studio-local-v12.db` KV manifest |
| `@sqlite.org/sqlite-wasm` 배포물 | workspace lockfile 핀 | SQLite 프로젝트 배포 고지 확인 대상 | 브라우저 WASM/OPFS SAH-pool |
| OPFS, Web Locks, SubtleCrypto | 브라우저 플랫폼 | 웹 표준 API | CAS 파일, 탭 직렬화, SHA-256 |
| ToonSpectrum CAS/repository code | 저장소 소스 | 프로젝트 라이선스 | canonical manifest, 권리 원장, 검증·복구 |

새 npm 의존성은 추가하지 않았고 `package.json`과 lockfile을 수정하지 않았다. 배포 시 기존
sqlite-wasm 고지와 프로젝트 NOTICE 생성 경로를 그대로 사용한다.

## 배포 조건

- COOP/COEP 및 OPFS SAH-pool 진단이 기존 shared SQLite 런타임과 동일하게 통과해야 한다.
- `navigator.storage.getDirectory`, SubtleCrypto, Web Locks 중 durable write 필수 능력이 없으면
  localStorage/IndexedDB로 조용히 전환하지 않는다.
- 구형 `toonspectrum-studio-asset-library` IndexedDB는 제품 boot에서 자동 탐색·복사하지 않는다.
  사용자가 명시적으로 legacy import 도구를 선택한 경우에만 adapter를 생성한다.
- OPFS는 로컬 권위이지 백업이 아니다. 클라우드 업로드·암호화·계정 간 동기화를 완료로 표시하지
  않는다.

## 데이터 폐기와 보안

Manifest에는 권리 메타데이터와 로컬 식별자만 두며 비밀키·프롬프트·계정 토큰을 저장하지 않는다.
CAS 경로는 content hash만 사용해 경로 탈출을 막는다. V12 cutover의 기존 IndexedDB 폐기는 중앙
destruction inventory가 담당하며, 이 slice는 요청 범위에 따라 그 중앙 파일을 수정하지 않는다.

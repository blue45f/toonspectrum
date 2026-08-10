# Custom font durable authority — license and deployment

## 소프트웨어 라이선스

| Component | Pin/source | License | Deployment role |
|---|---|---|---|
| `@sqlite.org/sqlite-wasm` | root package exact `3.53.0-build1`; installed package manifest 실측 | Apache-2.0 | 공용 lazy SQLite runtime/OPFS SAH-pool |
| Studio OPFS filesystem/CAS | repository source | ToonSpectrum project license | SHA-256 content-addressed original font bytes |
| FontFace / OPFS / Web Locks | browser Web APIs | Web platform | verified byte activation, durable storage, writer serialization |

신규 npm dependency나 별도 native binary는 추가하지 않는다. SQLite WASM과 OPFS CAS는 이미 제품에
배포되는 공용 런타임을 재사용한다.

## 사용자 글꼴 권리

보관함은 사용자가 적법한 라이선스를 가진 글꼴을 로컬 기기에 저장·사용하는 기능이다. 저장소는
원본 파일명과 hash를 보존하지만 라이선스 권리를 추정하거나 `fsType`을 변경하지 않는다. PDF/배포
임베딩 허용 여부는 기존 `studio-canvaskit-pdf-font.ts`의 OS/2 `fsType` fail-closed 정책이 별도로
판정한다. 저장 성공을 재배포 권리 승인으로 표시하지 않는다.

## 배포 및 fallback

- 제품 기본: SQLite OPFS SAH-pool + shared OPFS SHA-CAS.
- OPFS/SQLite/Web Locks 부재: 패널이 현재 탭 memory-only임을 표시한다. localStorage/IndexedDB로
  자동 하향하지 않는다.
- 손상/미검증: 기능을 unavailable로 잠그고 부분 목록을 표시하지 않는다.
- 기존 `toonspectrum-studio-custom-fonts` localStorage 데이터는 자동 읽기·마이그레이션하지 않는다
  (`LEGACY_DATA_MIGRATION=FALSE`). 명시적 import/test 호출만 유지한다.
- destructive cutover는 중앙 V12 데이터 폐기 승인 플래그가 있는 배포에서만 수행하며 이 레인은
  별도 삭제 명령을 실행하지 않는다.

## 실측 corpus 권리 경계

2026-08-09 브라우저 gate는 이 macOS 장치에 이미 설치된 다음 파일을 로컬 입력으로만 사용했다.

| 파일 | 크기 | SHA-256 | 사용 범위 |
|---|---:|---|---|
| `/System/Library/Fonts/Supplemental/Arial Unicode.ttf` | 23,278,008 B | `876af2cd4854644e7f3e7feb2f688997fdb3343c6df6693611209c9dfb47ccec` | 5–30 MiB CJK 저장/복구/FontFace/픽셀 실측 |
| `/System/Library/Fonts/Supplemental/Songti.ttc` | 66,933,080 B | `6873ac2ccab5c2e74d87d6b690f3773098dd6a6238805363a3b3567f2caf6f47` | 이 장치의 128 MiB 이하 최대 TTC 저장/복구/FontFace/픽셀 실측 |

두 파일은 저장소, JSON 결과, sourcemap, production asset, screenshot에 복사하지 않았다. 하니스의
임시 same-origin endpoint가 실행 중인 로컬 파일을 스트리밍했고, production asset 전부의 크기와
SHA를 대조해 해당 파일이 번들되지 않았음을 테스트로 고정했다. 경로·크기·SHA·포맷만 증거에
남는다.

이 사용은 로컬 기술 검증일 뿐 Apple 또는 폰트 권리자의 재배포·웹폰트 호스팅·문서 임베딩 허가를
의미하지 않는다. 라이선스는 OS/폰트 계약에 따르며 저장 성공이나 `FontFace` decode 성공을 권리
승인으로 표시하지 않는다. 다른 개발자·CI·사용자는 자신의 장치에서 적법하게 사용 가능한 폰트를
제공해야 한다. 우선 후보 AppleGothic은 Chromium OTS가 테이블 오류로 거부했으며, 이 기술적 탈락
역시 그 파일의 라이선스 상태에 대한 판단이 아니다.

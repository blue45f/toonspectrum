# Original marketplace package-library license and deployment

## 라이선스

- `@sqlite.org/sqlite-wasm`: 공식 SQLite WASM 배포물. SQLite 본체 public domain, 패키지 고지와
  저장소의 third-party notice를 유지한다.
- OPFS/Storage Foundation API: 브라우저 플랫폼 API이며 별도 런타임 라이선스 비용이 없다.
- ToonStudio repository·canonical schema·UI wiring: 저장소 프로젝트 라이선스를 따른다.

번들 original starter asset의 CC0/출처/재배포 권한은 설치 manifest 저장 엔진의 라이선스와 별개다.
기존 package Rights BOM과 share preflight를 그대로 유지한다.

## 배포

- 기존 `/studio` lazy marketplace chunk와 공유 app-lifetime SQLite handle을 사용한다.
- 새 route, 별도 앱, 별도 DB 파일을 만들지 않는다.
- OPFS SAH-pool을 열 수 없으면 내구성 저장 완료를 표시하지 않고 오류를 표면화한다.
- V12 boot는 `toonspectrum.studio-marketplace-library.v1` localStorage key를 자동 읽거나 복사하지
  않는다(`LEGACY_DATA_MIGRATION=FALSE`).
- 운영 파괴는 기존 V12 triple gate를 통과할 때만 실행한다.

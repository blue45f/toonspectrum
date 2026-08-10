# Creator Pack SQLite 라이선스·배포

## 배포 경계

- Studio SPA에는 pack manifest와 엔진 중립 JSON만 저장한다.
- 로컬 권위는 기존 `@sqlite.org/sqlite-wasm` + OPFS SAH-pool 자산을 재사용한다.
- Creator Pack 때문에 새 native binary나 copyleft engine을 번들하지 않는다.
- G’MIC/GEGL recipe가 포함된 pack도 recipe metadata만 저장하며 실행 바이너리는 외부 격리 provider
  게이트를 별도로 통과해야 한다.

## 권리 BOM

설치 전 pack validation은 license label, publisher/provenance, package fingerprint, entry byte/runtime
budget을 검증한다. 브러시/필터가 SQL에 들어갔다는 사실은 콘텐츠 재배포 권리를 증명하지 않는다.
Marketplace 게시·팀 공유·수익화는 서버 Rights BOM과 별도 정책 게이트를 유지한다.

## 데이터 폐기

`LEGACY_DATA_MIGRATION=FALSE`이므로 기존 Studio localStorage pack marker·brush/filter 배열은 제품
부팅 입력이 아니다. V12 Creator Pack 영수증은 `studio-creator-pack-v12` namespace와
`/studio-local-v12.db`에만 기록된다. 명시적 파괴 확인 플래그가 모두 만족되면 공용
`toonspectrum-studio-sqlite` OPFS root와 함께 폐기된다.

## 교체 조건

IndexedDB 또는 다른 catalog가 동일한 canonical 보존·10k keyset·재개방·fault recovery·권리 BOM
게이트를 통과하고 p95 또는 peak memory를 20% 이상 개선할 때만 challenger로 등록한다. 구
localStorage 자동 import는 성능과 무관하게 정책상 후보가 아니다.

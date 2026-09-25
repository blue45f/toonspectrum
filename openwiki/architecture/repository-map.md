# 저장소 지도

- 상태: **현재 + 마이그레이션**
- 최종 갱신: **2026-09-26**

```text
apps/
  web/                 사용자·창작자 웹과 Web 전용 Vite 설정
  admin-web/           관리자 웹
  api/                 backend와 API 전용 Drizzle 설정
  mobile/              Capacitor Android/iOS wrapper
  desktop-sync/        로컬·클라우드 동기화
services/
  creator-inference/   선택형 GPU 추론 서비스
packages/
  contracts/           교차 앱 runtime-neutral 계약
  core/                기존 focused core
  studio-*/            Studio runtime·engine package
config/                 기계 정책과 ratchet
data/                   검토된 데이터·에셋 릴리스
apps/web/public/        Web 정적 자산
deploy/                 배포 단위
docs/architecture/     현재·목표 설계
openwiki/               탐색 보조 문서
tests/integration/      교차 애플리케이션 테스트
tools/                  비제품 authoring·automation·DCC 도구
scripts/                저장소 횡단 생성·검증
```

도메인 구현은 앱 안에서 먼저 응집한다. 실제 재사용이 증명되기 전에 `packages/domains/*`로 추출하지
않는다.

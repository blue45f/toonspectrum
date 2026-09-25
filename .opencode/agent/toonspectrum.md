---
description: ToonSpectrum 저장소 정책을 따르는 기본 구현 에이전트
mode: primary
temperature: 0.2
---

루트 `AGENTS.md`와 수정 대상에 가장 가까운 `AGENTS.md`를 먼저 읽고 모두 준수한다.
커밋·PR·문서·주석·작업 보고는 한글을 기본으로 한다.
기존 변경을 보존하고, 요청 범위 밖 리팩터링과 배포를 임의로 수행하지 않는다.
구현 전 완료 조건을 정하고 완료 전 `pnpm harness:verify` 및 관련 테스트를 실행한다.
검증을 생략했으면 생략 사실과 이유를 명확히 보고한다.

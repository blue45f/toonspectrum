# 자동화 스크립트 작업 규칙

이 디렉터리에서는 루트 `AGENTS.md`와 이 규칙을 함께 적용한다.

- 스크립트는 저장소 루트를 안정적으로 계산하고 호출 위치에 의존하지 않는다.
- 읽기 검증과 쓰기 작업을 분리하고, 쓰기 작업에는 가능한 경우 `--check` 또는 `--dry-run`을 제공한다.
- 파일 순서, locale, 시간대, 네트워크 응답에 따른 비결정성을 피한다.
- 오류는 한글로 원인과 복구 명령을 제시하고 non-zero exit code로 실패한다.
- 자격증명과 사용자 데이터를 stdout/stderr에 출력하지 않는다.
- shell 문자열 결합보다 `spawnSync`/`execFile` 인자 배열을 사용해 quoting과 injection 위험을 줄인다.
- 새 정책 스크립트에는 Node 내장 test runner 또는 기존 테스트 프레임워크 테스트를 추가한다.
- CI에 넣을 검증은 dependency 설치 전 실행 가능한지와 sparse checkout 범위를 함께 검토한다.
- 최소 검증은 관련 Node 테스트와 `pnpm harness:verify`다.

# ToonSpectrum 문서 안내

- 상태: **현재 문서 체계**
- 최종 갱신: **2026-09-26**

## 문서 권위 순서

```text
소스·테스트·manifest
  > 기계 원장과 ratchet
  > 현재 아키텍처 문서
  > 승인된 ADR
  > 역사적 보고서·감사·벤치마크
  > OpenWiki 탐색 문서
```

문서가 소스와 다르면 소스를 우선하고 문서를 즉시 갱신한다.

## 디렉터리 분류

| 경로 | 성격 | 현재 사실의 권위 여부 |
| --- | --- | --- |
| `docs/architecture/` | 현재 구조, 목표 구조, 장기 설계 | 현재 표시 문서만 권위 있음 |
| `docs/adr/` | 결정 시점의 맥락과 선택 | 결정 기록으로 권위 있음 |
| `docs/operations/`, `DEPLOY.md` | 운영·배포 정책 | 현재 표시 문서만 권위 있음 |
| `docs/engines/` | 엔진 역할·핀·품질 계약 | 생성 원장과 현재 표시 문서 우선 |
| `docs/reports/`, `docs/evidence/` | 특정 commit·실험의 증거 | 해당 시점의 증거이며 현재 구조 문서가 아님 |
| `docs/rewrite/` | 과거 재구성 감사·계획 | 역사 자료 |
| `docs/benchmarks/`, `tests/benchmarks/` | 비교 방법과 결과 | 측정 조건 안에서만 유효 |
| `openwiki/` | 빠른 탐색과 설명 | 보조 문서 |

## 현재 구조를 읽는 순서

1. [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
2. [`architecture/README.md`](architecture/README.md)
3. [`architecture/modular-monorepo-target.md`](architecture/modular-monorepo-target.md)
4. 해당 애플리케이션·패키지의 README
5. 관련 ADR과 테스트

Studio는 다음 문서를 추가로 본다.

1. [`architecture/studio-current-boundaries.md`](architecture/studio-current-boundaries.md)
2. [`engines/renderer-roles.md`](engines/renderer-roles.md) — 기계 생성 파일
3. 관련 `docs/adr/` 결정

## 문서 상태 표기

- **현재**: 소스와 테스트로 지금 검증 가능
- **마이그레이션**: 현재·레거시·목표 경로가 함께 존재
- **목표**: 아직 완료되지 않은 의도
- **역사 자료**: 특정 날짜·commit·실험을 기록하며 현재 사실을 주장하지 않음

## 작성 원칙

- 기본 언어는 한국어다.
- 명령, 식별자, API 이름, 원문 인용은 필요한 범위에서 영어를 유지한다.
- 경로는 저장소 루트 기준으로 적는다.
- 자주 변하는 수치는 원장 파일을 링크하고 산문에 중복하지 않는 것을 우선한다.
- “구현”, “검증”, “병합”, “배포”를 서로 다른 상태로 기록한다.
- 생성 파일은 직접 수정하지 않고 생성 원장을 수정한다.
- 일회성 작업 지시 프롬프트, 임시 연구 메모, 백업·복사본은 삭제한다.

## 검사

```sh
pnpm run validate:documentation
```

검사는 현재 문서의 존재, 한국어 본문, 폐기 경로, 오래된 아키텍처 경로와 내부 링크를 확인한다.
외부 vendor 문서, 법적 고지, 기계 생성 파일은 별도 예외로 관리한다.

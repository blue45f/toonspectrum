# CSP blind lab benchmark plan

## 사전 등록

- 비교 대상: 실행일의 최신 안정 Clip Studio Paint와 같은 커밋의 ToonStudio `/studio`.
- 장치: 같은 컴퓨터, 같은 디스플레이 모드, 같은 펜 태블릿·드라이버·샘플링 설정.
- 평가자: 실제 작가/필기 사용자. 평가자 ID는 안정된 가명 식별자만 사용한다.
- 범주: `inking`, `natural-media`, `comic-flow`, `animation`, `text`.
- 최소 표본: 범주별 20개 이상 응답을 기본값으로 하고, 실제 연구 전 power analysis로 상향할 수 있다. 연구 시작 뒤에는 축소하지 않는다.
- 비열위 마진: 기본 0.05. 시작 전에 고정하며 결과를 본 뒤 변경하지 않는다.

## 실행

1. 동일 참조·시간·입력 각본으로 양 제품의 결과와 외부 latency 영상을 취득한다.
2. 파일명·메타데이터·색상 프로필 등 출처 단서를 제거한 렌더 자산을 별도 sealed 저장소에 둔다.
3. 평가자별 packet만 배포하고 sealed key는 운영자가 분리 보관한다.
4. 각 과제에서 A 선호/B 선호/동률 중 하나를 반드시 기록한다. 미응답을 임의 보간하지 않는다.
5. 마지막 응답이 잠긴 뒤 key를 개봉해 하니스로 분석한다.

## 통과 기준

- 응답 집합 완전성: 누락 0, 중복 0, 미배정 0.
- 표본: 전체와 범주 5개 각각 최소 표본 충족.
- 품질: `(ToonStudio 승 + 동률×0.5) / 응답수`의 95% Wilson 하한이 각 범주와 전체에서 `0.5 - margin` 이상.
- 성능: G펜 첫 표시 p95, 1000px 브러시, 만화 30개·애니메이션 20개 동선은 외부 관측 기준으로 CSP 동률 이상. 품질 통계에 섞지 않고 병렬 gate로 기록한다.

하나라도 미달하면 CSP 게이트는 통과하지 않는다. 물리 랩이 없는 현재 상태는 **insufficient-data**다.

## 자동 재현

계약 테스트:

```bash
pnpm exec vitest run tests/benchmarks/harness/csp-blind-lab.test.ts
```

테스트는 deterministic counterbalancing, sealed-key 분리, 완전성, 통과/실패/표본 부족, tie 계산, 잘못된 연구·응답 거부를 검증한다. 실제 CSP 결과나 사람 평가를 합성하지 않는다.

운영자는 참가자 packet과 sealed key를 다음 명령으로 서로 다른 위치에 생성한다. 기존 파일은 덮어쓰지 않으며 key 파일은 `0600`으로 만든다.

```bash
pnpm exec tsx tests/benchmarks/harness/csp-blind-lab-cli.ts packet \
  --study study.json --evaluator artist-001 \
  --packet-out packet-artist-001.json --key-out sealed/key-artist-001.json

pnpm exec tsx tests/benchmarks/harness/csp-blind-lab-cli.ts analyze \
  --study study.json --keys sealed-keys.json --responses responses.json \
  --out analysis.json
```

분석 종료 코드는 pass=0, fail=1, insufficient-data=2, 입력/운영 오류=64다.

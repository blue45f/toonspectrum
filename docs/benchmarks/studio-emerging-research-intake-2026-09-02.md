# Studio 신규 제품·스타트업·논문 기능 흡수 인테이크

- 기준일: 2026-09-02
- 제품 registry: `studio-competitor-registry.json`, `studio-emerging-product-registry.json`
- 연구 registry: `studio-research-registry.json`
- 구현 큐: #557–#563

이 문서는 “이름이 비슷한 버튼”을 만드는 백로그가 아니다. 제품과 논문에서 관찰한 장점을 ToonSpectrum의 엔진·문서·History·저장·브라우저 품질 기준으로 바꾸는 인테이크다.

## 1. 신규 제품에서 흡수할 작업 방식

### 1.1 Enkava — 브라우저 로컬 우선 페인팅·벡터·애니메이션

관찰할 가치:

- 별도 설치 없이 브라우저에서 raster paint와 editable vector stroke를 한 문서에서 사용
- frame animation, onion skin, timeline을 그림 도구와 분리하지 않는 흐름
- 명시적 계정 종속보다 로컬 파일과 빠른 시작을 앞세우는 진입 방식

ToonSpectrum 적용:

- raster와 vector가 동일한 document operation·selection·history boundary를 사용
- 애니메이션 frame이 완전히 다른 편집기로 이동하지 않고 현재 페이지·레이어 상태를 유지
- OPFS authority와 self-contained archive가 로그인·네트워크 상태와 분리

품질 기준:

- 새 문서→첫 stroke까지 데스크톱 2초 이내, 모바일 3초 이내의 warm-cache 목표
- raster/vector 전환 시 선택·색·브러시 크기·zoom 상태 보존
- offline cold reload에서 마지막 committed 문서 hash 일치

### 1.2 Jitter·Lumiere·TypeFlow·Trangram — 빠른 모션과 절차적 효과

관찰할 가치:

- Jitter의 editable AI 결과와 대량 CSV 기반 variant 생성
- shader 기반 배경·효과와 component 단위 재사용
- Lumiere의 Kuwahara, glare, halation, ASCII 같은 실시간 절차적 효과
- TypeFlow의 template→텍스트 교체→실시간 preview→4K/고프레임 출력
- Trangram의 vector morph, corner rounding, boolean, trim path

ToonSpectrum 적용:

- AI 또는 template 결과를 flatten video가 아닌 editable layer·effect graph·timeline clip으로 수신
- 컷·말풍선·타이틀·효과음의 CSV/JSON variable binding과 episode variant batch
- filter graph의 preview와 export가 같은 parameter authority 사용
- vector node의 boolean·trim·morph를 keyframe 가능 속성으로 통합

품질 기준:

- effect parameter drag 중 60fps 목표, 30fps 미만이면 dynamic resolution 사용
- preview와 export 기준 프레임의 허용 오차 명시
- 1,000개 variant 생성 시 UI main thread 장기 task 방지, worker queue·cancel·resume 제공
- template 또는 AI 결과의 모든 변경을 Undo/Redo와 archive에 보존

### 1.3 Raster — 자산 variant·기본 버전·agent automation

관찰할 가치:

- 같은 자산의 여러 crop·색·format을 variant로 관리
- 어떤 variant가 기본 표시인지 명시
- 에이전트나 외부 도구가 자산을 조회·분류·변형하는 API 지향 workflow

ToonSpectrum 적용:

- 캐릭터 reference, 배경, 말풍선, 브러시, 3D capture를 하나의 asset family와 immutable revision으로 관리
- variant마다 source hash, crop, transform, color space, generator provenance 저장
- 작품 문서는 mutable URL이 아니라 exact asset revision을 참조
- agent mutation도 일반 사용자와 같은 validation·history·permission 경계 통과

품질 기준:

- default variant 교체가 기존 원고를 묵시적으로 변경하지 않음
- missing revision은 가장 가까운 파일을 추측하지 않고 복구 UI 제공
- 10,000개 자산에서 검색·필터·thumbnail virtualization 유지

### 1.4 LlamaGen·LTX Studio·Dashtoon — 동적 컷·카메라·캐릭터 연속성

관찰할 가치:

- story→panel flow, camera angle, prompt history, translation
- shot planning과 character consistency
- episode 단위 생성·검토·게시 흐름

ToonSpectrum 적용:

- panel suggestion을 절대 좌표 이미지가 아니라 panel graph와 shot metadata로 생성
- camera·lens·angle·subject blocking을 3D·perspective ruler·2D camera와 연결
- 캐릭터 reference를 style와 identity로 분리하고 source hash·승인 variant 기록
- prompt history를 단순 문자열 목록이 아니라 결과 revision과 연결

품질 기준:

- 기존 컷을 자동 덮어쓰지 않고 proposal branch에서 비교·부분 적용
- 대사·번역·말풍선 재배치 시 텍스트와 layout history 분리
- 같은 캐릭터·의상·장면의 continuity 경고가 근거 element를 직접 선택

## 2. 논문에서 흡수할 엔진 아이디어

### 2.1 Dripping Thin Films — 얇은 물감 막과 중력 흐름

핵심 개념:

- 얇은 유체 막에서 물과 안료 advection·diffusion을 분리
- 벽·경사면의 중력 흐름과 drip
- 실시간 상호작용 가능한 계산량

프로토타입:

1. CPU 결정적 2D reference solver
2. 높이·물·안료 3개 field의 tile codec
3. WebGPU compute ping-pong texture
4. tilt/gravity vector와 blow/rewet tool
5. live preview→committed state→archive round-trip

측정:

- mass drift, pigment concentration 범위, seam error
- 1K/2K/4K canvas step time
- device lost 이후 동일 checkpoint 복구
- 동일 seed·stroke·timestep 재현 오차

### 2.2 Mixwell — 날카로운 경계를 유지하는 2D 유체 브러시

핵심 개념:

- 반복 혼색으로 경계가 계속 흐려지는 문제를 reverse-drift로 보정
- resolution-independent 상태 표현
- GPU shader 기반 progressive mixing

프로토타입:

- wet paint carrier에 forward advection와 bounded reverse correction 추가
- edge preservation strength를 brush dynamics에 연결
- CPU reference와 WebGPU 결과 비교

측정:

- edge MTF·경계 폭 증가량
- 100회 왕복 혼색 후 색·질량 보존
- live/committed centroid·alpha·texture parity

### 2.3 CubicSplat·NURBS Splatting·Bézier Splatting — 고속 벡터 rasterization

핵심 개념:

- Bézier/NURBS curve를 differentiable 또는 splatting 표현으로 rasterize
- 긴 spline과 closed fill, calligraphy stroke 처리
- 오류 상한 또는 adaptive pruning으로 품질·속도 균형

프로토타입:

- 기존 vector node를 유지한 채 별도 candidate rasterizer provider 추가
- line/closed fill/calligraphy/overlap/cusp corpus
- Canvas2D/SVG reference와 pixel error 비교
- 10K/50K/100K segment benchmark

승격 기준:

- 지원 corpus의 p95 frame budget과 정해진 pixel error 모두 통과
- unsupported geometry는 실행 중 몰래 다른 provider로 재호출하지 않고 선택 전에 capability 판정
- 저장 문서는 provider 내부 splat이 아니라 canonical vector geometry를 유지

### 2.4 DiffBMP — 편집 가능한 bitmap primitive 최적화

핵심 개념:

- 하나의 flatten 결과보다 여러 bitmap primitive와 layer를 최적화
- 위치·크기·투명도·회전 같은 속성을 후편집 가능하게 유지

ToonSpectrum 적용:

- AI 생성·자동 레이아웃 결과를 independent raster primitive·mask·group으로 반환
- primitive 수와 optimization budget을 명시
- 사용자 편집이 시작된 primitive는 재최적화에서 보호

측정:

- reference reconstruction error와 primitive count
- 100/1,000 primitive selection·transform latency
- 결과 group의 Undo/Redo와 archive reload hash

### 2.5 PaintCopilot·StrokeDiff·DQ Transformer — stroke 단위 공동 창작

핵심 개념:

- 전체 그림 생성 대신 현재 stroke history에서 다음 stroke 또는 지역 continuation 제안
- 작은 데이터에서 controllable brushstroke primitive 생성
- 기존 그림과 비교하며 부족한 영역을 선택적으로 보강

ToonSpectrum 적용:

- active stroke 중에는 모델 호출 금지
- committed operation log에서 bounded context 생성
- 제안 결과는 ghost stroke set으로 표시하고 전체·부분·한 stroke 단위 승인
- 승인된 stroke만 일반 command transaction으로 문서에 기록

품질 기준:

- 취소·timeout·provider failure 시 원본과 history 불변
- 모델 응답을 DrawEl/brush operation schema로 검증
- 동일 제안의 seed·model·prompt·source hash provenance
- 제안 latency와 비용 범주를 실행 전에 표시

## 3. 실험 우선순위

### P0-A — 안정성과 기반

- #557 operation replay가 모든 신규 기능의 저장·복구 기준
- effect, vector, natural-media, AI operation의 versioned envelope
- benchmark receipt와 rollback unit

### P0-B — 사용자가 바로 체감하는 편집성

- #558 최근 stroke 재교정과 editable Smart Shape
- #559 adjustment/live-effect graph
- asset family·variant와 exact revision

### P0-C — 차별화 엔진

- #560 thin-film + reverse-drift natural media
- differentiable/splat vector candidate
- stroke-level co-creative suggestion

### P1 — 장편 제작 확장

- #561 3D surface paint와 texture export
- #562 timeline·camera·audio·animatic
- #563 structured AI layer/mask/variant
- CSV/JSON episode variant batch

## 4. 연구 프로토타입 완료 조건

논문 코드를 그대로 실행했거나 demo가 보인다는 이유만으로 제품 기능으로 세지 않는다.

1. canonical ToonSpectrum document representation
2. deterministic fixture 또는 명시적 nondeterminism provenance
3. CPU/reference 결과와 GPU/candidate 오차
4. Undo all→Redo all 결과 검증
5. save→close→cold reload
6. cancel·timeout·device lost·quota failure
7. DPR·zoom·rotation·tile boundary
8. 대형 문서와 장시간 soak
9. 사용자 UI와 접근성
10. export 결과와 rollback

이 열 가지 중 일부만 충족하면 `candidate` 또는 `experimental`로 표시하고 기본 작업 경로로 승격하지 않는다.

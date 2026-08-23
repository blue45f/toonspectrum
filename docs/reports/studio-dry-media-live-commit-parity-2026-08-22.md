# Dry-Media 라이브→커밋 잉크 패리티 결함 — 증거와 다음 단계 (2026-08-22)

## 요약

`verify:studio-brushes`의 long-brush 매트릭스가 dry-media에서
`live/released centroid drift 12.02px`(strict 임계 0.5 정규화 대비 초과)로 실패한다.
픽셀 차이를 직접 측정한 결과 이것은 **밀도 패리티 결함**이다: 화가가 그리는 동안 본
잉크의 약 31%가 릴리스(커밋) 순간 사라진다. 경계선 위치는 같다 — "그렸던 선이
얇아지는" 체감 결함이고, CSP·Procreate가 보장하는 live=commit 불변식과 정확히 어긋난다.

## 측정 (focused-1 실행, 2026-08-22)

실행: `TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media pnpm verify:studio-brushes`
(프레임: `001-dry-media/00..03`, clip 457,361 568×100, 거의 수평 루트 y≈48.5→52.5)

| 프레임 | 잉크 픽셀 | x 범위 | 무게중심 |
| --- | ---: | --- | --- |
| 01-live-pointer-down | 1,290 | 36–537 | (302.2, 50.1) |
| 02-released-immediate | 894 | 38–537 | (315.1, 50.2) |
| 03-settled-autosaved | 894 | 38–537 | (315.1, 50.2) |

- Y 무게중심 동일(±0.1px) — 드리프트는 전부 X축(획 방향)이다.
- live-only 픽셀 405개가 x=36..513 **전 구간에 균등 분포**(시작 deposit 결손이 아님).
- released-only 픽셀은 9개뿐 — 커밋이 새로 더 칠하지도 않는다.
- 평균 행 폭 live 184.3px vs released 127.7px(≈30% 감소), 최대 323 vs 217.

결론: 같은 경로, 같은 알파 계열에서 라이브 오버레이만 고밀도로 찍힌다.
settled == released이므로 오토세이브 재생은 커밋과 패리티다(재현 안정).

## 배제한 가설

1. **마크 예산 차단** — 커밋 예산(65,536)이 라이브(4,096)보다 크다. 방향이 반대라 기각.
2. **스탬프 격자 발산** — 라이브 `initialStampGrid`과 커밋 `planStudioDynamicBrushRenderBudget`
   모두 `selectStudioDynamicBrushCausalStampGrid` 순수 선택으로 강제 일치된다(주석·구현 확인).
   기각.
3. **시드 공식 불일치** — 라이브 재생(`styleFromElement`)과 커밋
   (`planStudioDynamicBrushRender`) 모두 `${element.id}:${normalized.seed}` 파생. 재생
   프레임(settled)이 커밋과 픽셀 일치하므로 재생 계약 자체는 성립한다. 기각.
4. **포인트 집합 차이** — `dynamicSourceFromElement`/`dynamicSourceMatchesElement`가
   element.points == 원본 샘플 계약을 강제한다. settled이 커밋과 일치하는 것과 함께,
   el.points 손상 가능성은 낮다. (단, 라우트가 짧아 여유 있는 검증은 아니다.)
5. **용지 표면 소스 불일치(가설 B 약화)** — StudioPage가 useEffect로
   `setStudioDocumentPaperSurface(normalize(activePage.paperSurface))` 동기화하므로
   정상 상태에서 라이브 전역 조회와 커밋 prop은 수렴한다. 페이지 스위치 직후 첫 획
   같은 경합 엣지만 남는다.
6. **팁 캐시 버전 불일치** — 커널 팁 캐시 키에 `STUDIO_DRY_MEDIA_KERNEL_TIP_VERSION`
   이 포함되어 v1→v2 전환이 두 경로에 동시 적용된다. 기각.
7. **오버레이 자체 릴리스 재계획** — 오버레이는 릴리스 시 exactPlan을 active 캔버스에
   다시 그려 settled을 만들고, 검증 비교 대상은 Konva retained 렌더다. settled==released
   는 오버레이 내부 일관성 확인일 뿐 커밋 패리티와 무관 — 비교 축이 맞음을 확인.

## 남은 유력 가설의 우선순위 갱신

1위는 C(activeDraft 분기와 prefix receipt 접수 유무) — 예산 방향이 반대라 기각했던
것과 달리, **접수(receipt) 유무**는 예산 크기와 별개로 prefix 선택을 바꾼다.
exactPlan은 `acceptedPrefixReceipt.acceptedDabsPerVariation`로 잘라 붙이고,
커밋 경로(`planStudioDynamicBrushRender`)의 receipt 발급 여부는 아직 확인 전이다.
receipt 부재 시 커밋이 더 긴 prefix(더 많은 댑)를 칠 수도 있으나 관측은 반대(커밋이
성김)이므로, 커밋이 **tipLayers/scatter 단계에서 다른 조건**으로 이어지는 지점까지
함께 대조할 것. 2위 A(활성 시드 계보), 3위 B(페이지 스위치 경합).

## 2차 세션 진전 (같은 날)

### 플래너 계약은 무죄 — 렌더 합성 계약이 유력

`studio-brush-carrier-quality.test.ts`(469행)가 이미 dry-media 레인의
라이브 segmented vs retained 마크 완전 일치를 단언하고 통과한다. 즉 **동일 입력에 대한
계획 출력은 동일**이고, 차이는 런타임 입력 불일치 또는 렌더 표면 합성에 있다.

### 새 측정: 커밋 알파가 체계적으로 0.78×

| 집단 | n | live 세기 | released 세기 |
| --- | ---: | --- | --- |
| 공통 픽셀(양쪽 모두 잉크) | 885 | 평균 31.7 | 평균 24.8 (**0.78×**) |
| 사라진 픽셀(live만) | 405 | p50 23 | — |
| 남은 픽셀(live 기준) | 885 | p50 33 | — |

사라진 픽셀은 정확히 **약한 입자**(p50 23 vs 남은 것 33)다. 커밋이 전체 알파를
~0.78×로 스케일 다운하면 약한 입자가 >8 가시 임계 아래로 떨어져 사라진다 — 관측된
"균등 밀도 손실"과 정확히 같은 부호.

### 가설 D(신규 최상위): 합성 경로 차이

- 오버레이: `drawMarksToActive`가 마크마다 `renderStudioDynamicBrushCoverageMark`
  (mark.alpha 그대로, source-over 누적)로 active 캔버스에 직접 적립, 프레젠테이션에서
  opacity 1회.
- 커밋(Konva): `renderStudioDynamicBrushCoverage` — 타일 오프스크린에 마크를 모아
  블리트 시 `globalAlpha = inherited × opacity` 1회(바운디드 플로우 v2 "최종 커버리지
  합성" 주석). 캐리어 이름 `…union-causal-group-alpha-max-v3`가 뜻하는 그룹 알파-max/
  단일 합성이 오버레이 증분 경로와 어긋나면, 겹침 스택이 살아있는 라이브가 더 짙고
  커밋이 성겨진다 — 관측과 같은 방향·규모.
- 배제 업데이트: 예산·격자·시드 공식·용지 동기화·팁 캐시는 1차 세션과 동일하게 기각
  유지. DPR은 양쪽 devicePixelRatio 사용으로 무해 판정.

### 가설 D 결정 실험 결과: **기각** (합성 경로는 무죄)

`scripts/verify-studio-dry-media-parity-probe.mts`(신규)로 동일 마크 배열 690개를
두 경로로 렌더 대조:

| 경로 | 가시 픽셀 | 평균 세기 | p50 |
| --- | ---: | --- | --- |
| A. 오버레이식 마크별 직접 적립 | 692 | 46.46 | 44 |
| B. 커밋식 renderStudioDynamicBrushCoverage 타일 합성 | 695 | 46.37 | 44 |

commonRatio 1.004, 공통 픽셀 세기비 1.001 — **합성 계약은 패리티다.**

### 남은 결론과 다음 실험

계획(기존 테스트)과 합성(이번 프로브)이 모두 무죄이므로, 차이는 **커밋 시점에
저장된 요소 입력이 라이브 소스 샘플과 다르다는 런타임 불일치**로 수렴한다:

1. **안정기(stabilizer) 스무딩** — 포인터 파이프라인이 el.points를 저장하기 전에
   평활화하면 라이브가 그린 원본 샘플과 커밋 지오메트리가 어긋나 균등 밀도 차가 난다.
   → 실험: 릴리스 직전 live source.points와 커밋된 el.points를 같은 획에서 덤프해 diff.
   (`dynamicSourceMatchesElement`는 오버레이 자체 재동기화용이지 StudioPage 저장 경로의
   보장이 아니다.)
2. **pressure/speed 채널 재수정** — 릴리스 후 압력 곡선 적용(velocity-pressure 등)으로
   채널이 바뀌면 dab 알파 분포가 달라진다. → 같은 덤프에 pressures/speeds 포함.
3. 덤프 스텝은 `verify-studio-dry-media-parity-probe.mts` 하네스에 StudioPage 마운트 +
   검증기 제스처 재사용으로 확장하는 것이 가장 빠르다(마운트 비용만 추가).

프로브 실행: `pnpm exec tsx scripts/verify-studio-dry-media-parity-probe.mts`
(결과 JSON: $(tmpdir)/toonspectrum-dry-media-parity/parity-probe-result.json)

### 3차 세션: 관찰 재해석과 접두사 안정성 실험

핵심 재해석 — settled == released가 픽셀 일치이므로 오버레이 자체의 최종
exactPlan 재획화와 Konva retained은 동일하다. 다른 것은 **증분 append로 쌓인
라이브 프레젠테이션**뿐이다. 따라서 결함 국소는 오버레이 내부의
"append 누적 ≠ 단일 exactPlan"이다.

실험(`scripts/__diag-prefix-stability.mts`, tsx 순수 실행):
causal V3 플래너에 20·40·61 샘플 부분 계획을 돌려 전체 계획과 대조 —

| 샘플 | dabCount | 전체 계획 접두사와 일치 |
| --- | ---: | --- |
| 20 | 191 | 첫 불일치 없음 |
| 40 | 476 | 첫 불일치 없음 |
| 61(전체) | 690 | — |

→ **플래너는 완전 접두사 안정**(가설 F 기각). append 시점 계획과 릴리스 시점
계획의 댑 스트림 자체는 동일하다.

### 최종 국소: append 중복 적립(세그먼트 이음매) 검증이 다음 문

남은 설명은 렌더 입력이 같아도 **append 과정에서 같은 마크가 여러 번 칠해지는
것**이다. stroke audit §2-6이 pencil/calligraphy에서 확인한 "suffix 칠이
paintedSourceSegments − 1 세그먼트까지 겹쳐 칠함" 패턴의 dry-media판일 가능성이
가장 크다 — V3 분할 획은 전체가 16세그먼트로 나뉘어 이음마다 겹침이 생기면
전 구간에 균등한 추가 밀도가 쌓인다(관측과 일치).

검증 방법(오버레이 파일이 다른 세션 WIP여서 커밋 후 진행):
1. `drawMarksToActive` 호출마다 (mark 식별자, 횟수) 카운터를 붙여 한 획의
   append 스트림에서 마크별 페인트 횟수를 집계한다.
2. exactPlan 1회 칠과 비교해 다중 칠해진 마크 비율·위치 분포를 뽑는다.
3. 수정 방향은 둘 중 하나 — (a) append 시 이미 칠한 접두사 셀을 건너뛰는
   페인트 저널, (b) §2-4 캐리어처럼 dry-media도 프레임당 전체 프리픽스 재계획·
   전면 교체(비용 O(N)/프레임, 정확도 우선).

## 재현

```bash
pnpm run build
TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media pnpm verify:studio-brushes
# 리포트: $(tmpdir)/toonspectrum-studio-brushes/long-brush-matrix-focused-1-*/long-brush-quality-report.json
```

측정 스크립트(프레임 PNG 4장 대조)는 이 문서의 표를 만든 PIL/numpy 코드 그대로
`00-baseline` 차분 >8 임계 사용.

## 4차 세션 (2026-08-23): 계획·합성 무죄의 순수 tsx 증명과 신규 최상위 가설 G

### HEAD 재현 확인

같은 절차 재실행(drift 15.19px): live 1,367px / released 955px / settled 955px,
settled==released 픽셀 일치, 공통 픽셀 세기비 0.804, live-only 416px가 x=36..503
전 구간에 균등 분포(13개 x-밴드 lost/total이 거의 비례 — 이음매 클러스터 아님).

### append 스트림 == exactPlan (tsx 순수 증명)

`scripts/__diag-drymedia-append-paint-counts.mts`(신규, 로컬)가 오버레이의 causal
append 분기를 프레임별로 충실히 재현(초기 탭·acceptedDabLimit·remainingMarks·
stampGrid 선택 포함)하고 각 프레임 plan.marks를 연결해 단일 exactPlan과 대비:

| 집단 | 수 |
| --- | ---: |
| 스트림 마크 | 960 |
| exactPlan 마크 | 960 |
| 중복 페인트 | 0 |
| 종류 불일치 | 탭 교체 5개뿐(replaceInitialTap 처리 차이) |

→ dry-media(causal 브리지 경로)의 **마크 계획은 완전 패리티**. 결합하면:
계획 무죄(이 실험) + 합성 무죄(hypothesis D 프로브, 실제 텍스처 스탬프 배열 사용)
+ 입력 무죕(settled==autosave-reload). 남는 차이는 **커밋 retained 경로의
픽셀 출력 자체**다.

### 가설 G(신규 최상위): retained 밴드/그룹 알파 클램프

StudioDrawNode의 angled-nib 밴드 합성 주석이 계약을 직접 기술한다 —
"Konva가 한 번만 적용하는 것은 겹침이 두 밴드를 합산해 넘지 못하게 **가장 깊은
밴드로 클램프**" 한다. dry-media retained 렌더도 같은 성격의 그룹 클램프
(bounded-flow v2 최종 커버리지 합성)를 거친다면, 라이브의 소스-over 누적
(겹침 스탬프 2a)와 커밋의 클램프(max a)가 겹침 픽셀에서 체계적으로 어긋나고,
스태거드 레인 스탬프가 전 구간에서 균일하게 겹치는 dry-media에서 **관측된
균일 ~0.8× 감쇠와 정확히 같은 부호**가 나온다. hypothesis D 프로브가 패리티를
낸 것은 프로브 A/B가 모두 per-mark source-over였기 때문(경로 B 타일 내부도
renderStudioDynamicBrushCoverageMark 루프)으로, 클램프는 프로브가 거치지 않은
retained 전용 합성 단계에 있을 수 있다.

결정 실험: 실제 앱에서 커밋 드로우 노드가 dry-media 요소를 그릴 때 거치는
합성 함수를 확인하고, 겹치는 스탬프 2개(동일 알파 a)를 라이브 체인과 retained
체인 각각으로 렌더해 픽셀 비 — retained가 max(a,…)를 반환하면 가설 G 확정.
수정 방향: 라이브 프레젠테이션이 같은 클램프 계약을 쓰도록 통일(손맛 우선
ADR 0010 — 커밋 쪽을 누적으로 바꾸는 것이 아니라 라이브를 커밋 계약에 맞춘다).

### 가설 G·H 기각 (같은 세션 후반)

- **G(retained 밴드 클램프)**: StudioDrawNode의 dynamicBrush sceneFunc(:1117)은
  `renderStudioDynamicBrushCoverage(context, marks, {activeDraft, opacity})`를
  호출한다 — hypothesis D 프로브 경로 B와 동일 함수·동일 옵션. 프로브가
  소스-over 패리티를 이미 보었으므로 retained 전용 클램프 단계는 없다. 기각.
- **H(별칭 지름 불일치)**: 커밋은 studioLiveBrushEffectiveDiameter(별칭 해시
  적용), 라이브 styleFromElement는 원본 strokeWidth — 그러나 실측
  `studioBrushAliasEffectiveDiameter("dry-media", 16) === 16`(해시 1.0).
  크기 채널은 양쪽 동일. 기각.

### 남는 국소 (다음 세션의 첫 실험)

계획·합성·입력·크기 채널이 모두 무죄이므로 차이는 라이브 체인의 나머지 두
단계 중 하나다:
1. **paintImmediateContact** — begin 시 exactPlan 밖 접촉 마크를 칠하는지,
   release 재획화(clear+exactPlan)로 지워지는지 확인. 시작점 국소라면 관측된
   균등 분포와 모순이므로 곧바로 기각 가능.
2. **presentActiveRect 블릿 체인** — activeCanvas→presentationCanvas drawImage의
   스케일/스무딩(DPR·imageSmoothingQuality)이 텍스처 스탬프 피크 알파를
   체계적으로 올리는지. 라이브 프레임을 presentationCanvas가 아니라
   activeCanvas에서 직접 덤프해 비교하면 즉시 분리된다(블릿이 원인이면
   active 덤프는 커밋과 일치).
덤프 방법: verify-studio-brushes 하네스에 페이지 평가 주입으로 activeCanvas
픽셀을 수집하는 것이 재현 안정적이다.

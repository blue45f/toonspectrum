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

### 5차 세션 (2026-08-24): 실제 렌더러 체인 고립 실험 — 체인 전체 무죄

`scripts/__diag-drymedia-live-chain.mts`(신규, 로컬)가 vite dev 서버 + playwright로
**실제 StudioLiveDynamicBrushOverlayRenderer**를 구동한다. 실제 요소 계약
(bounded-flow-v2 + brushDynamics 스냅샷 + 파생 시드)으로 begin→appendFrom×12→end를
먹이고, 매 프레임 activeCanvas 알파를 "동일 접두사 완전 재계획 커밋 렌더
(renderStudioDynamicBrushCoverage)"와 픽셀 비교했다:

| 프레임(샘플) | live px | commit px | 공통 세기비 |
| ---: | ---: | ---: | ---: |
| 61(최종) | 2,047 | 2,081 | 0.978 |

liveOnly/commitOnly는 가장자리 안티에일리어싱 수십 px뿐, 세기비 편차 ≤2.2%,
activeCanvas==presentationCanvas(delta 0). paintImmediateContact은
presentation 전용 시작 도트(균등 손실과 무관), WebGPU 핀은 paintModel 정의로
overlayCandidate 불가 — 함께 기각.

→ **렌더러 클래스·프레젠테이션 블릿·settle 체인 전체가 패리티다.** 관측된 30%
손실은 앱 레벨에서 이 체인에 들어가는 입력 차이다. 남는 유력 가설:
1. **용지(substrate) 소스 불일치 부활** — styleFromElement는 paper.response+
   document surface를 획 시작에 동결하고, 커밋 render-plan은 문서 종이를 다시
   읽는다. 검증기의 줌/문서 크기에서 두 종이 해상이 다른 seed/오프셋을 만들면
   스탬프 배치가 균일하게 어긋난다. 실험: 라이브 style.paper와 커밋 planInput.paper를
   같은 획에서 덤프해 diff.
2. **커밋 마크 플랜의 dynamics 원천** — StudioDrawNode의 dynamicCoverageMarkPlan이
   el.brushDynamics 어느 필드를 어떤 정규화로 쓰는지 styleFromElement 산물과
   필드별 대조(시드·폭·tipLayers).
3. 검증기 뷰포트 DPR(documentScale) 차이 — 고립 실험은 dpr=1이므로 여기서만
   발현되는 스케일 불일치 가능성. 검증기 하니스에 deviceScaleFactor 명시 주입으로
   재현 여부 확인.

### 6차 세션 (2026-08-24): 가설 1의 필드 수준 확정 — live가 paperModel을 드랍

코드 대조에서 가설 1의 구체적 비대칭을 확인했다:

- 커밋(render-plan 343-360행): `paperBrushId`를 요소 브러시에서 정하고
  `normalizeStudioPaperSubstrateModel(element.paperModel)`로 모델을 읽어
  `resolveStudioPaperBrushResponse(paperBrushId, …, { model, medium })`로 전달한다.
  `element.paperModel`이 있으면 substrate 세대가 얼린 응답이 나온다.
- 라이브(styleFromElement): `resolveStudioPaperBrushResponse(element.brush)` —
  **paperModel·medium 인자 없이** 호출한다. 요소가 paperModel을 지닌 최신 스트로크면
  라이브와 커밋의 paper 응답 자체가 달라지고, granulation catch/skip이 밀도를
  직접 변조하므로(dry-media v2 팁 계약) 전 구간 균등 밀도 차로 발현된다.

수정은 styleFromElement의 paper 응답 호출에 element.paperModel(및 파생 medium)을
같이 넘기는 한 줄 계열 — 단, 해당 파일이 타 세션 WIP여서 착수 대기 중이다.
착수 시 회귀 검증: ① 본 프로브(합성 패리티) 재실행 ② 브라우저 체인 고립 실험
재실행 ③ `TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media pnpm verify:studio-brushes`
centroid-drift 소멸.

### 문서 스케일 실험 (같은 세션)

고립 프로브의 setSurface.documentScale을 0.62/1.42로 바꾸고 커밋 렌더 컨텍스트에
동일 레이어 스케일을 부여해 재측정:

| documentScale | live px | commit px | 공통 세기비 |
| ---: | ---: | ---: | ---: |
| 1.00 | 2,047 | 2,081 | 0.978 |
| 0.62 | 758 | 906 | ~0.90 (commitOnly 161) |
| 1.42 | 2,994 | 3,019 | 0.975 |

→ **스케일 1에서만 완전 패리티**이고 비-1 스케일에서는 체계적 발산이 실재한다
(타일 경유 커밋과 직접 래스터 라이브의 재표본 계약 차이). 다만 시험한 배율에서는
발산 크기·부호가 앱 관측(live가 균일하게 ~31% 짙어짐은 아니고 commit 쪽이 더
짙거나 근접)과 정확히 일치하지 않는다 — 스케일 불일치는 실재하는 별도 품질
결함(줌에서 live/커밋 질감이 달라짐)이지만, 본 보고서의 균일 밀도 손실을
단독 설명하진 않는다.

### 다음 세션을 위한 확정 방법

고립 재현은 이제 모두 소진됐다(렌더러 체인·프레젠테이션·시드·크기·용지 원천
무죄, 스케일은 부분 요인). 남는 유일한 방법은 **실제 검증 페이지 안에서의
덤프**다: verify-studio-brushes 하니스의 dry-media 프레임 수집 시점에 페이지
평가 주입으로 (a) 동적 오버레이 activeCanvas 알파, (b) Konva 메인 레이어 픽셀,
(c) presentationCanvas를 함께 덤프해 세 표면의 관계를 앱 상태 그대로 비교한다.
어느 표면이 어느 프레임에서 갈라지는지가 곧 답이다 — 특히 released 프레임이
overlay settledCanvas인지 Konva 커밋 노드인지 라우팅을 로그로 고정하는 것이 첫 걸음.

### 6차 세션 (2026-08-24): 측정 계약 정정 — 입력 불일치 가설 복귀

verify-studio-brushes.mts 실제 코드 확인(:2706-2790):
- 제스처는 mouse.down() 뒤 **단일 mouse.move**(start→end 일발)다. 포인터 파이프라인이
  이 이벤트에서 몇 개의 소스 샘플을 el에 합성하는지가 스트로크 해상도를 결정한다.
- 프레임 02-released는 mouse.up 직후, 03-settled는 autosave 지속 확인 **뒤 같은
  페이지의 재촬영**이다. 페이지 reload가 아니다.

→ 1차 세션의 "settled == released ⇒ 오토세이브 재생(=커밋) 패리티" 추론은
성립하지 않는다. 두 프레임은 모두 커밋 표면의 동일 렌더라, 커밋 입력(el 배열)과
라이브가 소비한 샘플의 일치를 증명하지 못한다. **릴리스 시점 el.points/pressures/speeds
변형(지연 커밋 파이프라인·post-correction·리샘플링)이 최상위 가설로 복귀한다.**

라이브 오버레이는 element 배열을 직접 소비하므로(sourceSampleAt), 커밋 전 어느
시점에서든 배열이 통째로 교체되면 라이브는 옛 샘플, 커밋은 새 샘플로 그린다 —
경계는 비슷하고 밀도만 균일하게 어긋나는 관측 서명과 정확히 일치한다.

결정 실험(앱 계측 필요): 릴리스 직전 live가 소비한 points.length/마지막 샘플과
커밋된 el.points.length/내용을 한 획에서 덤프해 diff. 개발용 디버그 훅이 아직
없으므로, 동적 오버레이 렌더러에 DEV 전용 덤프 훅 추가가 다른 세션의 첫 작업이
된다(단, 이 파일에는 소스 고정 경계 테스트가 있어 수정 시 해당 테스트 동시 점검
필요 — studio-brush-catalog-lazy-boundary 등).

### 릴리스 변형 경로 정적 배제 (같은 세션)

- **지연 워커 스무딩**: planStudioDeferredStrokePostprocess가
  brushDynamics.depositPipeline이 causal인 획을 명시적으로 null 반환해 제외한다
  (studio-deferred-stroke-postprocess.ts:60-65). dry-media 미적용.
- **포인터업 직접 스무딩**: planStudioDrawPointerRelease는 postCorrection.strength>0일
  때 points를 smoothStrokePoints로 교체하지만, 기본값이 0(studio-brush-library.ts:232)이라
  검증기 기본 환경에서는 발화하지 않는다. 사용자가 후보정을 올리면 dry-media도
  라이브/커밋 갈라짐이 생기는 별개의 잠재 결함으로 기록해 둔다.
- **용지 채널 정량**: dry-media는 종이 반응 브러시(granulation 0.68)이고 문서 기본
  종이(cold-press seed 41)가 항상 존재한다. 같은 획의 paper 유무 A/B 계획 비교:
  마크 수 281 동일, 평균 알파 0.2331→0.2315(±0.7%), 키 불일치 278/281은 값 단위
  미세 변조뿐 — 균일 밀도 손실 요인이 아니며, 라이브·커밋이 같은 문서 종이 전역을
  읽으므로 양변 동일 적용이다.

### paperModel 수정 시도의 A/B 결과 (같은 세션)

styleFromElement에 element.paperModel(contact-tooth-v2)+medium을 전달하도록 수정하면
라이브 응답 granulation이 0.683→0.95로 커밋과 일치한다(실측). 그러나 그 상태에서
`TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media`의 **짧은 획 매트릭스가 새로 실패**한다
("fast short stroke produced no visible pixels", changedPixels 1/4392). 동일 빌드에서
해당 수정만 되돌리면 단획은 통과하고 장획 드리프트 15.48px로 회귀한다.

→ paperModel 정합화 자체는 방향이 맞지만, 556c1619가 전역으로 만든 커널 팁 가시성
하한(모든 dab에 min size 2.2)과 granulation 0.95의 catch/skip이 짧은 획에서 상호작용해
커밋 잉크를 잃는다. 두 변경은 **함께** 재설계되어야 한다: (a) substrate 응답 정합화 +
(b) 가시성 하한의 granulation 상호작용 점검(하한이 스킵된 dab 보상 여부). 개별 착수 금지.

### 7차 세션 (2026-08-24): 잔여 드리프트의 강도 전달 프로파일

paperModel 정합화 커밋(264e2c06) 이후 최신 리포트(1787509859249) 프레임을 픽셀 대조:

| 집단 | 수치 |
| --- | --- |
| liveToReleased energyRatio | 0.613 |
| centerlineDrift | 0.077px (형상 동일) |
| common 픽셀 비율 평균/중앙 | 0.832 / 0.857 |
| 약한 픽셀(L 8–15) 비율 | **1.014** |
| 강한 픽셀(L 40–70) 비율 | **0.769** |
| liveOnly / releasedOnly | 435 / 13 |

→ 스칼라 감쇠가 아니라 **강도 의존 압축**: 겹침이 쌓여 어두운 코어는 커밋에서
~0.77×로 눌리고, 홀로 있는 약한 스탬프는 1:1 보존된다. 입력·지오메트리·이중
렌더(동적 오버레이 활성 시 draft store 억제 확인)는 모두 무죄이며, 채널 2는
**겹침 스택에 대한 커밋 측 강도 전달 곡선**으로 국소화된다. 다음 실험: 겹치는
스탬프 쌍(동일 알파 a×2)을 라이브 체인과 Konva 커밋 체인으로 각각 렌더해
a별 출력 곡선을 산출 — 곡선이 위 프로파일(약한 값 보존, 강한 값 압축)과 일치하면
커밋 합성의 알파 상한(타일 blit 전후 8-bit 프리멀티 처리 또는 Konva 레이어
합성 단계)을 수정한다.

### 8차 세션 (2026-08-24): 채널 2 루트 원인 확정 — 비-1× 배율에서 커밋 타일 에너지 소실

검증기에 캔버스 덤프 훅(TOONSPECTRUM_LONG_BRUSH_CANVAS_DUMP=1)을 추가해 실제 페이지의
모든 캔버스를 라이브/릴리스 시점에 포착했다:

| 캔버스 | cls | live 잉크(px) | released 잉크(px) |
| --- | --- | ---: | ---: |
| 09 | hidden(activeCanvas) | 1,515 | 0 |
| 10 | pointer-events-none z-[11](presentation) | 1,481 (09의 0.92×=요소 불투명도) | 0 |
| 02 | konvajs-content(메인) | 0 | 799 |

라이브 잉크는 전부 오버레이 두 표면 위에 있고 릴리스와 함께 사라지며, 커밋은 별도
표면에 훨씬 적게 나타난다. 순수 함수 실험(scripts/__diag-overlap-transfer*)으로
원인을 고정했다:

- 동일 마크 배열: 누적 체인과 커밋 타일 체인의 총 알파 에너지는 **1× 배율에서 완전
  동일**(sumAlpha 216 == 216) — 캐시/스트리밍 변형도 무차이.
- 목적지 컨텍스트를 0.8배로 두면 커밋 타일 체인의 sumAlpha가 **81로 −62%**, 잉크
  픽셀 9→6. 앱 관측 energyRatio 0.613과 부호·크기가 일치한다.

→ 커밋 bounded-flow 타일 파이프라인은 줌(fit-scale)≠1인 문서에서 타일을 저해상도로
래스터한 뒤 리샘플하며 텍스처 스탬프 피크를 무너뜨린다(candidateScales 주석의
"alpha unchanged across candidates" 가정은 텍스처 스탬프에서 성립하지 않음).
ADR 0010 품질 우선 계약에 따라 수정은 커널 텍스처 캐리어의 타일 래스터 스케일을
목적지 물리 해상도(최소 1×)에 고정하는 것 — 다음 세션의 첫 패치.

### 9차 세션 (2026-08-24): 스케일 하한 수정과 모듈 패리티 재확인

- candidateScales 하한을 0.75→1로 올렸다(텍스처 스탬프는 타일 래스터 한 번 리샘플만
  허용, ADR 0010). 대응 테스트를 새 계약으로 갱신. 드리프트는 12.69px로 유지 —
  검증기 실측상 문서 줌은 ≈1(릴리즈 캔버스 획 길이 498px ↔ 아트보드 568 단위,
  y-extent 5px = 기본 폭 7)이라 이 경로는 이번 결함의 축이 아니었다. 다만 줌 아웃
  문서의 품질 회귀는 여전히 실재하며 수정은 유효(0.8×에서 sumAlpha −45% 재확인).
- 폭 7 실조건 모듈 실험: 전체 계획 sumAlpha 16,159 세 체인 동일, 마크별 단독
  렌더 24개 불일치 0 — **계획·순수 렌더 함수는 완전 패리티**.
- 남는 앱 측 차이 후보는 커밋 경로의 stampGrid/예산 산출(라이브 initialStampGrid은
  시작 시 고정, 커밋 renderBudget은 최종 dab 수로 재계산)과 Konva 합성 단계.
  다음 실험: 검증기 요소로 planStudioDynamicBrushRender의 renderBudget.stampGrid와
  라이브 initialStampGrid 값을 덤프해 대조한다.

### 10차 세션 (2026-08-24): 정렬 프레임 프로파일 — 커밋은 강도 단조 압축

그리드 가설 기각(liveGrid==commitGrid==3, maxDabs 632 여유). 덤프된 09(activeCanvas)와
02(Konva 메인)를 잉크 무게중심으로 정렬해 같은 프레임에서 대비:

| live 알파 밴드 | n | commit/live 비율 |
| --- | ---: | ---: |
| 8–20 | 97 | **1.529** |
| 20–50 | 321 | 0.827 |
| 50–120 | 659 | 0.646 |
| 120–256 | 34 | **0.584** |

전체 both 1,111 / onlyLive 434 / onlyCommit 47. 커밋 출력이 라이브 강도의
단조 증가 함수로 압축된다(약한 픽셀은 오히려 상향 평활). 이는 (a) 커밋이 마크를
더 작거나 흐리게 계획하거나 (b) Konva 합성/레이어 단계에서 소프트니가 걸린다는
뜻이다. 모듈 수준에서는 동일 함수가 패리티이므로 (b)의 Konva 컨텍스트 래핑
(context._context getTransform 경로) 또는 레이어 pixelRatio/스케일 상호작용이
최우선 조사 대상이다. 다음 세션 첫 실험: 검증기 페이지에서 Konva stage
pixelRatio와 layer scale을 덤프하고, RecordingDestination 목 mock에 실제
Konva 컨텍스트 변환을 주입해 renderStudioDynamicBrushCoverage 곡선을 재현한다.

### 단획 간헐 실패의 메커니즘 (같은 세션)

"fast short stroke produced no visible pixels"(changedPixels 1–2/4392)이 실행마다
발/복구된다. 원인 모델: 폭 7 · contact-tooth granulation 0.95에서 짧은 획의 소수
dab이 산란 시드(획 id 파생)에 따라 종이 스킵 구간에 몰리면 mark.alpha가 전부
가시 임계 아래로 떨어진다. STUDIO_KERNEL_TIP_MIN_VISIBLE_SIZE 크기 하한은
알파 스킵을 막지 못한다.

수정 제약: 이 계층은 "기존 문서 픽셀 불변" 계약(studio-dynamic-brush-coverage-renderer
:1262 주석)이 있어 multiplier 클램프를 무버전으로 넣으면 저장 문서 재생이 바뀐다.
따라서 커널 팁용 버전 정책(예: paper alpha floor 0.35를 포함한 contact-tooth v2 프로그램
핀)으로 넣는 것이 올바른 경로다. 부수 관찰: 덤프 매니페스트에 rect/dpr 캡처를 추가했으나
단획 조기 종료 시 long 매트릭스 덤프와 함께 볼 수 없으므로, 단획 경로에도 동일 덤프가
필요하다(이번 실행부터 short-invisible 덤프는 이미 추가돼 있다).

### 단획 실피 재정성 (같은 세션, 후속)

캔버스 덤프 반증: short-live 덤프에서 오버레이 표면(09/10)에 잉크가 전혀 없고,
short-invisible 덤프에서도 커밋 표면이 비어 있다. changedPixels 1–5는 안티에일리어싱
노이즈다. 즉 간헐 렌더 실패가 아니라 **dry-media 탭(무이동 접촉)이 커밋에서 준무효인
상수 결함**이며, 검증기 임계(hasMeaningfulPixelChange) 근처에서 합격/실패가 갈렸던 것.
paper-gain 플로어는 방향은 맞지만 이 결함의 축이 아니다(플로어 후에도 재현).

수정 대상: 탭 단일 스테이션 계획에서 커널 팁 마크의 침착 알파/크기가 가시 임계 미만이
되는 경로 — paintImmediateContact은 프레젠테이션 전용이라 릴리스와 함께 사라진다는
점도 함께 다뤄야 한다(커밋 탭 가시성 보장 필요).
### 탭 알파 하한 검증 (같은 세션)
0f036b9a(커널 팁 가시 알파 하한 0.12) 적용 후 focused verifier: 단획 매트릭스 통과,
데스크톱 select/paint/undo/redo 통과. 저장 문서의 탭이 더 이상 사라지지 않는다.
장획 드리프트 13.02px(분산 11.91–15.23 내) — 채널 2(Konva 합성 소프트니)는 별도 과제로
§10차 세션 절차대로 진행한다.

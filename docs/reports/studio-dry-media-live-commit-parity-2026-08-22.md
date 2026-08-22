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

### 다음 실험 (3차 세션 첫 작업)

1. 결정 실험: 동일 마크 배열을 (a) 마크별 직접 적립, (b)
   `renderStudioDynamicBrushCoverage` 타일 경로로 각각 렌더해 픽셀 회수·세기 분포 비교.
   브라우저 캔버스 필요 — `verify-studio-brushes.mts` 하네스에 프로브 페이지로 얹거나
   `scripts/studio-gpu-committed-parity-browser.ts` 패턴 재사용.
2. 1에서 재현되면 수정은 오버레이 active 합성을 커밋 타일 합성과 동일 계약으로 통일
   (`renderStudioDynamicBrushCoverage(activeDraft:true)` 경로로 옮기는 것 포함 검토).
3. 이후 `TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media pnpm verify:studio-brushes` 재실행으로
   centroid-drift 소멸 확인.

## 재현

```bash
pnpm run build
TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media pnpm verify:studio-brushes
# 리포트: $(tmpdir)/toonspectrum-studio-brushes/long-brush-matrix-focused-1-*/long-brush-quality-report.json
```

측정 스크립트(프레임 PNG 4장 대조)는 이 문서의 표를 만든 PIL/numpy 코드 그대로
`00-baseline` 차분 >8 임계 사용.

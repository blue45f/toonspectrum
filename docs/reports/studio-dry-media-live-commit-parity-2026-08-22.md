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

## 남은 유력 가설 상세

A. **활성 스트로크 시드 계보** — pointer-down 부착 시드와 릴리스 재계산 시드 비교 로그가 1차 실험.

B. **용지 표면 소스 불일치** — 페이지 스위치 직후 첫 획의 전역/prop 경합만 잔여 가능성.
   같은 페이지에서 두 값 덤프·diff가 2차 실험.

C. **activeDraft 분기 누수** — exactPlan의 acceptedPrefixReceipt와 커밋 경로의
   접수 유무 대조. receipt 부재 시 prefix 선택이 달라지는 지점 추적.

## 재현

```bash
pnpm run build
TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media pnpm verify:studio-brushes
# 리포트: $(tmpdir)/toonspectrum-studio-brushes/long-brush-matrix-focused-1-*/long-brush-quality-report.json
```

측정 스크립트(프레임 PNG 4장 대조)는 이 문서의 표를 만든 PIL/numpy 코드 그대로
`00-baseline` 차분 >8 임계 사용.

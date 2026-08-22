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

## 남은 유력 가설 (다음 세션 첫 작업)

A. **활성 스트로크 시드 계보** — 포인터다운에서 태어나는 detached 스타일의 seed가
   릴리스 후 `${element.id}:${dynamics.seed}` 재계산값과 다르면, 라이브 동안 본
   흩뿌림 패턴과 커밋 패턴이 달라져 "균등한 밀도 차"로 관측될 수 있다.
   → pointer-down 부착 지점에서 seed를 로그로 남겨 릴리스 값과 비교하는 것이 1차 실험.

B. **용지 표면 소스 불일치** — 라이브는 `resolveStudioDocumentPaperSurface()`,
   커밋은 `normalizeStudioPaperSurfaceSettings(activePage.paperSurface)`(viewport prop).
   dry-media v2 팁의 catch/skip 변조는 용지 응답에 의해 밀도를 직접 바꾼다
   (docs/brush-texture-competitive-analysis-2026-08-22.md §4). 두 소스가 한 점이라도
   어긋나면 전 구간 균등 밀도 차가 나온다.
   → 두 값을 같은 페이지에서 덤프해 diff 하는 것이 2차 실험.

C. **activeDraft 분기 누수** — `STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET`은
   `planStudioDynamicBrushRender(el, id, activeDraft=true)` 경로에만 적용된다.
   릴리스 직후 같은 요소가 activeDraft=false로 재계획되며 prefix receipt 없이
   다른 prefix가 남을 가능성. exactPlan의 acceptedPrefixReceipt와 커밋 쪽 접수
   유무를 대조할 것.

## 재현

```bash
pnpm run build
TOONSPECTRUM_BRUSH_VERIFY_IDS=dry-media pnpm verify:studio-brushes
# 리포트: $(tmpdir)/toonspectrum-studio-brushes/long-brush-matrix-focused-1-*/long-brush-quality-report.json
```

측정 스크립트(프레임 PNG 4장 대조)는 이 문서의 표를 만든 PIL/numpy 코드 그대로
`00-baseline` 차분 >8 임계 사용.

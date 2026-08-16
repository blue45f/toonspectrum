/**
 * V17.1 quarantine ledger — picker-exposure removal for presets the owner judged low-quality or
 * de-facto duplicates AFTER an in-group alternative was verified (사용자 지시: 그룹 내 대안이 있는
 * 저품질/중복만 제거하되, 제거가 기존 문서를 깨서는 절대 안 된다).
 *
 * Deliberately a leaf module with ZERO imports. The lazy catalogue boundary
 * (`studio-brush-catalog.ts`) filters its default listing on this set while the governance
 * manifest (`studio-brush-variant-group-manifest.ts`) re-exports it as the `quarantined`
 * lifecycle stage and fail-fasts when an entry loses its catalogue row or runtime contract.
 * Keeping the data here breaks the would-be cycle catalogue → manifest → catalogue.
 *
 * Quarantine removes EXPOSURE only (`USED_PRESET_DATA_PRESERVED`):
 * - persisted strokes keep replaying byte-identically — the id stays in `BRUSH_PRESETS`, keeps
 *   its full runtime contract, and must never converge to the pen safe-fallback (지침 3),
 * - `studioBrushCatalogItemById` keeps resolving the id for saved documents and favorites,
 * - no "숨김 포함" affordance exists today, so quarantined ids simply do not appear in any
 *   picker listing or search until they are delisted here.
 */

/**
 * One-line, owner-auditable reason per quarantined preset id — an entry without a reason is a
 * governance bug, so the id list itself is derived from this record.
 */
export const STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID: Readonly<Record<string, string>> =
  Object.freeze({
    // 2026-08-13 wave 3, workstream M §2 duplicate audit: the lane row declares engineVariant
    // "star-dust", but both durable renderers (StudioDrawNode / studio-svg-export) branch glitter
    // modes by exact id string, so this id actually paints the DEFAULT glitter mode — the lane
    // label is not real at paint time (지침 6 honesty) and the preset is a de-facto glitter
    // duplicate. Canvas and SVG agree with each other, so replay stays consistent (지침 5).
    // Reinstatement path: make the glitter dispatch honour the lane's declared engineVariant
    // behind an explicit program pin (지침 4 byte-identity), then delist the id here.
    // 2026-08-14 브러시 품질 웨이브: 이 프리셋은 카탈로그에 preview "soft"(연속 캐리어)로 선언돼
    // 있고 spacingRatio 0.08 / hardness 0.04 로 촘촘히 겹치도록 저작됐는데, 실측은 그 선언과
    // 어긋납니다 — long-route 품질 계측에서 edgePeriodicityScore 0.85, edgePeriodPx 7 로 눈에
    // 보이는 주기적 능선이 남습니다(전체 164개 중 실패 2건에 포함). 같은 stamp family 의
    // pencil--stamp-grain·watercolor--edge-stamp·gouache--flat-stamp 와 같은 airbrush 계열의
    // spray--equal-area·splatter--burst-cloud·ink-particle--scatter-cloud 는 모두 동일 기준을
    // 통과하므로 그룹 내 대안이 충분합니다(지침: 품질이 안 나오고 대체 브러시군이 있으면 제거).
    // 복귀 경로: 스탬프 간격이 저작값대로 적용되도록 고쳐 edgePeriodicity 가 연속 기준을 통과하면
    // 여기서 delist 합니다. 그때까지 저장된 문서는 계속 원래대로 재생됩니다.
    "airbrush--stamp-soft":
      "preview \"soft\"(연속)로 선언됐지만 실측 edgePeriodicityScore 0.85 · period 7px 로 주기적 "
      + "능선이 보이는 품질 미달 — 같은 family 의 통과 대안이 다수 존재(지침 6).",
    "glitter--star-field":
      "선언된 engineVariant(star-dust)가 페인트 시점에 실재하지 않아 기본 glitter 모드로 그려지는 "
      + "사실상 중복 — 실제 star-dust 모드를 가진 star-dust와 기본 glitter가 그룹 내 대안(지침 6).",
    // 2026-08-16 wave 4 duplicate confirm: 아래 두 프리셋은 레인 카탈로그에서 각각
    // engineVariant/profile 변형("side-shade" · causal-ink "round")을 선언하지만, 레인
    // 카탈로그(선언)와 아이콘 매핑(studio-brush-icons.ts) 밖에서 이 id·변형으로 분기하는 렌더러가
    // 하나도 없습니다(grep 근거). 그래서 페인트 시점에는 베이스 매체를 그대로 칠합니다 — 선언과
    // 실재가 어긋나는 정직성 위반(지침 6)이자 사실상 중복입니다.
    // 실측(tests/benchmarks/results/brush-duplicate-confirm.json, 폭 정규화 후 5개 서브픽셀
    // 시프트 최적 정합의 픽셀 |차이| p95): pencil--side-shade↔pencil 0.00000,
    // gpen--causal-round↔gpen--croquis-capsule 0.00014. 두 프리셋은 각각 pencil-path 와
    // causal-ink 캐리어에 있어, angled-nib 캐리어에 최근 들어온 압력 변경과 무관합니다.
    // (marker--chisel-ribbon 은 같은 감사에서 후보였지만 제외했습니다 — angled-nib 캐리어가
    // 스트로크 내부까지 압력을 전달하게 바뀐 뒤 base brush 와 육안으로 구분되므로 그 중복 근거는
    // 더 이상 참이 아니고, 남은 문제는 "압력 모델 미채택"이라 옵트인이 해법입니다.)
    // 복귀 경로: 선언한 변형을 렌더러가 실제로 분기해 베이스와 다른 그림을 그리게 만든 뒤
    // (지침 4 byte-identity 핀 포함) 여기서 delist 합니다. 그때까지 저장된 문서는 원래대로 재생됩니다.
    // 2026-08-16, RETRACTED: pencil--side-shade was quarantined here as a de-facto duplicate of
    // pencil on a measured p95 of 0.00000, and that measurement was wrong. The duplicate probe
    // built its elements without the pins the app applies at pointer-down — brushDynamics, the
    // draw mode and materialPressureModel — so studio-svg-export stripped them and BOTH brushes
    // were compared on the pre-rollout fixed-width route that no artist can reach. Re-measured
    // with the pins in place, the pair is not a duplicate candidate at all: its nearest surviving
    // candidate is web-pressure-flat at p95 0.53074. Delisting a brush for a resemblance it does
    // not have is worse than leaving a weak variant listed, so it is listed again.
    // 2026-08-16 diameter-hash audit. Every id containing "--" has its rendered diameter multiplied
    // by a checksum of its own name (studio-brush-alias-profile.ts), spreading 71 presets over
    // 0.848-1.337. Neutralising that multiplier and re-rendering every preset from identical
    // geometry makes five declared variants BYTE-IDENTICAL to their canonical — stronger evidence
    // than the width-normalised pixel probe, because nothing is normalised away. The two listed
    // here are separated from their canonical by NOTHING BUT that hash, which is a size offset and
    // not the behaviour they advertise. pen--croquis-stabilized is a third, but its declared
    // variant (croquis-capsule-pulled-string) is a real INPUT-stage stabilizer that a fixed-
    // geometry render cannot show, so it is not a dead lane and is not listed.
    "marker--chisel-ribbon":
      "선언된 profileVariant(angled-ribbon/minus-30deg)로 분기하는 렌더러가 없습니다 — 지름 해시를 "
      + "빼면 동일 기하에서 canonical(brush)과 바이트 동일한 SVG가 나오므로, 둘을 가르는 것은 "
      + "각진 리본이 아니라 id 체크섬에서 나온 크기 차이뿐입니다. 남는 대안: brush · flat-brush "
      + "· chisel-highlighter(지침 6).",
    "screentone--sparse-grid":
      "선언된 engineVariant(성긴 격자)로 분기하는 렌더러가 없습니다 — 지름 해시를 빼면 동일 "
      + "기하에서 canonical(screentone)과 바이트 동일합니다. 남는 대안: screentone · crosshatch(지침 6).",
    "gpen--causal-round":
      "causal-ink \"round\" 프로파일 변형을 선언하지만 분기하는 렌더러가 없어 같은 레인의 "
      + "gpen--croquis-capsule 과 같은 그림 — 폭 정규화 픽셀 p95 0.00014. 그룹 내 대안 gpen · "
      + "gpen--croquis-capsule 이 노출 상태(지침 6).",
    // 2026-08-16 wave 5, 구조적 약속 감사. 아래 다섯 id 는 이름과 engineVariant 로 "두 번째 마크"
    // (방사 광선 · 이중 레일 · 교차 해칭 · 평행 가닥 · 타일 격자)를 약속합니다. 그 약속을 구현한
    // 코드는 studio-web-drawing-{assist,coloring,competitive}-kit.ts 뿐이고, 거기로 가는 유일한
    // 다리(studio-web-drawing-stroke-bridge.ts → planStudioWebDrawingDynamicDabs)는 도달 불가
    // 상태입니다: 유일한 호출부가 studio-live-dynamic-brush-overlay.ts:1816 인데 exactPlan() 은
    // causal 분기에서 그보다 먼저 return 하고, 28개 web-*/sketchpad-* 프리셋이 전부
    // depositPipeline "causal-deposit-v3-segmented" 로 정규화됩니다(28/28 실측). 커밋 Konva 경로와
    // SVG export 경로에는 그 다리가 아예 없습니다. 그래서 선언과 페인트가 어긋납니다(지침 6).
    //
    // 판정은 브라우저(Chromium/playwright)에서 했고 resvg 는 쓰지 않았습니다. 숫자는 전부
    // tests/benchmarks/harness/brush-interior-tone-probe.ts 가 구운 cell-<id>.svg 에서 뽑았습니다
    // (TONE_PROBE_WRITE_SVG=1, strokeWidth 16) — 이 프로브만 앱이 포인터 다운에서 찍는
    // brushDynamics · drawMode · materialPressureModel 를 그대로 핀하므로, 핀 없는 프로브가 다른
    // 캐리어를 재서 생긴 과거의 오진을 반복하지 않습니다. "댑"은 그 SVG 의 <use> 수와 그 폭/높이
    // 평균입니다. 후보와 대안을 모두 같은 방식으로 굽고 확대해 눈으로 확인했습니다.
    //
    // 아래 대상이 아닌 web-* 후보를 왜 남겼는지도 함께 기록합니다(같은 감사에서 검토):
    // - web-lazy-ink 는 "smooth"(입력단 평활화)라 고정 지오메트리 렌더가 보여줄 수 없는 종류의
    //   변형입니다 — pen--croquis-stabilized 를 남긴 것과 같은 이유.
    // - web-zigzag-edge 는 확대에서 실루엣이 실제로 완만하게 물결칩니다. 진폭이 약할 뿐 "없다"가
    //   아니라, 정도의 문제라 제거 근거로는 약합니다.
    // - web-cel-flat / web-pressure-flat 은 약속 자체가 "평평한 블록 / 균일폭"이고 그대로 칠합니다.
    // - web-mirror-ink · web-kaleido-ink · sketchpad-mirror 는 studio-brush-intrinsic-symmetry.ts
    //   가 실제 두 번째 마크를 냅니다. 이 프로브는 symmetry 를 요소에 심지 않으므로 셀에서는 한 줄로
    //   보이는데, 그건 프로브의 한계지 브러시의 결함이 아니라서 후보에서 제외했습니다.
    // 복귀 경로(공통): 다리를 살려 선언한 구조를 실제로 그리게 만든 뒤 여기서 delist 합니다.
    // 그때까지 저장된 문서는 계속 원래대로 재생됩니다(노출만 제거).
    "web-cross-hatch-pen":
      "선언한 교차(X) 해칭이 페인트에 없습니다 — 구워진 91개 댑의 회전이 42.0~48.0°(평균 45.06°) "
      + "한 로브뿐이라 두 번째 방향이 아예 없고, 같은 팁(#sbt1)·같은 alpha-map 캐리어를 쓰는 "
      + "web-hatch-color(84댑, 41.3~48.8°, 평균 44.82°)와 댑 종횡비(3.33 대 2.86)만 다른 사실상 "
      + "중복입니다. 남는 대안: web-hatch-color · crosshatch(436개 원을 3열 격자로 실제로 그림)(지침 6).",
    "web-contour-double":
      "선언한 이중 윤곽(두 레일)이 없습니다 — 10.6배 확대에서 한 줄 리본이고 700개 댑이 전부 "
      + "종횡비 1.18 로 한 축에만 놓입니다(interiorPx 141409 · distinctTones 56 · toneSd 1.237, "
      + "실루엣 IoU 0.878 대 web-lazy-ink). 남는 대안: web-cel-flat(선명한 플랫 블록) · "
      + "web-pressure-flat(균일폭 15.92) · pen(지침 6).",
    "web-radial-burst":
      "선언한 방사 광선이 없습니다 — 94개 댑이 전부 경로를 따라 눕는 납작한 타원(종횡비 2.86)이고 "
      + "밖으로 뻗는 줄기가 한 개도 없으며, 16px 촉에서 widthMean 5.57(촉의 35%)로 이 묶음에서 가장 "
      + "약한 자국입니다. 남는 대안: glitter(원+마름모 스파클) · glow(실제 헤일로) · "
      + "web-multi-agent · web-soft-cloud(지침 6).",
    "web-fur-strand":
      "선언한 평행 가닥이 없습니다 — 381개 댑(종횡비 2.22)이 한 축 위에서 겹쳐 한 줄 애벌레가 될 뿐, "
      + "9배 확대에서도 갈라진 가닥이 없습니다(interiorPx 86963 · widthMean 9.84). 남는 대안: "
      + "web-scatter-stamp(456댑을 축 밖으로 실제로 흩뿌림) · web-multi-agent(2091댑 군집)(지침 6).",
    "sketchpad-tile":
      "선언한 타일 격자가 없습니다 — 원형 댑(종횡비 1.09) 81개가 한 줄로 놓일 뿐 격자가 아니고, 같은 "
      + "texture 그룹의 web-dot-tone(70댑, 종횡비 1.00)과 같은 그림입니다. 남는 대안: web-dot-tone · "
      + "crosshatch(436개 원을 3열 격자로 실제로 그림) · ink-particle(지침 6).",
  });

/** Frozen quarantine set consumed by the catalogue listing filter and the lifecycle resolver. */
export const STUDIO_BRUSH_QUARANTINED_PRESET_IDS: readonly string[] = Object.freeze(
  Object.keys(STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID),
);

const QUARANTINED_PRESET_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_BRUSH_QUARANTINED_PRESET_IDS,
);

export function isStudioBrushQuarantinedPresetId(brushId: unknown): boolean {
  return typeof brushId === "string" && QUARANTINED_PRESET_ID_SET.has(brushId);
}

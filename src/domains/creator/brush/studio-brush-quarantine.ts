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
    // pencil-grain·wash-brush·ink-brush 와 같은 airbrush 계열의 spray·splatter·
    // ink-particle--scatter-cloud 는 모두 동일 기준을 통과하므로 그룹 내 대안이 충분합니다
    // (지침: 품질이 안 나오고 대체 브러시군이 있으면 제거).
    // 2026-08-21 로스터 축소 웨이브: 원래 이 자리에 적혀 있던 대안 목록
    // (pencil--stamp-grain·watercolor--edge-stamp·gouache--flat-stamp·spray--equal-area·
    // splatter--burst-cloud)은 같은 웨이브에서 중복으로 delist 됐습니다. 위 목록은 그 뒤에도
    // 노출 상태로 남는 캐노니컬 대안으로 갱신한 것입니다.
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

    // -----------------------------------------------------------------------
    // 2026-08-21 로스터 축소 웨이브 (사용자 지시: "브러시 종류를 축소해주면 좋겠다.
    // 비슷한 질감의 브러시가 너무 많다.")
    //
    // 판정 기준은 손으로 고른 목록이 아니라 두 개의 기계적 사실입니다.
    //
    // (1) 코어·엔진 레인 — `studioBrushRuntimeExecutionSignature`
    //     (engine:engineVariant:tip:texture:dynamics:operation). 서명이 같으면 페인트 시점의
    //     실행 경로가 같습니다. 즉 두 프리셋을 가르는 것은 굵기·불투명도처럼 사용자가 슬라이더로
    //     그대로 재현할 수 있는 값뿐입니다. 실측: 코어+레인 170종이 서명 108가지에 몰려 있고,
    //     그중 62종이 다른 프리셋과 서명을 공유합니다.
    // (2) 프로 팩 — 팩 런타임은 ink-particle / airbrush / dry-media 세 가지뿐이고, 브러시의
    //     "질감"은 사실상 (런타임, 팁 모티프/알파맵, 팁 레이어) 세 값이 전부입니다. 나머지
    //     softness·spacing·scatter·roundness·angle·flow·grain·colorDynamics·taper 는 전부
    //     브러시 동역학 편집기가 노출하는 슬라이더 값입니다. 실측: 160종이 팁 발자국 89가지에
    //     몰려 있고, 그중 92종이 다른 프리셋과 발자국을 공유합니다.
    //
    // 그래서 이 웨이브는 "발자국/서명을 공유하는 무리에서 실제 폭·밀도 범위를 대표하는 소수만
    // 남기고 나머지를 delist" 합니다. 고유한 알파맵 모티프를 가진 프로 68종, 고유 서명을 가진
    // 코어·레인 브러시, 네 가지 실제 펜촉 기하(calligraphy·fountain-pen·parallel-pen·brush-pen),
    // 그리고 수채/유화/에어브러시/파스텔/톤처럼 재료 자체가 다른 축은 전부 그대로 둡니다.
    // 격리는 노출 제거일 뿐이라 저장된 문서는 계속 원래 브러시로 재생됩니다
    // (`USED_PRESET_DATA_PRESERVED`).
    // -----------------------------------------------------------------------

    // ── A. causal-ink:round:round:none:causal-pressure — 한 서명에 11종 ──────────
    // pen·fineliner·marker·marker-bold 가 굵기 2.2→28 을 덮습니다. (2026-08-22 제2차 축소로
    // 중간값 ballpoint·felt-tip 도 아래 A′ 항목으로 delist 됐습니다.)
    // 원래 다섯은 그 사이 값에 끼어 있을 뿐이라 실행 경로가 완전히 같습니다.
    "gel-pen":
      "pen 과 실행 서명이 동일(causal-ink:round:round:none:causal-pressure) — 굵기 3.8/불투명도 1 로 "
      + "fineliner(2.2)와 pen(6) 사이에 끼어 있을 뿐입니다. 대안: pen · fineliner(지침 6).",
    "glass-pen":
      "pen 과 실행 서명이 동일 — 선언된 \"잉크 흐름\"으로 분기하는 렌더러가 없어 굵기 3.1/농도 0.92 "
      + "차이만 남습니다. 대안: fineliner · pen(지침 6).",
    "ruling-pen":
      "pen 과 실행 서명이 동일 — \"잉크 간격\" 변형이 페인트 시점에 실재하지 않아 굵기 4.6 의 pen "
      + "입니다. 대안: pen · fineliner(지침 6).",
    "technical-pen":
      "pen 과 실행 서명이 동일하고 굵기 2.5/불투명도 1 로 fineliner(2.2/1)와 사실상 같은 선. "
      + "대안: fineliner · pen(지침 6).",
    "alcohol-marker":
      "pen 과 실행 서명이 동일 — 알코올 마커의 블리드가 실재하지 않고 굵기 20/농도 0.65 로 "
      + "marker(16/0.6)와 marker-bold(28/0.55) 사이에 끼어 있습니다. 대안: marker · "
      + "marker-bold(지침 6).",

    // ── A′. causal-ink:round — 2026-08-22 제2차 로스터 축소(사용자 지시 재확인) ──
    // 굵기·농도 축의 중간값만 더 정리합니다. 축 대표는 fineliner(2.2/1.0)·pen(6/1.0)·
    // marker(16/0.6)·marker-bold(28/0.55) 가 그대로 유지됩니다.
    "ballpoint":
      "pen 과 실행 서명이 동일(causal-ink:round:round:none:causal-pressure) — 굵기 3.5/농도 0.95 는 "
      + "fineliner(2.2/1.0)와 pen(6/1.0) 사이의 중간값입니다. 대안: pen · fineliner(지침 6).",
    "felt-tip":
      "pen 과 실행 서명이 동일 — 굵기 10/농도 0.85 로 pen(6/1.0)과 marker(16/0.6) 사이에 끼어 있는 "
      + "중간값입니다. 대안: pen · marker · marker-bold(지침 6).",

    // ── B. perfect-outline:gpen-taper — 한 서명에 6종 ────────────────────────────
    // studio-perfect-freehand.ts 는 school-pen/liner/mapping-pen 을 아예 "gpen" 으로 별칭
    // 처리합니다(:229-231). 남길 대표는 굵기 양끝의 gpen(7)과 maru-pen(2.4).
    "school-pen":
      "perfect-outline gpen-taper 서명을 gpen 과 공유하고, studio-perfect-freehand.ts:229 가 이 id 를 "
      + "\"gpen\"으로 직접 별칭 처리합니다 — 굵기 4.2 의 gpen. 대안: gpen · maru-pen(지침 6).",
    "liner":
      "perfect-outline gpen-taper 서명을 gpen 과 공유하고 perfect-freehand 별칭도 \"gpen\" — 굵기 5 의 "
      + "gpen. 대안: gpen · maru-pen(지침 6).",
    "mapping-pen":
      "perfect-outline gpen-taper 서명을 maru-pen 과 공유하고 perfect-freehand 별칭도 \"gpen\" — 굵기 "
      + "3.2 로 maru-pen(2.4)과 겹칩니다. 대안: maru-pen · gpen(지침 6).",
    "kaburapen":
      "perfect-outline gpen-taper 서명을 gpen 과 공유 — 선언한 \"스무스\" 스푼펜 거동으로 분기하는 "
      + "렌더러가 없어 굵기 5.5 의 gpen 입니다. 대안: gpen · maru-pen(지침 6).",

    // ── C. pencil-path:jitter:grain:procedural-grain:grain-jitter — 한 서명에 5종 ─
    // pencil(2.5) · colored-pencil(4.5) · pencil-6b(6)가 굵기 축을 이미 덮습니다.
    // (pencil--side-shade 는 서명이 달라 이 무리가 아니며, 2026-08-16 오측 철회 건이라 손대지 않음.)
    "soft-pencil":
      "pencil 과 실행 서명이 동일하고 굵기 5/농도 0.7 로 colored-pencil(4.5/0.82)·pencil-6b(6/0.9) "
      + "사이에 끼어 있습니다. 대안: pencil-6b · colored-pencil · pencil(지침 6).",
    "pencil-2b":
      "pencil 과 실행 서명이 동일하고 굵기 3.5/농도 0.88 로 pencil(2.5/0.85)과 같은 결. "
      + "대안: pencil · pencil-6b(지침 6).",

    // ── D. watercolor-dabs:diffuse:soft-diffuse:wet-edge — 한 서명에 7종 ──────────
    // watercolor(수채) · gouache(과슈) · inkwash-white-ink(화이트)만 남깁니다. (2026-08-22
    // 제2차 축소로 코어 ink-wash 도 아래 D′ 항목으로 delist 됐습니다 — 수묵은 전용 레인이 대안.)
    "inkwash-pen":
      "이름은 딥펜이지만 watercolor 와 실행 서명이 동일한 확산 워시입니다(선언과 실재 불일치). "
      + "실제 펜이 필요하면 pen·gpen, 워시가 필요하면 watercolor 가 대안(지침 6).",
    "inkwash-water-brush":
      "watercolor 와 실행 서명이 동일하고 굵기 32/농도 0.6 으로 watercolor(28/0.55)와 같은 그림. "
      + "대안: watercolor(지침 6).",
    "inkwash-bleed-wash":
      "ink-wash 와 실행 서명이 동일하고 농도까지 0.5 로 같아 굵기 36/30 차이만 남습니다. "
      + "대안: watercolor(지침 6).",

    // ── D′. watercolor-dabs:diffuse — 2026-08-22 제2차 로스터 축소 ────────────────
    // 코어 ink-wash 는 watercolor 와 실행 서명·값이 사실상 같고, 수묵 표현은 노출 레인
    // (ink-wash--sumi-core · ink-wash--bleed-halo · ink-wash--fiber-feather◆ ·
    // ink-wash--chroma-halo◆ · ink-wash--living-bake◆)이 전담합니다.
    "ink-wash":
      "watercolor 와 실행 서명이 동일(watercolor-dabs:diffuse:soft-diffuse:wet-edge)하고 굵기 30/농도 "
      + "0.5 는 watercolor(28/0.55)와 같은 결입니다. 수묵이 필요하면 ink-wash--sumi-core 등 수묵 레인이 "
      + "대안(지침 6).",

    // ── E. 수채/수묵 엔진 레인 — (tip, texture) 짝이 겹치는 레인 ──────────────────
    "watercolor--granulating":
      "watercolor--granular 과 tip(sponge)·texture(procedural-grain)가 같아 과립 번짐이라는 같은 결을 "
      + "두 번 파는 레인입니다. 대안: watercolor--granular · watercolor--edge-bloom(지침 6).",
    "watercolor--fluid-feather":
      "watercolor--edge-bloom 과 tip(sponge)·texture(wet-edge)가 같아 같은 번짐 결을 씁니다. "
      + "대안: watercolor--edge-bloom · watercolor--granular(지침 6).",
    "watercolor--dense-core":
      "ink-wash--sumi-core 와 tip(bristle)·texture(wet-edge)가 같은 농밀 코어 — 굵기 26/28 차이뿐. "
      + "대안: ink-wash--sumi-core · ink-wash--living-bake · watercolor(지침 6).",

    // ── F. stamp-dabs:ink:stamp-ink — 한 서명에 8종 ──────────────────────────────
    // ink-brush(8) · mypaint-cc0--kabura(6) · mypaint-cc0--marker-fat(24)로 굵기 축을 덮습니다.
    "gouache--flat-stamp":
      "이름은 과슈지만 ink-brush 와 실행 서명이 동일한 잉크 스탬프이고(선언과 실재 불일치), 굵기 26 은 "
      + "mypaint-cc0--marker-fat(24)와 겹칩니다. 과슈가 필요하면 gouache·gouache--matte-body 가 대안(지침 6).",
    "mypaint-cc0--calligraphy":
      "ink-brush 와 실행 서명이 동일하고 굵기 15 로 mypaint-cc0--marker-fat(24)·kabura(6) 사이에 "
      + "끼어 있습니다. 실제 캘리 촉이 필요하면 calligraphy·fountain-pen 이 대안(지침 6).",
    "mypaint-cc0--marker-small":
      "mypaint-cc0--marker-fat 과 실행 서명이 동일 — 폭 정규화 픽셀 p95 0.00001 로 레포 전체에서 가장 "
      + "강한 중복입니다. 대안: mypaint-cc0--marker-fat · ink-brush(지침 6).",
    "mypaint-cc0--slow-ink":
      "ink-brush 와 실행 서명이 동일하고 선언한 \"슬로우\" 속도 응답으로 분기하는 렌더러가 없습니다. "
      + "대안: ink-brush · mypaint-cc0--marker-fat(지침 6).",
    "mypaint-cc0--knife":
      "ink-brush 와 실행 서명이 동일해 나이프 자국이 실재하지 않습니다. 실제 나이프는 "
      + "oil--knife-edge · paint-tube 가 대안(지침 6).",

    // ── G. 나머지 MyPaint CC0 웨이브 중복 (17종 → 7종 샘플러) ─────────────────────
    "mypaint-cc0--spray":
      "mypaint-cc0--splatter 와 실행 서명이 동일하고 굵기 40/42·농도 0.6/0.7 차이뿐입니다. "
      + "대안: mypaint-cc0--splatter · spray · airbrush-fine(지침 6).",
    "mypaint-cc0--watercolor-expressive":
      "mypaint-cc0--watercolor-fringe 와 실행 서명이 동일(stamp-dabs:watercolor) — 굵기 30/34 차이뿐. "
      + "대안: mypaint-cc0--watercolor-fringe · wash-brush(지침 6).",
    "mypaint-cc0--charcoal":
      "charcoal--mypaint-stamp 와 실행 서명이 동일하고 굵기 14/13 로 겹칩니다. "
      + "대안: charcoal--mypaint-stamp · mypaint-cc0--dry-brush · charcoal(지침 6).",
    "mypaint-cc0--charcoal-tanda":
      "charcoal--mypaint-stamp 와 실행 서명이 동일하고 굵기 12/13 로 겹칩니다. "
      + "대안: charcoal--mypaint-stamp · charcoal--vine-soft · charcoal(지침 6).",
    "mypaint-cc0--oil-paint":
      "mypaint-cc0--ink-blot 과 실행 서명이 동일(stamp-dabs:mypaint:stamp-airbrush)이라 유화 몸체가 "
      + "실재하지 않습니다. 실제 유화는 oil · oil--filbert-ribbon · oil-impasto-heavy 가 대안(지침 6).",
    "mypaint-cc0--pastel":
      "pastel--soft-stamp 와 실행 서명이 동일하고 굵기 20/22·농도 0.72 로 같습니다. "
      + "대안: pastel--soft-stamp · pastel · pastel--cake-soft 대신 pastel-paper-soft(지침 6).",

    // ── H·I. 유화 리본 / 압출 레인 ────────────────────────────────────────────────
    "brush--oil-lanes":
      "oil 과 실행 서명이 동일(oil-ribbon:bristle-lanes) — 굵기 16 의 oil 입니다. "
      + "대안: oil · oil--filbert-ribbon(지침 6).",
    "acrylic--stiff-ribbon":
      "oil--flat-ribbon 과 tip(hard)·texture(procedural-bristle)가 같은 경질 평면 리본입니다. "
      + "대안: oil--flat-ribbon · acrylic · oil--impasto-ribbon(지침 6).",
    "oil--tube-extrude":
      "paint-tube 와 실행 서명이 동일(dynamic-dabs:extruded-bead-ribbon) — 굵기 32/30 차이뿐. "
      + "대안: paint-tube · oil--impasto-ribbon(지침 6).",
    "acrylic--polymer-flat":
      "paint-tube 를 캐노니컬로 공유하는 hard 평면 레인이라 oil--knife-edge 와 같은 자국을 남깁니다. "
      + "대안: oil--knife-edge · paint-tube · oil--flat-ribbon(지침 6).",

    // ── H′. oil-ribbon:bristle-lanes — 2026-08-22 제2차 로스터 축소 ───────────────
    // 코어 acrylic 은 oil 과 서명·값이 사실상 같고, 유화 변주는 노출 레인(filbert·flat·
    // impasto·impasto-relief◆·bristle-depletion◆·bristle-physics◆)이 전담합니다.
    "acrylic":
      "oil 과 실행 서명이 동일(oil-ribbon:bristle-lanes)하고 굵기 20/농도 0.95 는 oil(22/0.92)과 같은 "
      + "결입니다. 대안: oil · oil--filbert-ribbon · oil--flat-ribbon(지침 6).",

    // ── J. 에어브러시·스프레이 ────────────────────────────────────────────────────
    "marker--soft-dynamic":
      "soft-brush 와 실행 서명이 동일(dynamic-dabs:soft-brush) — 굵기 20/36 차이뿐이고 마커 특유의 "
      + "균일 도포가 실재하지 않습니다. 대안: soft-brush · airbrush · marker(지침 6).",
    "airbrush--hard-envelope":
      "hard-airbrush 와 실행 서명이 동일 — 굵기 30/28·농도 0.78/0.76 차이뿐입니다. "
      + "대안: hard-airbrush · airbrush(지침 6).",
    "airbrush--klecks-grit":
      "airbrush 와 tip(soft-particle)·texture(custom-alpha-capable)가 같아 같은 입자 확산을 씁니다. "
      + "대안: airbrush · airbrush-fine · spray(지침 6).",
    "spray--equal-area":
      "spray 와 tip(flake)·texture(custom-alpha-capable)가 같은 산란 레인 — 굵기 44/40 차이뿐. "
      + "대안: spray · splatter · ink-particle--scatter-cloud(지침 6).",
    "splatter--burst-cloud":
      "splatter 와 tip(flake)·texture(custom-alpha-capable)가 같은 산란 레인 — 굵기 48/45 차이뿐. "
      + "대안: splatter · spray · ink-particle--scatter-cloud(지침 6).",

    // ── K. 서명이 완전히 동일한 레인 별칭 ─────────────────────────────────────────
    "pen--perfect-taper":
      "perfect-ink 와 실행 서명이 동일 — 폭 정규화 픽셀 p95 0.00021. 대안: perfect-ink · gpen(지침 6).",
    "calligraphy--perfect-chisel":
      "perfect-marker 와 실행 서명이 동일 — 폭 정규화 픽셀 p95 0.00002. "
      + "대안: perfect-marker · calligraphy(지침 6).",
    "pencil--erodible-wear":
      "erodible-pencil 과 실행 서명이 동일(dynamic-dabs:progressive-wear-ribbon) — 굵기 8/7 차이뿐. "
      + "대안: erodible-pencil · pencil(지침 6).",
    "pencil--stamp-grain":
      "pencil-grain 과 실행 서명이 동일(stamp-dabs:pencil) — 굵기 5/4 차이뿐입니다. "
      + "대안: pencil-grain · mypaint-cc0--2b-pencil · pencil(지침 6).",
    "sparkle-star":
      "glitter 와 실행 서명이 동일(particle-scatter:glitter:spark) — 별 모양으로 분기하는 렌더러가 "
      + "없습니다. 실제 별은 star-dust, 기본 반짝임은 glitter 가 대안(지침 6).",

    // ── L. 건식 재료 레인 ─────────────────────────────────────────────────────────
    "chalk--klecks-powder":
      "chalk 와 tip(sponge)·texture(custom-alpha-capable)가 같아 같은 분필 가루 결입니다. "
      + "대안: chalk · charcoal--vine-soft · pastel(지침 6).",
    "pastel--cake-soft":
      "pastel 과 tip(sponge)·texture(custom-alpha-capable)가 같아 같은 파스텔 결입니다. "
      + "대안: pastel · pastel--soft-stamp · chalk(지침 6).",
    "crayon--wax-scrape":
      "crayon 과 tip(hard)·texture(custom-alpha-capable)가 같아 같은 왁스 결입니다. "
      + "대안: crayon · crayon--klecks-stamp · charcoal--compressed-edge(지침 6).",
    "oil-pastel--waxy-film":
      "oil-pastel 과 tip(bristle)·texture(custom-alpha-capable)가 같아 같은 유성 필름 결입니다. "
      + "대안: oil-pastel · oil-pastel--wgm-mix(지침 6).",

    // ── M. 웻엣지 스탬프 ──────────────────────────────────────────────────────────
    "watercolor--edge-stamp":
      "wash-brush 와 실행 서명이 동일(stamp-dabs:watercolor:stamp-wet-edge) — 굵기 28/26 차이뿐. "
      + "대안: wash-brush · mypaint-cc0--watercolor-fringe · watercolor(지침 6).",

    // ── P. 프로 팩 — 팁 발자국(런타임·모티프·팁 레이어)이 같은 무리 ────────────────
    // 프로 팩의 질감 정체성은 (런타임, 팁 모티프/알파맵, 팁 레이어)가 전부입니다. 발자국이 같은
    // 브러시끼리는 softness·spacing·scatter·roundness·angle·flow·grain·colorDynamics·taper 로만
    // 갈리는데, 그 값은 전부 브러시 동역학 편집기의 슬라이더입니다. 아래는 발자국별로 실제 폭·밀도
    // 범위를 대표하는 소수만 남기고 delist 한 결과이며, 고유 알파맵 모티프를 가진 68종과
    // studio-brush-continuity-audit 가 핀으로 고정한 희소 5종은 전부 그대로 노출됩니다.

    // P1. dry-media|grain (11종) → precision-pencil · pencil-4b-rough · crayon-wax-bold · bumpy-grain
    "powder-sketch":
      "dry-media/grain 발자국을 pencil-4b-rough 와 공유하고 softness 0.355 는 pencil-colored-soft 와 "
      + "동일 — 굵기 7 도 같습니다. 대안: pencil-4b-rough · precision-pencil(지침 6).",
    "chalk-powder":
      "dry-media/grain 발자국을 bumpy-grain 과 공유하고 grain scale 9.4 까지 같아 굵기·농도만 다릅니다. "
      + "대안: crayon-wax-bold · velvet-charcoal · bumpy-grain(지침 6).",
    "rough-grain":
      "dry-media/grain 발자국 무리에서 grain 0.395 를 bumpy-grain 과 공유하고 굵기 20 은 그 사이 값입니다. "
      + "대안: bumpy-grain · rock-texture(지침 6).",
    "sand-texture":
      "dry-media/grain 발자국 무리에서 grain 0.395 를 bumpy-grain 과 공유 — 스캐터 0.27 도 슬라이더 값입니다. "
      + "대안: bumpy-grain · sponge-stipple-dab(지침 6).",
    "pencil-colored-soft":
      "dry-media/grain 발자국·softness 0.355 를 powder-sketch 와 공유하고 굵기 7 도 같습니다. 색연필은 "
      + "코어 colored-pencil 이, 무른 연필 결은 pencil-4b-rough 가 대안(지침 6).",
    "pencil-tilt-shading":
      "dry-media/grain 발자국 무리에서 spacing 0.194·softness 0.135 를 chalk-powder 와 공유합니다. "
      + "대안: pencil-4b-rough · side-graphite-shade(지침 6).",
    "watercolor-dry-granule":
      "이름은 수채지만 dry-media 런타임이라 웻엣지가 실재하지 않고, grain scale 4.8 은 sand-texture 와 "
      + "같습니다. 실제 수채는 코어 watercolor·watercolor--granular 가 대안(지침 6).",

    // P2. ink-particle|hard|chisel-alpha (10종) → horizontal-blade · vertical-blade
    //     · calligraphy-tilt-nib · marker-wide-chisel
    "oval-shading":
      "ink-particle 사선 촉 알파맵을 10종이 공유하는 무리에서 roundness 0.48 은 clean-flat(0.44)과 겹칩니다. "
      + "대안: horizontal-blade · directional-flat(지침 6).",
    "clean-flat":
      "같은 사선 촉 알파맵 무리에서 roundness 0.44·angle -10.5° 로 clean-flat-marker(0.42/-14.5°)와 "
      + "사실상 같은 자국입니다. 대안: horizontal-blade · directional-flat(지침 6).",
    "rhythm-flat":
      "같은 사선 촉 알파맵 무리에서 clean-flat 과 spacing 만 다릅니다(0.369 vs 0.153 — 슬라이더 값). "
      + "대안: horizontal-blade · marker-wide-chisel(지침 6).",
    "clean-flat-marker":
      "같은 사선 촉 알파맵 무리에서 clean-flat 과 roundness·angle 이 겹칩니다. "
      + "대안: marker-wide-chisel · transparent-flat · hard-oval(지침 6).",
    "alcohol-chisel-marker":
      "같은 사선 촉 알파맵 무리에서 angle -23.5° 로 calligraphy-tilt-nib(-33.5°)과 marker-wide-chisel "
      + "(-33.5°) 사이 값입니다. 대안: marker-wide-chisel · calligraphy-tilt-nib(지침 6).",
    "acrylic-stiff-flat":
      "같은 사선 촉 알파맵 무리이고, 두꺼운 아크릴 몸체는 코어 acrylic·oil--flat-ribbon 이 실제 리본으로 "
      + "그립니다. 대안: gouache-grain-flat · directional-flat · acrylic(지침 6).",

    // P3. dry-media|sponge (10종) → velvet-charcoal · compressed-charcoal-edge
    //     · pastel-paper-soft · sponge-stipple-dab · rock-texture
    "chalk-rough":
      "dry-media/sponge 발자국을 compressed-charcoal-edge 와 공유하고 spacing 0.319/0.312 까지 같습니다. "
      + "대안: velvet-charcoal · compressed-charcoal-edge(지침 6).",
    "strong-rough-grain":
      "dry-media/sponge 발자국 무리에서 spacing 0.187·scatter 0.108 을 rock-texture 와 공유합니다. "
      + "대안: rock-texture · velvet-charcoal(지침 6).",
    "heavy-rough-grain":
      "dry-media/sponge 발자국 무리에서 grain 0.505 를 rock-texture 와 공유 — 굵기 36/38 차이뿐. "
      + "대안: rock-texture · sponge-stipple-dab(지침 6).",
    "plaster-texture":
      "dry-media/sponge 발자국 무리에서 chalk-rough·rock-texture 와 축별 최대 차이가 0.16 에 불과합니다. "
      + "대안: rock-texture · velvet-charcoal(지침 6).",
    "pencil-charcoal-stick":
      "dry-media/sponge 발자국 무리에서 spacing 0.190·scatter 0.108 을 rock-texture·plaster 와 공유합니다. "
      + "대안: velvet-charcoal · compressed-charcoal-edge · side-graphite-shade(지침 6).",

    // P4. ink-particle|round (8종) → g-pen-flex · spoon-pen-round · round-shading
    //     · hard-oval · smooth-oval
    "classic-marker":
      "ink-particle/round 발자국 무리에서 roundness 0.96 으로 round-shading(1.0)과 같은 자국이고 굵기 18 도 "
      + "같습니다. 대안: round-shading · hard-oval · 코어 marker(지침 6).",
    "round-paint":
      "ink-particle/round 발자국 무리에서 roundness 0.94 로 round-shading 과 겹치고 굵기만 24/18 다릅니다. "
      + "대안: round-shading · opaque-gouache(지침 6).",
    "watercolor-detail-round":
      "ink-particle/round 발자국 무리에서 softness 0.085 를 round-shading·g-pen-flex 와 공유하고, 이름과 달리 "
      + "웻엣지가 없습니다. 대안: spoon-pen-round · 코어 watercolor(지침 6).",

    // P5. ink-particle|hard (7종) → core-round · technical-needle-ink · maru-pen-fine
    //     · ink-splatter-burst · stage-safe-splatter
    "crisp-ink":
      "ink-particle/hard 발자국 무리에서 core-round 와 축별 최대 차이 0.12 — 팩 전체에서 가장 가까운 쌍입니다. "
      + "대안: core-round · maru-pen-fine(지침 6).",
    "milli-pen-uniform":
      "ink-particle/hard 발자국 무리에서 roundness 1.0 을 core-round 와 공유하고 굵기 4 는 maru-pen-fine(3)과 "
      + "겹칩니다. 대안: core-round · maru-pen-fine · technical-needle-ink(지침 6).",

    // P6. airbrush|soft (7종) → mist-soft · watercolor-wet-bleed · bokeh-scatter
    //     · marker-colorless-blender
    "cloud-soft":
      "airbrush/soft 발자국 무리에서 mist-soft 와 축별 최대 차이 0.18 — 굵기 36/52 차이가 대부분입니다. "
      + "대안: mist-soft · marker-colorless-blender(지침 6).",
    "airbrush-grand-soft":
      "airbrush/soft 발자국 무리에서 spacing 0.09·scatter 0.025 로 mist-soft 와 같고 굵기 64/52 만 다릅니다. "
      + "대안: mist-soft · 코어 airbrush(지침 6).",
    "watercolor-wet-wash":
      "airbrush/soft 발자국 무리에서 watercolor-wet-bleed 와 spacing·scatter·grain amount 가 모두 같습니다 — "
      + "airbrush 런타임이라 웻엣지도 실재하지 않습니다. 대안: watercolor-wet-bleed · 코어 watercolor(지침 6).",

    // P7·P8. dry-media|bristle / dry-media|hard|chisel-alpha
    "fiber-marker":
      "dry-media/bristle 발자국 무리에서 taper-brush-marker 와 spacing 0.149·scatter 0.0686·softness 0.3 이 "
      + "전부 동일합니다. 대안: taper-brush-marker · oil-dry-scumble(지침 6).",
    "fiber-sketch":
      "dry-media/bristle 발자국 무리에서 spacing 0.194·scatter 0.109 를 oil-dry-scumble 계열과 공유합니다. "
      + "대안: oil-dry-scumble · pencil-4b-rough · 코어 charcoal(지침 6).",
    "scattered-flat":
      "dry-media 사선 촉 알파맵 무리에서 directional-flat 과 spacing 0.196/0.192·scatter 0.109 가 같습니다. "
      + "대안: directional-flat · gouache-grain-flat(지침 6).",
    "chalk-compressed":
      "dry-media 사선 촉 알파맵 무리에서 spacing 0.189·scatter 0.085 를 side-graphite-shade 와 공유합니다. "
      + "대안: side-graphite-shade · compressed-charcoal-edge · velvet-charcoal(지침 6).",

    // P9·P10·P11. sumi / sponge 3종 무리
    "paint-ink":
      "ink-particle/sumi 발자국 무리에서 flex-ink 와 축별 최대 차이 0.20 — 굵기 20/9 가 대부분입니다. "
      + "대안: flex-ink · brush-pen-ink(지침 6).",
    "watercolor-edge-stain":
      "airbrush/sponge 발자국 무리에서 bleeding-stain 과 spacing 0.09·scatter 0.0475 가 같고, airbrush "
      + "런타임이라 수채 가장자리가 실재하지 않습니다. 대안: bleeding-stain · 코어 watercolor(지침 6).",
    "broken-nib-ink":
      "dry-media/sumi 발자국 무리에서 rough-ink 와 spacing 0.153/0.149·scatter 0.0888 이 같습니다. "
      + "대안: rough-ink · sumi-wash-fray(지침 6).",

    // P-pairs. 발자국이 같은 2종 쌍 중 실제로 구분되지 않는 것
    "angular-square":
      "정사각 알파맵을 pixel-square 와 공유하고 roundness 1.0 도 같아 굵기 18/8 만 다릅니다. "
      + "대안: pixel-square · line-block · horizontal-blade(지침 6).",
    "watercolor-flat-wash":
      "airbrush 사선 촉 알파맵을 transparent-flat 과 공유하고 축별 최대 차이 0.18 — airbrush 런타임이라 "
      + "수채 워시가 실재하지 않습니다. 대안: transparent-flat · 코어 watercolor(지침 6).",
    "foliage-broad-canopy":
      "잎송이 알파맵과 팁 레이어를 leaf-cluster 와 공유하고 scatter 0.62/0.39 차이만 남습니다. "
      + "대안: leaf-cluster · long-leaf · leaf-fall-flurry(지침 6).",
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

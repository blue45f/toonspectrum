import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const outputDirectory = path.resolve(process.env.STUDIO_BUNDLE_DIR ?? "dist");
const manifestPath = path.join(outputDirectory, ".vite", "manifest.json");
const studioEntry = "src/domains/creator/StudioPage.tsx";
const appEntry = "index.html";

const budgets = {
  // Measured 2026-07-15 after commercial close-out (soft-lock, merge, density, smart filters):
  // StudioPage ~1.03 MiB + static deps ≈ 2.29 MiB raw / ~753 KiB gzip.
  // 2026-07-15 evening: pro-draw prefs, menu portal stacking, chrome polish ≈ 744 KiB gzip.
  // 2026-07-15 residual always-on presence + pressure-curve helpers: ~755 KiB gzip observed.
  // 2026-07-15 Magma selection transform (content bake + marquee translate/scale): ~762 KiB gzip.
  // 2026-07-15 bubble path/export + floating tool popovers + insert/tutorial wiring:
  // observed ~2438 KiB raw / ~787 KiB gzip (tutorial hub remains lazy).
  // 2026-07-16 upload route + scene/panel assembly split: ~2.33 MiB raw / ~771 KiB gzip.
  // 2026-07-16 release planner split + auth graph cleanup: ~2.32 MiB raw / ~768 KiB gzip.
  // 2026-07-16 publication analytics split: ~2.30 MiB raw / ~762 KiB gzip.
  // Preserve the previous headroom while locking in the independently loaded analytics engine.
  // 2026-07-17 hot-path de-React(제스처 줌·커밋 지연 파이프라인·격리 초안 스토어)+스탬프
  // 브러시 4종: ~2397 KiB raw / ~775 KiB gzip 관측 — 소폭 상향.
  // 2026-07-17 모놀리스 분할: 에디터 JSX를 React Compiler 컴파일 memo 자식 9개로 이전.
  // RC memo-cache 코드젠+props 배선 비용 ≈ +5% (~2527 KiB raw / ~826 KiB gzip 관측) 대신
  // 정착 커밋 렌더 570→68ms. 예산은 관측치+약 2% 여유로 상향.
  // 2026-07-18 브러시 탐색 통합·모바일 스탬프 제어 후 선택/크롭/라이브 잉크 호스트를
  // 지연 청크로 분리: ~2580 KiB raw / ~844 KiB gzip. gzip 상한은 유지하고, 새 계약 코드의
  // 0.2% 미만 raw 증가만 잠근다.
  // 2026-07-18 SVG 내보내기·마술봉·리퀴파이 3개를 Worker로 오프로드(client+protocol+worker
  // 파일 9개 추가): 2645087 raw / 865123 gzip 관측(예산을 87/123바이트 초과). 관측치+약 2%
  // 여유로 상향 — 뒤이어 스머지·힐클론 오프로드가 곧바로 예정돼 있다.
  // 2026-07-18 작업공간 manager·이미지 전문 패널·선택 도구 overlay를 실제 사용자 의도
  // 경계로 분리하고 Container의 section barrel 우회를 제거했다. 전체 route 상한은 원격 Worker
  // wave의 더 큰 보수 예산을 유지하고, entry/앱 셸 이후 증분 예산으로 eager 회귀를 별도 잠근다.
  // 2026-07-19 SceneDocument v3의 bounded shot camera/render/LT/visibility parser가 project-file
  // 검증 경로에 남아 incremental raw 2,117,656 bytes로 측정됐다. Three/R3F는 계속 사용자 진입
  // 시점의 dynamic graph에만 있으므로 raw schema 비용 0.24%만 허용하고 gzip 상한은 유지한다.
  // 2026-07-19 드로잉 보조 문서 영속화·다중 참고 보드·원근/아이소메트릭·VRM 장면 메타데이터를
  // Studio의 동기 복구 경로에 추가했다. 무거운 참고 보드/3D UI는 계속 지연 로딩하며, 정적 증가분은
  // 복구 스키마와 StudioPage 배선뿐이다. 관측치(entry 1,196,284/358,997,
  // incremental 2,176,681/708,141, 124 requests)에 약 2% 여유를 두되 전체 route 상한은 유지한다.
  // 2026-07-19 Inspector 3,727줄을 독립 React Compiler 단위로 분리했다. 이전에는 500KB를 넘는
  // StudioPage 전체의 코드 생성을 Babel이 deopt했지만, 새 Inspector 모듈은 정상 컴파일되어
  // entry 1,258,797/376,835, incremental 2,232,628/723,459, 128 requests로 재배치됐다.
  // 전체 Studio route 상한은 그대로 유지하고, 세부 회귀 예산만 실제 관측치+약 2%로 다시 잠근다.
  // 2026-07-20 앱 셸 i18n과 drawing-assist/VRM scene 복구 계약이 함께 반영된 측정치는
  // route 2,733,950/890,637, app-shell 이후 2,234,078/730,639, 133 requests다. 무거운 패널은
  // 여전히 dynamic entry이며, 전체·request 상한만 관측치에 약 2%/1개 여유로 다시 잠근다.
  // 2026-07-20 원격 참고 이미지/공유 에셋 응답 검증, 아이소메트릭 입체, GLB interchange 계약을
  // 추가한 production build는 app-shell 이후 약 2.27MB/740KB, 137 requests와 app entry 약
  // 500KB raw다. 실제 3D/decoder/원본 이미지 payload는 계속 사용자 동작 뒤 dynamic graph에
  // 남아 있으므로, 새 동기 복구·보안 계약의 관측치에 약 2%/1-request 여유만 다시 고정한다.
  // 2026-07-22 안전한 ORA/CBZ 가져오기와 공통 손실 확인 배선 후 2,787,460/910,538 bytes,
  // app-shell 이후 2,285,734/750,241 bytes, 138 requests를 관측했다. 파서·decode/apply·손실 UI는
  // 모두 사용자 선택 뒤 dynamic graph에 유지하고, 공유 page factory 주입으로 추가 요청도 제거했다.
  // raw에는 약 0.2%, route gzip에는 약 0.16%의 작은 drift 여유만 다시 고정한다.
  // 2026-07-23 선-only 페이지도 원본 보존 합성 필터로 처리하고, 4MP/4MiB fail-closed,
  // 공유 descriptor/CRDT의 bounded blur·curve 왕복 검증을 추가했다. production 관측치는
  // 2,795,227/913,046 bytes, app-shell 이후 2,293,501/752,758 bytes이며 요청 수는 138로 불변.
  // 관측치에 0.1~0.2%의 작은 코드젠 drift만 허용하고 요청·incremental gzip 상한은 유지한다.
  // 2026-07-23 compact WebGPU live-journal/whole-group failover와 다중 화면 reference capture의
  // commit-safe 제어면을 추가했다. Worker·raster encoder·reference renderer는 계속 사용자 수요 뒤
  // dynamic graph에 남고 정적 요청 수도 137개로 불변이다. production 관측치는
  // 2,819,602/919,407 bytes, app-shell 이후 2,317,637/759,027 bytes다.
  // 2026-07-23 경쟁사 갭 1차 웨이브(닷지/번·색상범위·퀵마스크·섀도우하이라이트·히스토그램·
  // 필터팩 15종·특수자 3종·GIF/APNG·브러시 120종·데생인형·bg3d 방만들기/태양릭/렌즈·선화 선택
  // 표시·3D 캡처 화질)가 위 reference capture 웨이브와 합류했다. 웨이브 단독 관측 증가분은
  // route +54.6/+19.0 KiB, app-shell 이후 +54.0/+18.7 KiB, +8 requests(신규 패널·엔코더·3D
  // 모듈 전부 lazy 청크)였고, eager 증가는 InspectorAside 확장+메뉴/단축키 데이터뿐이다.
  // 두 웨이브 합산 추정치+약 2% 여유·request +2로 다시 잠근다.
  // 2026-07-24 2D 코어 웨이브: 사용자 글꼴·벡터 지우개 교점·선택 스텐실·세로쓰기 정적 임포트로
  // route raw 2866.5/gzip 938.9 KiB, app-shell 이후 raw 2375.5 KiB·정적 요청 154 관측. 관측치+여유로 재고정.
  // 2026-07-24 경쟁 residual: multi-page bulk, dialogue ruby/format, export package preflight,
  // live mutation gate, auto-color plan panel(lazy)+worker, indices capture glue.
  // production 관측: route raw 2905.0 KiB, app-shell 이후 raw 2413.9 / gzip 794.7 KiB, 156 requests.
  // 무거운 패널·export·3D는 lazy 유지. 관측치+약 2%/+2-request 여유로 재고정.
  // 2026-07-24 CSP 교점까지 지우기 문서 apply 배선(순수 플래너는 기존, StudioPage·dock 가시성):
  // route gzip 956.5 KiB 관측 — gzip 상한만 관측치+약 2%로 재고정(raw·entry는 여유 유지).
  // 2026-07-26 캔버스 뷰포트 compiler boundary + 0%-기본 WebGPU cohort policy:
  // route 3,036,277/994,984 bytes 관측. entry/incremental/gzip 예산은 기존 상한 안이며,
  // raw의 0.04% 초과만 작은 코드젠 drift 여유와 함께 다시 잠근다.
  // 2026-07-27 전체 브러시 카탈로그 즐겨찾기·쓰기 실패 복구, 선화 EDT/색상범위 Worker
  // admission control, OBJ/MTL preflight Worker, Studio 전용 COOP/COEP gate를 반영한 측정치는
  // route raw 3,055,6xx, entry gzip 386,6xx bytes다. 무거운 처리기는 계속 dynamic Worker이고
  // 정적 요청 수와 route gzip은 기존 상한 안이므로 관측치에 0.2% 미만의 여유만 재고정한다.
  studio: { raw: 3_060_000, gzip: 1_000_000 },
  studioEntry: { raw: 1_284_000, gzip: 389_000 },
  // 2026-07-23 저녁: roughjs 스케치 도형·polygon-clipping 패스 불리언 도입 — 두 라이브러리 본체는
  // 다이내믹 청크(예산 밖)이나 어댑터 공유 청크 +1로 정적 요청 149 관측. +1 여유로 재고정.
  // 2026-07-23 밤: perfect-freehand 벡터 펜(퍼펙트 잉크/마커) 어댑터 도입 — 라이브러리 본체는
  // 다이내믹 청크(예산 밖)이나 어댑터 공유 청크 +1로 정적 요청 150 관측. +1 여유로 재고정.
  // 2026-07-24: 비파괴 필터 마스크(studio-filter-mask, KonvaImageNode 정적 임포트) + 말풍선
  // 손그림 외곽선(studio-bubble-outline-style, KonvaBubbleNode 정적 임포트)로 정적 요청 152 관측.
  // 2026-07-24 배선: 필터마스크 페인팅 툴 + 말풍선 병합(StudioPage가 studio-bubble-merge 정적
  // 임포트)로 정적 요청 153·gzip 777.6 KiB 관측. 청크+1, gzip 예산 소폭 상향(+headroom)해 재고정.
  // 2026-07-24 2D 코어 웨이브: app-shell 이후 raw 2375.5 KiB·정적 요청 154 관측. 청크+1·raw 상향 재고정.
  // 2026-07-26: Cloud storage adapter (Google Drive & OneDrive) integration added:
  // measured studioIncremental ~2469 KiB raw / 812.5 KiB gzip.
  // 2026-07-27 위 Worker admission/prefs 경계 반영 후 raw 2,551,xxx bytes를 관측했다.
  // gzip·request 한도는 유지하고 raw 코드젠 drift만 약 0.2% 허용한다.
  studioIncremental: { raw: 2_556_000, gzip: 840_000, chunks: 158 },
  // Rapier deterministic compat is intentionally isolated in a user-triggered module Worker.
  // 2026-07-18 production output: 2,302,139 raw / 855,399 gzip. Keep ~2% version-drift headroom
  // without charging this optional engine to Studio or the 3D editor's initial graph.
  bg3dPhysicsWorker: { raw: 2_350_000, gzip: 875_000 },
  // 2026-07-19 selected-shot/multi-pass/recovery UI baseline. This is the complete static closure
  // activated only after the user opens StudioBackground3D; PSD/physics/engine labs stay isolated.
  // 2026-07-23 방 만들기·태양 릭·렌즈·단면·스케일 가이드(전부 lazy bg3d 청크) 반영:
  // 2,399,700/698,200 bytes, 42 requests 관측 — 관측치+약 2%/1-request 여유로 상향.
  // 2026-07-26 Shapes/View/LT를 500KB 미만 독립 모듈로 분리해 기존 Babel deopt를 제거했다.
  // React Compiler memo-cache 코드젠과 명시적 패널 계약으로 activation closure가
  // 2,466,516/727,099 bytes, 43 requests로 이동했다. Three/R3F·패널은 여전히 Studio route와
  // 분리되고 optional runtime 경계도 불변이므로 관측치에 약 2% drift만 허용한다.
  // 2026-07-27 OBJ/MTL preflight Worker client의 취소·epoch·예산 경계 반영 후 gzip이 기존
  // 상한을 수십 바이트 넘었다. raw·request 한도는 유지하고 gzip만 0.3% 미만 재고정한다.
  bg3dEditor: { raw: 2_516_000, gzip: 744_000, chunks: 43 },
  // Durable recovery, integrity verification, PNG/contact-sheet/PSD clients, and ZIP packaging load
  // only after explicit batch export. 2026-07-20 OffscreenCanvas pass-PNG Worker client/protocol:
  // measured incremental closure 164,352 raw / 43,602 gzip; retain ~2% raw headroom.
  bg3dShotBatchRuntime: { raw: 168_000, gzip: 45_000, chunks: 3 },
  // Per-pass OffscreenCanvas PNG compositor; measured 2,651 raw / 1,156 gzip and isolated from
  // both the editor graph and the batch-runtime static closure by Vite's module Worker boundary.
  bg3dShotPngWorker: { raw: 4_000, gzip: 2_000 },
  // ag-psd is intentionally reachable only through the bounded per-shot PSD module Worker.
  bg3dPsdWorker: { raw: 1_250_000, gzip: 360_000 },
  // OffscreenCanvas/createImageBitmap contact-sheet compositor, isolated from the editor graph.
  bg3dContactSheetWorker: { raw: 80_000, gzip: 25_000 },
  // OBJ/MTL parsing, triangulation, and clone-safe scene canonicalization stay in an isolated
  // module Worker. 2026-07-22 production output: 325,024 raw / 77,443 gzip; retain modest
  // dependency-drift headroom without allowing this parser to join the BG3D editor graph.
  bg3dObjWorker: { raw: 340_000, gzip: 82_000 },
  // Measured after the same build: 443,257 raw / 143,956 gzip.
  app: { raw: 510_000, gzip: 170_000 },
};

function fail(message) {
  console.error(`studio bundle check failed: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(manifestPath)) {
  fail(`missing ${path.relative(process.cwd(), manifestPath)}; run "pnpm run build" first`);
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  function staticClosure(entryKey) {
    const visited = new Set();
    const visit = (key) => {
      if (visited.has(key)) return;
      const entry = manifest[key];
      if (!entry) throw new Error(`manifest import ${JSON.stringify(key)} is missing`);
      visited.add(key);
      for (const imported of entry.imports ?? []) visit(imported);
    };
    visit(entryKey);
    return visited;
  }

  function measure(keys) {
    let raw = 0;
    let gzip = 0;
    for (const key of keys) {
      const entry = manifest[key];
      const filePath = path.join(outputDirectory, entry.file);
      const bytes = fs.readFileSync(filePath);
      raw += bytes.byteLength;
      gzip += gzipSync(bytes).byteLength;
    }
    return { raw, gzip };
  }

  function describe(bytes) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  function checkBudget(label, actual, budget) {
    if (actual.raw > budget.raw) {
      fail(`${label} static JS is ${describe(actual.raw)} raw (budget ${describe(budget.raw)})`);
    }
    if (actual.gzip > budget.gzip) {
      fail(`${label} static JS is ${describe(actual.gzip)} gzip (budget ${describe(budget.gzip)})`);
    }
  }

  function matchingEntries(keys, pattern) {
    return [...keys].filter((key) => {
      const entry = manifest[key];
      return pattern.test([key, entry.src, entry.file].filter(Boolean).join(" "));
    });
  }

  function matchingManifestEntries(pattern) {
    return Object.entries(manifest)
      .filter(([key, entry]) => pattern.test([key, entry.src, entry.file].filter(Boolean).join(" ")))
      .map(([key]) => key);
  }

  function checkDynamicBoundary(label, pattern, staticKeys) {
    const matching = matchingManifestEntries(pattern);
    const dynamicEntries = matching.filter((key) => manifest[key].isDynamicEntry === true);
    if (dynamicEntries.length === 0) {
      fail(`${label} is missing an analyzable dynamic manifest entry`);
      return;
    }
    const eagerEntries = dynamicEntries.filter((key) => staticKeys.has(key));
    if (eagerEntries.length > 0) {
      fail(`${label} returned to the Studio static graph: ${eagerEntries.join(", ")}`);
    }
  }

  function dynamicTargetsFromStaticClosure(entryKey) {
    const targets = new Set();
    for (const key of staticClosure(entryKey)) {
      for (const target of manifest[key].dynamicImports ?? []) targets.add(target);
    }
    return targets;
  }

  try {
    const studioKeys = staticClosure(studioEntry);
    const appKeys = staticClosure(appEntry);
    const studioIncrementalKeys = new Set([...studioKeys].filter((key) => !appKeys.has(key)));
    const studioSize = measure(studioKeys);
    const studioEntrySize = measure(new Set([studioEntry]));
    const studioIncrementalSize = measure(studioIncrementalKeys);
    const appSize = measure(appKeys);

    checkBudget("Studio route", studioSize, budgets.studio);
    checkBudget("StudioPage entry", studioEntrySize, budgets.studioEntry);
    checkBudget("Studio route after app shell", studioIncrementalSize, budgets.studioIncremental);
    if (studioIncrementalKeys.size > budgets.studioIncremental.chunks) {
      fail(
        `Studio route after app shell uses ${studioIncrementalKeys.size} static JS requests `
          + `(budget ${budgets.studioIncremental.chunks})`,
      );
    }
    checkBudget("app entry", appSize, budgets.app);

    const eagerDocumentEngines = matchingEntries(
      studioKeys,
      /studio-(?:svg-export|psd-export|psd-import)/,
    );
    if (eagerDocumentEngines.length > 0) {
      fail(`SVG/PSD engines returned to the Studio static graph: ${eagerDocumentEngines.join(", ")}`);
    }

    const eagerCrdtRuntime = matchingEntries(
      studioKeys,
      /(?:studio-crdt-document|studio-crdt-room-binding|node_modules.*\/yjs\/)/,
    );
    if (eagerCrdtRuntime.length > 0) {
      fail(`Yjs/CRDT runtime returned to the Studio static graph: ${eagerCrdtRuntime.join(", ")}`);
    }

    const eagerOptionalStudioWorkflows = matchingEntries(
      studioKeys,
      /(?:StudioUploadPublish|studio-(?:comipo-assembly|comipo-shipped|comipo-insert|panel-layouts|scene-templates))/,
    );
    if (eagerOptionalStudioWorkflows.length > 0) {
      fail(
        `upload/template workflows returned to the Studio static graph: ${eagerOptionalStudioWorkflows.join(", ")}`,
      );
    }

    checkDynamicBoundary(
      "optional publish manifest verification runtime",
      /src\/domains\/creator\/studio-publish-package-manifest-runtime\.ts/,
      studioKeys,
    );

    const eagerReleasePlanner = matchingEntries(
      studioKeys,
      /studio-release-schedule(?!-loader)/,
    );
    if (eagerReleasePlanner.length > 0) {
      fail(`release planning engine returned to the Studio static graph: ${eagerReleasePlanner.join(", ")}`);
    }

    const eagerPublicationAnalytics = matchingEntries(
      studioKeys,
      /studio-publication-analytics(?!-loader)/,
    );
    if (eagerPublicationAnalytics.length > 0) {
      fail(
        `publication analytics engine returned to the Studio static graph: ${eagerPublicationAnalytics.join(", ")}`,
      );
    }

    const eagerVoiceRuntime = matchingEntries(
      studioKeys,
      /(?:studio-voice-call(?!-model)|studio-voice-ice-policy)/,
    );
    if (eagerVoiceRuntime.length > 0) {
      fail(
        `optional WebRTC voice runtime returned to the Studio static graph: ${eagerVoiceRuntime.join(", ")}`,
      );
    }

    const eagerLayerNavigator = matchingEntries(
      studioKeys,
      /StudioLayerNavigator(?:\.tsx)?/,
    );
    if (eagerLayerNavigator.length > 0) {
      fail(
        `optional layer navigator returned to the Studio static graph: ${eagerLayerNavigator.join(", ")}`,
      );
    }

    const eagerColorVisionCoach = matchingEntries(
      studioKeys,
      /(?:studio-color-vision-coach|StudioColorBlindPreviewToggle)/,
    );
    if (eagerColorVisionCoach.length > 0) {
      fail(
        `optional color-vision coach UI returned to the Studio static graph: ${eagerColorVisionCoach.join(", ")}`,
      );
    }

    const standaloneColorVisionModel = matchingEntries(
      studioIncrementalKeys,
      /studio-color-vision-model/,
    );
    if (standaloneColorVisionModel.length > 0) {
      fail(
        `live color-vision model became an extra Studio request: ${standaloneColorVisionModel.join(", ")}`,
      );
    }

    const optionalUiBoundaries = [
      ["deferred Studio inspector", /src\/domains\/creator\/StudioInspectorAside\.tsx/],
      ["optional comments session", /src\/domains\/creator\/StudioCommentsPanelSession\.tsx/],
      ["optional Studio menubar commands", /src\/domains\/creator\/StudioMenubarContent\.tsx/],
      ["optional mobile editing dock", /src\/domains\/creator\/StudioMobileEditingDock\.tsx/],
      ["optional view tools HUD", /src\/domains\/creator\/StudioViewToolsHud\.tsx/],
      ["optional tools companion protocol", /src\/domains\/creator\/studio-tools-companion\.ts/],
      ["optional workspace manager", /src\/domains\/creator\/StudioWorkspaceMenu\.tsx/],
      ["optional color palette", /src\/domains\/creator\/StudioColorPalettePanel\.tsx/],
      ["optional flood fill panel", /src\/domains\/creator\/StudioFloodFillPanel\.tsx/],
      ["optional palette library", /src\/domains\/creator\/StudioPaletteLibraryPanel\.tsx/],
      ["optional panel split tool", /src\/domains\/creator\/StudioPanelSplitTool\.tsx/],
      ["optional pixel-edit brush runtime", /src\/domains\/creator\/studio-pixel-edit-brush-runtime\.ts/],
      ["optional AI scenario codec", /src\/domains\/creator\/studio-scenario-scenes\.ts/],
      ["optional AI palette codec", /src\/domains\/creator\/studio-palette-suggest\.ts/],
      ["optional heal/clone overlay", /src\/domains\/creator\/StudioHealCloneOverlay\.tsx/],
      ["optional history brush overlay", /src\/domains\/creator\/StudioHistoryBrushOverlay\.tsx/],
      ["optional isometric overlay", /src\/domains\/creator\/StudioIsometricGridOverlay\.tsx/],
      ["optional layer mask overlay", /src\/domains\/creator\/StudioLayerMaskOverlay\.tsx/],
      ["optional perspective overlay", /src\/domains\/creator\/StudioPerspectiveOverlay\.tsx/],
      ["optional puppet warp overlay", /src\/domains\/creator\/StudioPuppetWarpOverlay\.tsx/],
    ];
    for (const [label, pattern] of optionalUiBoundaries) {
      checkDynamicBoundary(label, pattern, studioKeys);
    }

    const commentSessionEntries = matchingManifestEntries(
      /src\/domains\/creator\/StudioCommentsPanelSession\.tsx/,
    ).filter((key) => manifest[key].isDynamicEntry === true);
    if (commentSessionEntries.length !== 1) {
      fail(
        `expected one StudioCommentsPanelSession dynamic entry, found ${commentSessionEntries.length}`,
      );
    } else {
      const nestedCommentPanels = matchingEntries(
        dynamicTargetsFromStaticClosure(commentSessionEntries[0]),
        /src\/domains\/creator\/StudioCommentsPanel\.tsx/,
      );
      if (nestedCommentPanels.length > 0) {
        fail(
          "comments session introduced a nested StudioCommentsPanel dynamic waterfall: "
            + nestedCommentPanels.join(", "),
        );
      }
    }

    const eagerBackgroundCatalog = matchingEntries(
      studioKeys,
      /studio-background-presets/,
    );
    if (eagerBackgroundCatalog.length > 0) {
      fail(
        `optional background preset catalog returned to the Studio static graph: ${eagerBackgroundCatalog.join(", ")}`,
      );
    }

    const eagerFrameAnimationExport = matchingEntries(
      studioKeys,
      /(?:studio-frame-animation-export|studio-motion-export)/,
    );
    if (eagerFrameAnimationExport.length > 0) {
      fail(
        `optional frame-animation WebM runtime returned to the Studio static graph: ${eagerFrameAnimationExport.join(", ")}`,
      );
    }

    const eager3dRuntime = matchingEntries(
      studioKeys,
      /(?:studio-background-3d-primitives|StudioBackground3D|studio-bg3d-three-webgpu-lab|react-three-fiber|three\.(?:module|webgpu))/,
    );
    if (eager3dRuntime.length > 0) {
      fail(`optional 3D runtime returned to the Studio static graph: ${eager3dRuntime.join(", ")}`);
    }

    const emittedProductionEngineLabs = matchingManifestEntries(
      /(?:studio-bg3d-(?:three-webgpu-lab|engine-benchmark-browser)|@babylonjs|babylon(?:\.js)?|playcanvas)/i,
    );
    if (emittedProductionEngineLabs.length > 0) {
      fail(
        `3D engine lab code was emitted into the production manifest: ${emittedProductionEngineLabs.join(", ")}`,
      );
    }

    checkDynamicBoundary(
      "optional 3D background editor",
      /src\/domains\/creator\/StudioBackground3D\.tsx/,
      studioKeys,
    );
    const background3dEntries = matchingManifestEntries(
      /src\/domains\/creator\/StudioBackground3D\.tsx/,
    );
    if (background3dEntries.length !== 1) {
      fail(`expected one StudioBackground3D manifest entry, found ${background3dEntries.length}`);
    } else {
      const background3dKeys = staticClosure(background3dEntries[0]);
      const background3dSize = measure(background3dKeys);
      checkBudget("BG3D editor activation", background3dSize, budgets.bg3dEditor);
      if (background3dKeys.size > budgets.bg3dEditor.chunks) {
        fail(
          `BG3D editor activation uses ${background3dKeys.size} static JS requests `
            + `(budget ${budgets.bg3dEditor.chunks})`,
        );
      }
      checkDynamicBoundary(
        "optional BG3D shot-batch runtime",
        /src\/domains\/creator\/studio-bg3d-shot-batch-runtime\.ts/,
        background3dKeys,
      );
      const shotBatchRuntimeEntries = matchingManifestEntries(
        /src\/domains\/creator\/studio-bg3d-shot-batch-runtime\.ts/,
      ).filter((key) => manifest[key].isDynamicEntry === true);
      if (shotBatchRuntimeEntries.length !== 1) {
        fail(`expected one BG3D shot-batch runtime entry, found ${shotBatchRuntimeEntries.length}`);
      } else {
        const shotBatchRuntimeEntry = shotBatchRuntimeEntries[0];
        const editorDynamicTargets = dynamicTargetsFromStaticClosure(background3dEntries[0]);
        if (!editorDynamicTargets.has(shotBatchRuntimeEntry)) {
          fail("BG3D shot-batch runtime introduced a nested dynamic-import waterfall");
        }
        const runtimeIncrementalKeys = new Set(
          [...staticClosure(shotBatchRuntimeEntry)].filter((key) => !background3dKeys.has(key)),
        );
        checkBudget(
          "BG3D shot-batch runtime after editor",
          measure(runtimeIncrementalKeys),
          budgets.bg3dShotBatchRuntime,
        );
        if (runtimeIncrementalKeys.size > budgets.bg3dShotBatchRuntime.chunks) {
          fail(
            `BG3D shot-batch runtime after editor uses ${runtimeIncrementalKeys.size} static JS requests `
              + `(budget ${budgets.bg3dShotBatchRuntime.chunks})`,
          );
        }
      }
      const eagerShotBatchProductionRuntime = matchingEntries(
        background3dKeys,
        /(?:_studio-bg3d-shot-batch-|studio-bg3d-file-integrity|studio-package-archive|studio-bg3d-shot-batch-(?:artifact-integrity|archive-verifier|download-gate|plan|queue|recovery-store|worker-client))/,
      ).filter((key) => !/shot-batch-(?:limits|pass-catalog|runtime)/.test(key));
      if (eagerShotBatchProductionRuntime.length > 0) {
        fail(
          "optional BG3D shot-batch verification/archive runtime returned to the editor static graph: "
            + eagerShotBatchProductionRuntime.join(", "),
        );
      }
      const eagerPhysicsRuntime = matchingEntries(
        background3dKeys,
        /(?:studio-bg3d-physics-worker-client|node_modules.*rapier3d)/,
      );
      if (eagerPhysicsRuntime.length > 0) {
        fail(
          `optional BG3D physics runtime returned to the 3D editor static graph: ${eagerPhysicsRuntime.join(", ")}`,
        );
      }
      const eagerPsdRuntime = matchingEntries(
        background3dKeys,
        /(?:src\/domains\/creator\/studio-bg3d-shot-psd\.ts|node_modules.*ag-psd)/,
      );
      if (eagerPsdRuntime.length > 0) {
        fail(
          `optional BG3D PSD writer returned to the 3D editor static graph: ${eagerPsdRuntime.join(", ")}`,
        );
      }
      const eagerContactSheetRuntime = matchingEntries(
        background3dKeys,
        /src\/domains\/creator\/studio-bg3d-shot-contact-sheet\.ts/,
      );
      if (eagerContactSheetRuntime.length > 0) {
        fail(
          `optional BG3D contact-sheet compositor returned to the editor static graph: ${eagerContactSheetRuntime.join(", ")}`,
        );
      }
      checkDynamicBoundary(
        "optional BG3D physics runtime",
        /src\/domains\/creator\/studio-bg3d-physics-worker-client\.ts/,
        background3dKeys,
      );
    }

    const pngWorkerFiles = fs.readdirSync(path.join(outputDirectory, "assets"))
      .filter((file) => /^studio-bg3d-shot-png\.worker-[A-Za-z0-9_-]+\.js$/u.test(file));
    if (pngWorkerFiles.length !== 1) {
      fail(`expected one isolated BG3D pass-PNG Worker asset, found ${pngWorkerFiles.length}`);
    } else {
      const bytes = fs.readFileSync(path.join(outputDirectory, "assets", pngWorkerFiles[0]));
      checkBudget("BG3D pass-PNG Worker", {
        raw: bytes.byteLength,
        gzip: gzipSync(bytes).byteLength,
      }, budgets.bg3dShotPngWorker);
    }

    const contactSheetWorkerFiles = fs.readdirSync(path.join(outputDirectory, "assets"))
      .filter((file) => /^studio-bg3d-shot-contact-sheet\.worker-[A-Za-z0-9_-]+\.js$/u.test(file));
    if (contactSheetWorkerFiles.length !== 1) {
      fail(`expected one isolated BG3D contact-sheet Worker asset, found ${contactSheetWorkerFiles.length}`);
    } else {
      const bytes = fs.readFileSync(path.join(outputDirectory, "assets", contactSheetWorkerFiles[0]));
      checkBudget("BG3D contact-sheet Worker", {
        raw: bytes.byteLength,
        gzip: gzipSync(bytes).byteLength,
      }, budgets.bg3dContactSheetWorker);
    }

    const objWorkerFiles = fs.readdirSync(path.join(outputDirectory, "assets"))
      .filter((file) => /^studio-bg3d-obj\.worker-[A-Za-z0-9_-]+\.js$/u.test(file));
    if (objWorkerFiles.length !== 1) {
      fail(`expected one isolated BG3D OBJ Worker asset, found ${objWorkerFiles.length}`);
    } else {
      const bytes = fs.readFileSync(path.join(outputDirectory, "assets", objWorkerFiles[0]));
      checkBudget("BG3D OBJ Worker", {
        raw: bytes.byteLength,
        gzip: gzipSync(bytes).byteLength,
      }, budgets.bg3dObjWorker);
    }

    const psdWorkerFiles = fs.readdirSync(path.join(outputDirectory, "assets"))
      .filter((file) => /^studio-bg3d-shot-psd\.worker-[A-Za-z0-9_-]+\.js$/u.test(file));
    if (psdWorkerFiles.length !== 1) {
      fail(`expected one isolated BG3D PSD Worker asset, found ${psdWorkerFiles.length}`);
    } else {
      const bytes = fs.readFileSync(path.join(outputDirectory, "assets", psdWorkerFiles[0]));
      checkBudget("BG3D PSD Worker", {
        raw: bytes.byteLength,
        gzip: gzipSync(bytes).byteLength,
      }, budgets.bg3dPsdWorker);
    }

    const physicsWorkerFiles = fs.readdirSync(path.join(outputDirectory, "assets"))
      .filter((file) => /^studio-bg3d-physics\.worker-[A-Za-z0-9_-]+\.js$/u.test(file));
    if (physicsWorkerFiles.length !== 1) {
      fail(`expected one isolated BG3D physics Worker asset, found ${physicsWorkerFiles.length}`);
    } else {
      const bytes = fs.readFileSync(path.join(outputDirectory, "assets", physicsWorkerFiles[0]));
      checkBudget("BG3D physics Worker", {
        raw: bytes.byteLength,
        gzip: gzipSync(bytes).byteLength,
      }, budgets.bg3dPhysicsWorker);
    }

    const eagerWebglIntro = matchingEntries(appKeys, /(?:IntroSplash|three\.module)/);
    if (eagerWebglIntro.length > 0) {
      fail(`optional WebGL intro returned to the app entry: ${eagerWebglIntro.join(", ")}`);
    }

    if (!process.exitCode) {
      console.log(
        `studio bundle check passed: Studio ${studioKeys.size} chunks, ${describe(studioSize.raw)} raw / ${describe(studioSize.gzip)} gzip; `
          + `StudioPage ${describe(studioEntrySize.raw)} raw / ${describe(studioEntrySize.gzip)} gzip; `
          + `after app shell ${studioIncrementalKeys.size} chunks, ${describe(studioIncrementalSize.raw)} raw / ${describe(studioIncrementalSize.gzip)} gzip; `
          + `app ${appKeys.size} chunks, ${describe(appSize.raw)} raw / ${describe(appSize.gzip)} gzip`,
      );
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

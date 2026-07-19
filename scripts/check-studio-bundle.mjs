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
  studio: { raw: 2_698_000, gzip: 882_500 },
  studioEntry: { raw: 1_284_000, gzip: 384_500 },
  studioIncremental: { raw: 2_278_000, gzip: 738_000, chunks: 131 },
  // Rapier deterministic compat is intentionally isolated in a user-triggered module Worker.
  // 2026-07-18 production output: 2,302,139 raw / 855,399 gzip. Keep ~2% version-drift headroom
  // without charging this optional engine to Studio or the 3D editor's initial graph.
  bg3dPhysicsWorker: { raw: 2_350_000, gzip: 875_000 },
  // 2026-07-19 selected-shot/multi-pass/recovery UI baseline. This is the complete static closure
  // activated only after the user opens StudioBackground3D; PSD/physics/engine labs stay isolated.
  bg3dEditor: { raw: 2_380_000, gzip: 690_000, chunks: 40 },
  // ag-psd is intentionally reachable only through the bounded per-shot PSD module Worker.
  bg3dPsdWorker: { raw: 1_250_000, gzip: 360_000 },
  // OffscreenCanvas/createImageBitmap contact-sheet compositor, isolated from the editor graph.
  bg3dContactSheetWorker: { raw: 80_000, gzip: 25_000 },
  // Measured after the same build: 443,257 raw / 143,956 gzip.
  app: { raw: 500_000, gzip: 170_000 },
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

    const optionalUiBoundaries = [
      ["optional workspace manager", /src\/domains\/creator\/StudioWorkspaceMenu\.tsx/],
      ["optional color palette", /src\/domains\/creator\/StudioColorPalettePanel\.tsx/],
      ["optional flood fill panel", /src\/domains\/creator\/StudioFloodFillPanel\.tsx/],
      ["optional palette library", /src\/domains\/creator\/StudioPaletteLibraryPanel\.tsx/],
      ["optional panel split tool", /src\/domains\/creator\/StudioPanelSplitTool\.tsx/],
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

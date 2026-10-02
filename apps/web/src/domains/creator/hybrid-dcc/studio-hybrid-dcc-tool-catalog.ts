/**
 * 정밀 3D 모델링 작업대의 도구 목록.
 *
 * 작업 모드별 추천 도구(`buildStudioHybridDccQuickTools`)와 엔진의 모든 도구
 * (`buildStudioHybridDccExpertToolGroups`)를 한곳에서 정의한다. 쉬운 이름·설명과 누를 때 실행할 커널
 * 함수를 묶기만 하고, 작업 공간 상태·선택·실행 큐는 `StudioHybridDccPanel`이 소유해 컨텍스트로 넘긴다
 * (이 모듈은 React 상태를 직접 바꾸지 않는다).
 */
import { workspaceAddActiveModifier } from "./studio-hybrid-dcc-modifier-workspace";
import { workspaceLoadEditableRoomPreset } from "./studio-hybrid-dcc-room-workspace";
import {
  runStudioHybridDccFullEngineSuite,
  workspaceAddArtistInk,
  workspaceAddGeoNodesPrimitive,
  workspaceAddGeoNodesStarter,
  workspaceAddUnitCube,
  workspaceBevelEdgesActive,
  workspaceBendActive,
  workspaceBooleanDifference,
  workspaceCadProp,
  workspaceCadRevolve,
  workspaceClothStep,
  workspaceCollabJoin,
  workspaceDecimateActive,
  workspaceDeleteActive,
  workspaceDuplicateActive,
  workspaceDynatopoActive,
  workspaceEnsureShots,
  workspaceExportActiveMesh,
  workspaceExportToon3d,
  workspaceExtrudeActive,
  workspaceExtrudeRegionActive,
  workspaceInsetActive,
  workspaceKnifeActive,
  workspaceLoopCutActive,
  workspaceOrientOutwardActive,
  workspaceImportIfcCity,
  workspaceManifoldBooleanActive,
  workspaceOcctBooleanCut,
  workspaceOcctBox,
  workspaceOcctFillet,
  workspaceOcctLoft,
  workspaceOcctRevolve,
  workspaceOcctSphere,
  workspaceBooleanBetweenAssets,
  workspaceOcctCircularPattern,
  workspaceOcctDraftPrism,
  workspaceOcctFillet2dExtrude,
  workspaceOcctLinearPattern,
  workspaceOcctMirror,
  workspaceOcctOffsetShape,
  workspaceOcctPipe,
  workspaceOcctPipeShell,
  workspaceOcctSection,
  workspaceOcctStepRoundTrip,
  workspaceOcctThickShell,
  workspaceOcctTorus,
  workspaceOcctWedge,
  workspaceOpenNurbsSphere,
  workspaceRebuildBom,
  workspaceRedo,
  workspaceRepairActive,
  workspaceRetopoActive,
  workspaceShadeActive,
  workspaceSculptActive,
  workspaceSubdivideActive,
  workspaceUndo,
  workspaceUvUnwrapActive,
  workspaceVoxelRemeshActive,
  workspaceWeldActive,
} from "./studio-hybrid-dcc-workspace";

import type { StudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import type { StudioSculptBrushKind } from "./studio-hybrid-sculpt-kernel";
import type {
  StudioHybridDccExpertToolGroup,
  StudioHybridDccQuickTool,
} from "./StudioHybridDccWorkbenchChrome";
import type { StudioDccWorkbenchMode } from "../studio-workspace-route";

type BilingualFn = (ko: string, en: string) => string;

/** 도구가 작업 공간을 바꾼 결과. 선택을 함께 바꿔야 하는 도구(되돌리기 등)만 `selection`을 채운다. */
export interface StudioHybridDccRunResult {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection?: StudioHybridDccComponentSelection;
}

type StudioHybridDccRunnable =
  | StudioHybridDccWorkspace
  | StudioHybridDccRunResult
  | Promise<StudioHybridDccWorkspace | StudioHybridDccRunResult>;

export const STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS: Readonly<Record<StudioSculptBrushKind, readonly [ko: string, en: string]>> =
  Object.freeze({
    grab: ["잡아당기기", "Grab"],
    smooth: ["매끈하게", "Smooth"],
    inflate: ["부풀리기", "Inflate"],
    clay: ["점토", "Clay"],
    crease: ["접힘", "Crease"],
    flatten: ["평평하게", "Flatten"],
    scrape: ["긁어내기", "Scrape"],
    snakeHook: ["스네이크 훅", "Snake hook"],
  });

/** 도구 목록이 필요로 하는 것: 현재 작업 공간·선택, 실행 큐, 그리고 몇 가지 화면 동작. */
export interface StudioHybridDccToolContext {
  readonly bt: BilingualFn;
  readonly ws: StudioHybridDccWorkspace;
  readonly componentSelection: StudioHybridDccComponentSelection;
  /** 선택한 면·모서리를 풀어 준다. 선택이 알맞지 않으면 사람이 읽을 수 있는 오류를 던진다. */
  readonly resolveSelectedFaces: () => readonly number[];
  readonly resolveSelectedEdge: () => number;
  readonly resolveSelectedEdges: () => readonly number[];
  readonly run: (label: string, fn: () => StudioHybridDccRunnable) => Promise<void>;
  readonly runModifier: (label: string, fn: () => StudioHybridDccWorkspace | Promise<StudioHybridDccWorkspace>) => void;
  readonly setLog: (message: string) => void;
  readonly pickImportFile: () => void;
  readonly canOpenInBackground3d: boolean;
  readonly openInBackground3d: () => Promise<void>;
  readonly sculpt: { readonly kind: StudioSculptBrushKind; readonly dig: boolean };
}

/** 지금 작업 모드에서 가장 먼저 눌러 볼 추천 도구. */
export function buildStudioHybridDccQuickTools(
  workbenchMode: StudioDccWorkbenchMode,
  context: StudioHybridDccToolContext,
): readonly StudioHybridDccQuickTool[] {
  const {
    bt,
    ws,
    componentSelection,
    resolveSelectedFaces,
    resolveSelectedEdge,
    resolveSelectedEdges,
    run,
    runModifier,
    setLog,
    pickImportFile,
    canOpenInBackground3d,
    openInBackground3d,
  } = context;
  const { kind: sculptBrushKind, dig: sculptDig } = context.sculpt;
  const sculptBrushName = bt(
    STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[sculptBrushKind][0],
    STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[sculptBrushKind][1],
  );

  return workbenchMode === "model" ? [
    {
      label: bt("큐브 추가", "Add cube"),
      technical: "Primitive",
      description: bt("기본 상자로 형태를 시작합니다.", "Start from a basic box."),
      onClick: () => { void run("큐브 추가", () => workspaceAddUnitCube(ws)); },
    },
    {
      label: bt("선택 복제", "Duplicate"),
      technical: "Duplicate",
      description: bt("옆에 편집 가능한 복사본을 만듭니다.", "Make an editable copy beside it."),
      requiresAsset: true,
      onClick: () => { void run("오브젝트 복제", () => workspaceDuplicateActive(ws)); },
    },
    {
      label: bt("선택 삭제", "Delete"),
      technical: "Delete",
      description: bt("지워도 되돌리기로 복구됩니다.", "Undo brings it back."),
      requiresAsset: true,
      onClick: () => { void run("오브젝트 삭제", () => workspaceDeleteActive(ws)); },
    },
    {
      label: bt("면 밀어내기", "Extrude face"),
      technical: "Extrude",
      description: bt("면을 뽑아 형태를 늘립니다.", "Pull a face out to grow the shape."),
      requiresAsset: true,
      onClick: () => {
        void run("면 밀어내기", () => {
          const faceIds = resolveSelectedFaces();
          return componentSelection.mode === "face"
            ? workspaceExtrudeRegionActive(ws, componentSelection, 0.25)
            : workspaceExtrudeActive(ws, 0.25, faceIds);
        });
      },
    },
    {
      label: bt("모서리 둥글리기", "Round edges"),
      technical: "Bevel",
      description: bt("날카로운 모서리를 깎아 부드럽게.", "Soften sharp edges."),
      requiresAsset: true,
      onClick: () => {
        void run("모서리 둥글리기", () => workspaceBevelEdgesActive(ws, 0.12, resolveSelectedEdges()));
      },
    },
    {
      label: bt("면 안쪽 테두리", "Inset face"),
      technical: "Inset",
      description: bt("창·패널용 안쪽 면을 만듭니다.", "Add an inner face for windows or panels."),
      requiresAsset: true,
      onClick: () => {
        void run("면 안쪽 테두리", () => workspaceInsetActive(ws, 0.2, resolveSelectedFaces()));
      },
    },
    {
      label: bt("가운데 절단선", "Loop cut"),
      technical: "Loop cut",
      description: bt("면 흐름에 새 절단선을 넣습니다.", "Add a new cut across the faces."),
      requiresAsset: true,
      onClick: () => {
        void run("가운데 절단선", () => workspaceLoopCutActive(ws, 0.5, resolveSelectedEdge()));
      },
    },
    {
      label: bt("좌우 대칭", "Mirror"),
      technical: "Mirror · non-destructive",
      description: bt("원본은 두고 반대편을 미리 봅니다.", "Preview the other half; the original stays."),
      requiresAsset: true,
      onClick: () => runModifier("비파괴 좌우 대칭", () => workspaceAddActiveModifier(ws, "mirror")),
    },
    {
      label: bt("두께 만들기", "Add thickness"),
      technical: "Solidify · non-destructive",
      description: bt("얇은 면에 두께를 줍니다.", "Give thin surfaces depth."),
      requiresAsset: true,
      onClick: () => runModifier("비파괴 두께", () => workspaceAddActiveModifier(ws, "solidify")),
    },
    {
      label: bt("메시 자동 정리", "Auto repair"),
      technical: "Repair",
      description: bt("깨진 면과 중복을 고칩니다.", "Fix broken and duplicate faces."),
      requiresAsset: true,
      onClick: () => { void run("메시 자동 정리", () => workspaceRepairActive(ws)); },
    },
    {
      label: bt("겹친 점 합치기", "Merge points"),
      technical: "Merge by distance",
      description: bt("미세한 틈과 중복 점을 메웁니다.", "Close tiny gaps and duplicate points."),
      requiresAsset: true,
      onClick: () => { void run("겹친 점 합치기", () => workspaceWeldActive(ws)); },
    },
    {
      label: bt("모델 가져오기", "Import model"),
      technical: "Import",
      description: bt("GLB·OBJ·FBX·VRM·STEP 파일을 엽니다.", "Open GLB, OBJ, FBX, VRM or STEP files."),
      onClick: () => pickImportFile(),
    },
  ] : workbenchMode === "build" ? [
    {
      label: bt("교실 세트 만들기", "Classroom set"),
      technical: "Room preset",
      description: bt("벽·창문·가구를 따로 움직이는 교실.", "Walls, windows and desks you can move."),
      onClick: () => { void run("편집 가능한 교실 세트", () => workspaceLoadEditableRoomPreset(ws, "classroom")); },
    },
    {
      label: bt("IFC 건물 불러오기", "IFC building"),
      technical: "IFC",
      description: bt("건축 데이터를 장면으로 바꿉니다.", "Turn architecture data into a scene."),
      onClick: () => { void run("IFC 건물", () => workspaceImportIfcCity(ws)); },
    },
    {
      label: bt("절차형 배경 시작", "Procedural set"),
      technical: "Geometry Nodes",
      description: bt("반복 구조를 노드로 빠르게.", "Repeat structures quickly with nodes."),
      onClick: () => { void run("절차형 배경", () => workspaceAddGeoNodesStarter(ws)); },
    },
    {
      label: bt("8개 카메라 컷", "8 camera shots"),
      technical: "Shot set",
      description: bt("한 배경을 여러 구도로 씁니다.", "Reuse one set from many angles."),
      onClick: () => { void run("8개 카메라 컷", () => workspaceEnsureShots(ws, 8)); },
    },
    {
      label: bt("부품 목록 만들기", "Parts list"),
      technical: "BOM",
      description: bt("소품과 권리 정보를 정리합니다.", "List props and their rights."),
      onClick: () => { void run("부품 목록", () => workspaceRebuildBom(ws)); },
    },
  ] : workbenchMode === "cad" ? [
    {
      label: bt("정밀 박스", "Precise box"),
      technical: "OCCT Box",
      description: bt("치수가 정확한 상자를 만듭니다.", "A box with exact dimensions."),
      onClick: () => { void run("정밀 박스", () => workspaceOcctBox(ws)); },
    },
    {
      label: bt("정밀 구", "Precise sphere"),
      technical: "OCCT Sphere",
      description: bt("곡면이 정확한 구를 만듭니다.", "A sphere with exact curves."),
      onClick: () => { void run("정밀 구", () => workspaceOcctSphere(ws)); },
    },
    {
      label: bt("구멍 빼기", "Cut a hole"),
      technical: "Boolean Cut",
      description: bt("솔리드에 구멍이나 홈을 팝니다.", "Cut holes or grooves into a solid."),
      onClick: () => { void run("구멍 빼기", () => workspaceOcctBooleanCut(ws)); },
    },
    {
      label: bt("모서리 라운드", "Fillet"),
      technical: "Fillet",
      description: bt("모서리에 반지름을 줍니다.", "Round edges by a radius."),
      onClick: () => { void run("모서리 라운드", () => workspaceOcctFillet(ws)); },
    },
    {
      label: bt("단면 회전", "Revolve"),
      technical: "Revolve",
      description: bt("단면을 돌려 병·기둥을 만듭니다.", "Spin a profile into a vase or pillar."),
      onClick: () => { void run("단면 회전", () => workspaceOcctRevolve(ws)); },
    },
    {
      label: bt("파이프 만들기", "Pipe"),
      technical: "Pipe",
      description: bt("경로를 따라 관·손잡이를 만듭니다.", "Tubes and handles along a path."),
      onClick: () => { void run("파이프", () => workspaceOcctPipe(ws)); },
    },
    {
      label: bt("속 비우기", "Hollow out"),
      technical: "Thick shell",
      description: bt("일정한 벽 두께로 속을 비웁니다.", "Hollow it with even walls."),
      onClick: () => { void run("속 비우기", () => workspaceOcctThickShell(ws)); },
    },
    {
      label: bt("STEP 왕복 점검", "STEP check"),
      technical: "STEP",
      description: bt("CAD 형식으로 저장·재읽기 점검.", "Save and reload as STEP to check losses."),
      onClick: () => { void run("STEP 왕복", () => workspaceOcctStepRoundTrip(ws)); },
    },
  ] : workbenchMode === "sculpt" ? [
    {
      label: `${bt("브러시 조형", "Sculpt")} · ${sculptBrushName}${sculptDig ? ` (${bt("깎기", "carve")})` : ""}`,
      technical: `${sculptBrushKind} · experimental`,
      description: bt("고른 브러시로 오브젝트 중심을 빚습니다.", "Shape the object's center with the chosen brush."),
      requiresAsset: true,
      primary: true,
      onClick: () => {
        void run("브러시 조형", () => workspaceSculptActive(ws, {
          kind: sculptBrushKind,
          strength: sculptDig ? -0.25 : 0.25,
        }));
      },
    },
    {
      label: bt("필요한 곳만 세분화", "Refine detail"),
      technical: "Dyntopo",
      description: bt("브러시 주변에만 면을 더합니다.", "Add faces only near the brush."),
      requiresAsset: true,
      onClick: () => { void run("동적 세분화", () => workspaceDynatopoActive(ws, "refine")); },
    },
    {
      label: bt("복셀 리메시", "Voxel remesh"),
      technical: "Voxel remesh",
      description: bt("표면을 고른 밀도로 다시 만듭니다.", "Rebuild an even, closed surface."),
      requiresAsset: true,
      onClick: () => { void run("복셀 리메시", () => workspaceVoxelRemeshActive(ws)); },
    },
    {
      label: bt("편집용 면 정리", "Retopology"),
      technical: "Retopology",
      description: bt("적은 면으로 다시 정리합니다.", "Rebuild with fewer, cleaner faces."),
      requiresAsset: true,
      onClick: () => { void run("리토폴로지", () => workspaceRetopoActive(ws, 8)); },
    },
    {
      label: bt("부드럽게 세분화", "Smooth subdivide"),
      technical: "Subdivision",
      description: bt("표면을 한 단계 부드럽게.", "One level smoother."),
      requiresAsset: true,
      onClick: () => { void run("부드럽게 세분화", () => workspaceSubdivideActive(ws, 1)); },
    },
    {
      label: bt("휘기", "Bend"),
      technical: "Bend",
      description: bt("곡선 방향으로 휘어 실루엣을 만듭니다.", "Bend along a curve for a silhouette."),
      requiresAsset: true,
      onClick: () => { void run("휘기", () => workspaceBendActive(ws)); },
    },
  ] : workbenchMode === "material" ? [
    {
      label: bt("UV 자동 펼치기", "Auto UV unwrap"),
      technical: "UV unwrap",
      description: bt("텍스처 좌표를 자동으로 만듭니다.", "Create texture coordinates automatically."),
      requiresAsset: true,
      onClick: () => { void run("UV 자동 펼치기", () => workspaceUvUnwrapActive(ws)); },
    },
    {
      label: bt("겉면 방향 맞추기", "Fix face direction"),
      technical: "Recalculate normals",
      description: bt("뒤집힌 면을 바깥쪽으로 맞춥니다.", "Turn flipped faces outward."),
      requiresAsset: true,
      onClick: () => { void run("겉면 방향", () => workspaceOrientOutwardActive(ws)); },
    },
    {
      label: bt("부드러운 음영", "Smooth shading"),
      technical: "Shade smooth",
      description: bt("곡면을 매끈하게 보이게 합니다.", "Make curved surfaces look smooth."),
      requiresAsset: true,
      onClick: () => { void run("부드러운 음영", () => workspaceShadeActive(ws, true)); },
    },
    {
      label: bt("단단한 면 음영", "Flat shading"),
      technical: "Shade flat",
      description: bt("모서리를 또렷하게 보이게 합니다.", "Keep hard edges crisp."),
      requiresAsset: true,
      onClick: () => { void run("단단한 면 음영", () => workspaceShadeActive(ws, false)); },
    },
    {
      label: bt("가볍게 만들기", "Reduce faces"),
      technical: "Decimate",
      description: bt("모양은 두고 면 수를 절반으로.", "Half the faces, same silhouette."),
      requiresAsset: true,
      onClick: () => { void run("메시 경량화", () => workspaceDecimateActive(ws, 0.5)); },
    },
    {
      label: bt("OBJ 내보내기 점검", "OBJ export check"),
      technical: "OBJ export",
      description: bt("OBJ로 바꾸고 손실을 보고합니다.", "Convert to OBJ with a loss report."),
      requiresAsset: true,
      onClick: () => { void run("OBJ 내보내기", () => workspaceExportActiveMesh(ws, "obj")); },
    },
  ] : [
    {
      label: bt("8개 카메라 컷", "8 camera shots"),
      technical: "Shot set",
      description: bt("한 장면을 여러 구도로 씁니다.", "Reuse one scene from many angles."),
      onClick: () => { void run("8개 카메라 컷", () => workspaceEnsureShots(ws, 8)); },
    },
    {
      label: bt("작가 선 보존 테스트", "Keep artist lines"),
      technical: "Artist delta",
      description: bt("3D가 바뀌어도 손으로 고친 선을 지킵니다.", "Hand-drawn fixes survive 3D edits."),
      requiresAsset: true,
      onClick: () => { void run("작가 선 보존", () => workspaceAddArtistInk(ws, "shot-1")); },
    },
    {
      label: bt("3D 배경 편집기로 열기", "Open in 3D background editor"),
      technical: "Verified GLB handoff",
      description: bt("검증된 GLB로 바꿔 컷 편집기에 엽니다.", "Verify as GLB and open it in the panel editor."),
      requiresAsset: true,
      primary: true,
      disabled: !canOpenInBackground3d,
      onClick: () => { void openInBackground3d(); },
    },
    {
      label: bt(".toon3d 작업 파일", ".toon3d package"),
      technical: "Authoring package",
      description: bt("다시 편집할 수 있게 묶습니다.", "Bundle everything for later editing."),
      onClick: () => {
        const pkg = workspaceExportToon3d(ws);
        setLog(`.toon3d 준비 완료 · ${Object.keys(pkg.files).length}개 파일 · ${pkg.manifest.packageHash.slice(0, 18)}…`);
      },
    },
  ];
}

/** 엔진의 모든 도구. 업계 용어를 아는 사람을 위해 분류별로 묶어 접어 두는 목록이다. */
export function buildStudioHybridDccExpertToolGroups(
  context: StudioHybridDccToolContext,
): readonly StudioHybridDccExpertToolGroup[] {
  const {
    bt,
    ws,
    componentSelection,
    resolveSelectedFaces,
    run,
    runModifier,
    setLog,
    pickImportFile,
    canOpenInBackground3d,
    openInBackground3d,
  } = context;
  return [
    {
      id: "create",
      title: bt("만들기·불러오기", "Create & import"),
      tools: [
        { name: "Add cube", hint: bt("큐브 하나 추가", "Add one cube"), onClick: () => { void run("Add cube", () => workspaceAddUnitCube(ws)); } },
        { name: "Geo sphere", hint: bt("노드로 만든 구", "Node-built sphere"), onClick: () => { void run("Geo sphere", () => workspaceAddGeoNodesPrimitive(ws, "sphere")); } },
        { name: "Geo starter", hint: bt("절차형 노드 예제", "Procedural node starter"), onClick: () => { void run("Geo starter", () => workspaceAddGeoNodesStarter(ws)); } },
        { name: "Room", hint: bt("편집 가능한 교실 세트", "Editable classroom set"), onClick: () => { void run("Room", () => workspaceLoadEditableRoomPreset(ws, "classroom")); } },
        { name: "IFC city", hint: bt("IFC 건물 예제", "IFC building sample"), action: "ifc-city", onClick: () => { void run("IFC city", () => workspaceImportIfcCity(ws)); } },
        { name: "CAD prop", hint: bt("CAD 소품 예제", "CAD prop sample"), onClick: () => { void run("CAD prop", () => workspaceCadProp(ws)); } },
        { name: "Import mesh…", hint: bt("3D 파일 가져오기", "Import a 3D file"), onClick: () => pickImportFile() },
      ],
    },
    {
      id: "cad",
      title: bt("정밀 CAD · OpenCascade", "Precise CAD · OpenCascade"),
      tools: [
        { name: "OCCT box", hint: bt("정밀 상자", "Precise box"), action: "occt-box", onClick: () => { void run("OCCT box", () => workspaceOcctBox(ws)); } },
        { name: "OCCT sphere", hint: bt("정밀 구", "Precise sphere"), action: "occt-sphere", onClick: () => { void run("OCCT sphere", () => workspaceOcctSphere(ws)); } },
        { name: "OCCT torus", hint: bt("도넛 모양", "Torus"), action: "occt-torus", onClick: () => { void run("OCCT torus", () => workspaceOcctTorus(ws)); } },
        { name: "OCCT wedge", hint: bt("쐐기 모양", "Wedge"), action: "occt-wedge", onClick: () => { void run("OCCT wedge", () => workspaceOcctWedge(ws)); } },
        { name: "CAD revolve", hint: bt("간이 단면 회전", "Quick revolve"), onClick: () => { void run("CAD revolve", () => workspaceCadRevolve(ws)); } },
        { name: "OCCT revolve", hint: bt("단면 회전", "Revolve a profile"), action: "occt-revolve", onClick: () => { void run("OCCT revolve", () => workspaceOcctRevolve(ws)); } },
        { name: "OCCT loft", hint: bt("단면 잇기", "Loft between profiles"), action: "occt-loft", onClick: () => { void run("OCCT loft", () => workspaceOcctLoft(ws)); } },
        { name: "OCCT pipe", hint: bt("경로 따라 관", "Pipe along a path"), action: "occt-pipe", onClick: () => { void run("OCCT pipe", () => workspaceOcctPipe(ws)); } },
        { name: "OCCT pipe shell", hint: bt("관 껍질", "Pipe shell"), action: "occt-pipeshell", onClick: () => { void run("OCCT pipe shell", () => workspaceOcctPipeShell(ws)); } },
        { name: "OCCT fillet", hint: bt("모서리 라운드", "Fillet edges"), action: "occt-fillet", onClick: () => { void run("OCCT fillet", () => workspaceOcctFillet(ws)); } },
        { name: "OCCT fillet2d", hint: bt("둥근 윤곽 돌출", "Rounded outline extrude"), action: "occt-fillet2d", onClick: () => { void run("OCCT fillet2d extrude", () => workspaceOcctFillet2dExtrude(ws)); } },
        { name: "OCCT thick", hint: bt("속 비우기", "Hollow shell"), action: "occt-thick", onClick: () => { void run("OCCT thick shell", () => workspaceOcctThickShell(ws)); } },
        { name: "OCCT offset", hint: bt("표면 띄우기", "Offset surface"), action: "occt-offset", onClick: () => { void run("OCCT offset", () => workspaceOcctOffsetShape(ws)); } },
        { name: "OCCT mirror", hint: bt("대칭 복사", "Mirror copy"), action: "occt-mirror", onClick: () => { void run("OCCT mirror", () => workspaceOcctMirror(ws)); } },
        { name: "OCCT boolean", hint: bt("구멍 빼기", "Cut a hole"), action: "occt-cut", onClick: () => { void run("OCCT cut", () => workspaceOcctBooleanCut(ws)); } },
        {
          name: "Boolean 2 assets",
          hint: bt("두 물체 빼기", "Subtract two objects"),
          action: "boolean-two-assets",
          onClick: () => {
            void run("Boolean two assets", async () => {
              let next = workspaceAddUnitCube(ws);
              next = await workspaceOcctBox(next, "occt-cutter", [0.6, 0.6, 0.6]);
              const ids = Object.keys(next.session.state.geometry.records);
              const left = ids.find((id) => id !== "occt-cutter") ?? ids[0]!;
              return workspaceBooleanBetweenAssets(next, left, "occt-cutter", "difference");
            });
          },
        },
        { name: "OCCT section", hint: bt("단면 자르기", "Section cut"), action: "occt-section", onClick: () => { void run("OCCT section", () => workspaceOcctSection(ws)); } },
        { name: "OCCT draft prism", hint: bt("기울어진 돌출", "Drafted extrude"), action: "occt-dprism", onClick: () => { void run("OCCT draft prism", () => workspaceOcctDraftPrism(ws)); } },
        { name: "OCCT pattern", hint: bt("직선 배열", "Linear pattern"), action: "occt-pattern", onClick: () => { void run("OCCT linear pattern", () => workspaceOcctLinearPattern(ws)); } },
        { name: "OCCT circular", hint: bt("원형 배열", "Circular pattern"), action: "occt-circular", onClick: () => { void run("OCCT circular pattern", () => workspaceOcctCircularPattern(ws)); } },
        { name: "OCCT STEP", hint: bt("STEP 저장·재읽기", "STEP round trip"), action: "occt-step", onClick: () => { void run("OCCT STEP round-trip", () => workspaceOcctStepRoundTrip(ws)); } },
        { name: "openNURBS sphere", hint: bt("NURBS 곡면 구", "NURBS sphere"), action: "opennurbs-sphere", onClick: () => { void run("openNURBS sphere", () => workspaceOpenNurbsSphere(ws)); } },
      ],
    },
    {
      id: "mesh",
      title: bt("메시 편집", "Mesh editing"),
      tools: [
        {
          name: "Extrude",
          hint: bt("면 밀어내기", "Extrude faces"),
          requiresAsset: true,
          onClick: () => {
            void run("Extrude", () => {
              const faceIds = resolveSelectedFaces();
              return componentSelection.mode === "face"
                ? workspaceExtrudeRegionActive(ws, componentSelection, 0.25)
                : workspaceExtrudeActive(ws, 0.25, faceIds);
            });
          },
        },
        { name: "Knife", hint: bt("칼로 자르기", "Knife cut"), requiresAsset: true, onClick: () => { void run("Knife", () => workspaceKnifeActive(ws)); } },
        { name: "Boolean −", hint: bt("겹친 부분 빼기", "Subtract overlap"), requiresAsset: true, onClick: () => { void run("Boolean", () => workspaceBooleanDifference(ws)); } },
        { name: "Manifold boolean", hint: bt("닫힌 메시 불리언", "Manifold boolean"), requiresAsset: true, action: "manifold-boolean", onClick: () => { void run("Manifold boolean", () => workspaceManifoldBooleanActive(ws)); } },
        { name: "Mirror", hint: bt("비파괴 대칭", "Non-destructive mirror"), requiresAsset: true, onClick: () => runModifier("Mirror 변형 추가", () => workspaceAddActiveModifier(ws, "mirror")) },
        { name: "Array", hint: bt("반복 배열", "Array copies"), requiresAsset: true, onClick: () => runModifier("Array 변형 추가", () => workspaceAddActiveModifier(ws, "array")) },
        { name: "Solidify", hint: bt("비파괴 두께", "Non-destructive thickness"), requiresAsset: true, onClick: () => runModifier("Solidify 변형 추가", () => workspaceAddActiveModifier(ws, "solidify")) },
        { name: "Subdiv", hint: bt("한 단계 세분화", "Subdivide once"), requiresAsset: true, onClick: () => { void run("Subdiv", () => workspaceSubdivideActive(ws, 1)); } },
        { name: "Decimate", hint: bt("면 수 줄이기", "Reduce faces"), requiresAsset: true, onClick: () => { void run("Decimate", () => workspaceDecimateActive(ws, 0.5)); } },
        { name: "Orient outward", hint: bt("겉면 방향 맞추기", "Face normals outward"), requiresAsset: true, action: "orient-outward", onClick: () => { void run("Orient outward", () => workspaceOrientOutwardActive(ws)); } },
      ],
    },
    {
      id: "sculpt",
      title: bt("조형·시뮬레이션", "Sculpt & simulation"),
      tools: [
        { name: "Sculpt · voxel-lite", hint: bt("조형 실험 기능", "Experimental sculpt"), requiresAsset: true, onClick: () => { void run("Sculpt", () => workspaceSculptActive(ws)); } },
        { name: "Dynatopo", hint: bt("필요한 곳만 세분화", "Local refine"), requiresAsset: true, action: "dynatopo", onClick: () => { void run("Dynatopo", () => workspaceDynatopoActive(ws, "refine")); } },
        { name: "Retopo", hint: bt("면 다시 정리", "Retopology"), requiresAsset: true, action: "retopo", onClick: () => { void run("Retopo", () => workspaceRetopoActive(ws, 8)); } },
        { name: "Cloth step", hint: bt("천 시뮬레이션 1스텝", "One cloth simulation step"), requiresAsset: true, onClick: () => { void run("천 시뮬레이션", () => workspaceClothStep(ws)); } },
      ],
    },
    {
      id: "surface",
      title: bt("표면·내보내기", "Surface & export"),
      tools: [
        { name: "UV unwrap", hint: bt("UV 펼치기", "Unwrap UVs"), requiresAsset: true, onClick: () => { void run("UV", () => workspaceUvUnwrapActive(ws)); } },
        { name: "Export OBJ", hint: bt("OBJ 파일로 변환", "Convert to OBJ"), requiresAsset: true, onClick: () => { void run("Export OBJ", () => workspaceExportActiveMesh(ws, "obj")); } },
        {
          name: "Export .toon3d",
          hint: bt("다시 편집할 작업 패키지", "Re-editable package"),
          onClick: () => {
            const pkg = workspaceExportToon3d(ws);
            setLog(`.toon3d packed hash=${pkg.manifest.packageHash.slice(0, 18)}… files=${Object.keys(pkg.files).length}`);
          },
        },
        { name: "BOM", hint: bt("부품·권리 목록", "Parts & rights list"), onClick: () => { void run("BOM", () => workspaceRebuildBom(ws)); } },
      ],
    },
    {
      id: "shots",
      title: bt("컷·협업·기록", "Shots, collaboration & history"),
      tools: [
        { name: "8 shots", hint: bt("카메라 컷 8개", "Eight camera shots"), onClick: () => { void run("8 shots", () => workspaceEnsureShots(ws, 8)); } },
        { name: "Artist ink", hint: bt("작가 선 보존", "Keep artist lines"), onClick: () => { void run("Artist ink", () => workspaceAddArtistInk(ws, "shot-1")); } },
        { name: "Collab", hint: bt("협업 참가 시험", "Collaboration join test"), onClick: () => { void run("Collab join", () => workspaceCollabJoin(ws, "peer-local", "Artist")); } },
        {
          name: "Full engines",
          hint: bt("모든 엔진 점검", "Check every engine"),
          onClick: () => {
            void run("Full engine suite", async () => {
              const result = await runStudioHybridDccFullEngineSuite("ui-suite");
              setLog(
                `Suite engines=${result.metrics.engines.length} export=${result.metrics.exportFormat} hash=${result.metrics.packageHash.slice(0, 18)}…`,
              );
              return result.workspace;
            });
          },
        },
        { name: "Undo", hint: bt("되돌리기", "Undo"), onClick: () => { void run("Undo", () => workspaceUndo(ws)); } },
        { name: "Redo", hint: bt("다시 실행", "Redo"), onClick: () => { void run("Redo", () => workspaceRedo(ws)); } },
        {
          name: bt("3D 배경 편집기로 열기", "Open in 3D background"),
          hint: bt("GLB 검증 후 컷 편집기로", "Verify as GLB, then hand off"),
          requiresAsset: true,
          disabled: !canOpenInBackground3d,
          action: "open-bg3d",
          emphasis: true,
          onClick: () => { void openInBackground3d(); },
        },
      ],
    },
  ];
}

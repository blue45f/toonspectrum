export type StudioImmersiveStage =
  | "draw"
  | "character"
  | "scene"
  | "motion"
  | "experience";

export type StudioImmersiveIcon =
  | "brush"
  | "character"
  | "pose"
  | "scene"
  | "depth"
  | "motion"
  | "ar"
  | "vr"
  | "publish";

export interface StudioImmersiveWorkflow {
  readonly id: string;
  readonly stage: StudioImmersiveStage;
  readonly icon: StudioImmersiveIcon;
  readonly href: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly outputKo: string;
  readonly outputEn: string;
  readonly tags: readonly string[];
}
export interface StudioImmersiveStarterKit {
  readonly id: string;
  readonly stage: StudioImmersiveStage;
  readonly href: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly deliverablesKo: readonly string[];
  readonly deliverablesEn: readonly string[];
  readonly accent: "violet" | "cyan" | "amber" | "rose" | "emerald";
}

export const STUDIO_IMMERSIVE_STAGES: readonly Readonly<{
  id: StudioImmersiveStage;
  labelKo: string;
  labelEn: string;
  descriptionKo: string;
  descriptionEn: string;
}>[] = Object.freeze([
  { id: "draw", labelKo: "그리기", labelEn: "Draw", descriptionKo: "선·컷·말풍선", descriptionEn: "Ink, panels and balloons" },
  { id: "character", labelKo: "캐릭터", labelEn: "Character", descriptionKo: "2D 디자인·3D 포즈", descriptionEn: "2D design and 3D pose" },
  { id: "scene", labelKo: "장면", labelEn: "Scene", descriptionKo: "배경·카메라·깊이", descriptionEn: "Background, camera and depth" },
  { id: "motion", labelKo: "모션", labelEn: "Motion", descriptionKo: "타이밍·전환·애니매틱", descriptionEn: "Timing, transitions and animatic" },
  { id: "experience", labelKo: "공간 경험", labelEn: "Spatial", descriptionKo: "2D·AR·VR 검수", descriptionEn: "2D, AR and VR review" },
]);
export const STUDIO_IMMERSIVE_WORKFLOWS: readonly StudioImmersiveWorkflow[] = Object.freeze([
  {
    id: "expressive-ink",
    stage: "draw",
    icon: "brush",
    href: "/studio/canvas",
    titleKo: "표현력 있는 2D 원고",
    titleEn: "Expressive 2D artwork",
    descriptionKo: "필압·틸트·손떨림 보정과 레이어를 사용해 기본 원고를 만듭니다.",
    descriptionEn: "Build the base artwork with pressure, tilt, stabilization and layers.",
    outputKo: "편집 가능한 2D 원고",
    outputEn: "Editable 2D artwork",
    tags: ["2D", "brush", "layers"],
  },
  {
    id: "character-design",
    stage: "character",
    icon: "character",
    href: "/studio/character",
    titleKo: "캐릭터 설계와 표정",
    titleEn: "Character design and expression",
    descriptionKo: "2D 캐릭터 시트와 재사용 가능한 외형·표정 구성을 준비합니다.",
    descriptionEn: "Prepare reusable 2D character sheets, appearance and expressions.",
    outputKo: "캐릭터 에셋",
    outputEn: "Character assets",
    tags: ["2D character", "expression", "asset"],
  },
  {
    id: "pose-blocking",
    stage: "character",
    icon: "pose",
    href: "/studio/poser",
    titleKo: "3D 포즈와 구도 블로킹",
    titleEn: "3D pose and composition blocking",
    descriptionKo: "마네킹·관절 핸들·카메라를 이용해 어려운 인체와 원근을 먼저 검증합니다.",
    descriptionEn: "Validate difficult anatomy and perspective with mannequins, joints and cameras.",
    outputKo: "포즈·카메라 기준",
    outputEn: "Pose and camera reference",
    tags: ["3D", "pose", "camera"],
  },
  {
    id: "background-stage",
    stage: "scene",
    icon: "scene",
    href: "/studio/bg3d",
    titleKo: "웹툰용 3D 배경",
    titleEn: "3D backgrounds for webtoons",
    descriptionKo: "배경 모델·조명·카메라를 편집하고 선화와 채색용 렌더 패스를 준비합니다.",
    descriptionEn: "Edit models, light and cameras, then prepare line and color render passes.",
    outputKo: "재사용 가능한 장면",
    outputEn: "Reusable scene",
    tags: ["3D", "background", "render pass"],
  },
  {
    id: "depth-lift",
    stage: "scene",
    icon: "depth",
    href: "/studio/lift3d",
    titleKo: "2D 컷의 깊이 설계",
    titleEn: "Depth design for 2D panels",
    descriptionKo: "기존 이미지의 전경·중경·배경을 분리해 카메라 이동과 공간 배치 기준을 만듭니다.",
    descriptionEn: "Separate foreground, middle and background for camera motion and spatial staging.",
    outputKo: "깊이 레이어 구성",
    outputEn: "Depth-layer composition",
    tags: ["2.5D", "depth", "parallax"],
  },
  {
    id: "motion-timing",
    stage: "motion",
    icon: "motion",
    href: "/studio/animation",
    titleKo: "모션 웹툰 타이밍",
    titleEn: "Motion webtoon timing",
    descriptionKo: "컷 전환·카메라 이동·자막 타이밍을 애니매틱으로 검토합니다.",
    descriptionEn: "Review panel transitions, camera movement and caption timing as an animatic.",
    outputKo: "재생 가능한 애니매틱",
    outputEn: "Playable animatic",
    tags: ["animation", "timeline", "animatic"],
  },
  {
    id: "ar-proof",
    stage: "experience",
    icon: "ar",
    href: "/studio/bg3d",
    titleKo: "AR 실공간 배치 검수",
    titleEn: "AR placement review",
    descriptionKo: "완성 장면을 실제 공간에 놓고 크기·가독성·관람 거리를 점검합니다.",
    descriptionEn: "Place a finished scene in the real world to review scale, legibility and distance.",
    outputKo: "AR 검수 결과",
    outputEn: "AR review result",
    tags: ["AR", "WebXR", "review"],
  },
  {
    id: "vr-reader",
    stage: "experience",
    icon: "vr",
    href: "/studio/immersive#spatial-reader",
    titleKo: "VR·공간 웹툰 감상",
    titleEn: "VR and spatial webtoon reading",
    descriptionKo: "세로 원고를 집중·곡면·벽면 방식으로 펼치고 헤드셋 없이도 2D로 검수합니다.",
    descriptionEn: "Present vertical pages in focus, arc or wall layouts, with a complete 2D fallback.",
    outputKo: "공간 감상 프리뷰",
    outputEn: "Spatial reading preview",
    tags: ["VR", "reader", "2D fallback"],
  },
  {
    id: "delivery",
    stage: "experience",
    icon: "publish",
    href: "/studio/publish",
    titleKo: "다중 포맷 내보내기",
    titleEn: "Multi-format delivery",
    descriptionKo: "일반 웹툰을 기준 결과로 유지하면서 모션·공간 버전을 함께 검수합니다.",
    descriptionEn: "Keep the standard webtoon as the canonical result while reviewing motion and spatial editions.",
    outputKo: "배포 준비 결과물",
    outputEn: "Delivery-ready output",
    tags: ["publish", "export", "fallback"],
  },
]);

export const STUDIO_IMMERSIVE_STARTER_KITS: readonly StudioImmersiveStarterKit[] = Object.freeze([
  {
    id: "vertical-depth-scene",
    stage: "scene",
    href: "/studio/lift3d?starter=vertical-depth-scene",
    titleKo: "세로 원고 깊이 3단",
    titleEn: "Three-plane vertical depth",
    descriptionKo: "긴 원고를 전경·인물·배경으로 나눠 과한 멀미 없이 미세한 패럴랙스를 설계합니다.",
    descriptionEn: "Split a vertical page into foreground, character and background for restrained parallax.",
    deliverablesKo: ["깊이 레이어 3개", "안전한 카메라 범위", "2D 원본 유지"],
    deliverablesEn: ["Three depth layers", "Safe camera range", "2D source preserved"],
    accent: "violet",
  },
  {
    id: "dialog-stage",
    stage: "scene",
    href: "/studio/bg3d?starter=dialog-stage",
    titleKo: "대화 장면 카메라 세트",
    titleEn: "Dialogue camera set",
    descriptionKo: "180도 규칙과 말풍선 여백을 지키는 투샷·오버숄더·클로즈업 구성을 시작합니다.",
    descriptionEn: "Start two-shot, over-shoulder and close-up cameras that preserve dialogue continuity.",
    deliverablesKo: ["카메라 4대", "시선축 가이드", "말풍선 안전영역"],
    deliverablesEn: ["Four cameras", "Eyeline guide", "Balloon-safe area"],
    accent: "cyan",
  },
  {
    id: "character-turnaround",
    stage: "character",
    href: "/studio/character?starter=character-turnaround",
    titleKo: "캐릭터 턴어라운드",
    titleEn: "Character turnaround",
    descriptionKo: "정면·측면·후면과 핵심 표정을 같은 비율로 정리해 2D와 3D 기준을 맞춥니다.",
    descriptionEn: "Align front, side, back and key expressions as a shared 2D/3D reference.",
    deliverablesKo: ["3면도", "표정 6종", "색상 기준"],
    deliverablesEn: ["Three views", "Six expressions", "Color reference"],
    accent: "rose",
  },
  {
    id: "action-pose-rig",
    stage: "character",
    href: "/studio/poser?starter=action-pose-rig",
    titleKo: "액션 포즈 카메라 리그",
    titleEn: "Action pose camera rig",
    descriptionKo: "저각·광각·원근 과장을 빠르게 비교하고 관절 실루엣이 겹치지 않게 점검합니다.",
    descriptionEn: "Compare low-angle, wide-lens perspective and keep joint silhouettes readable.",
    deliverablesKo: ["액션 포즈 5종", "렌즈 비교", "실루엣 검수"],
    deliverablesEn: ["Five action poses", "Lens comparison", "Silhouette review"],
    accent: "amber",
  },
  {
    id: "ar-tabletop-proof",
    stage: "experience",
    href: "/studio/bg3d?starter=ar-tabletop-proof",
    titleKo: "AR 테이블탑 프루프",
    titleEn: "AR tabletop proof",
    descriptionKo: "작은 공간에서 장면 크기·바닥 고정·텍스트 가독성을 안전하게 확인합니다.",
    descriptionEn: "Review scene scale, floor anchoring and text legibility in a compact real space.",
    deliverablesKo: ["1m 기준 스케일", "재배치 동작", "즉시 종료 동선"],
    deliverablesEn: ["One-meter scale", "Reposition action", "Immediate exit path"],
    accent: "emerald",
  },
  {
    id: "vr-gallery-review",
    stage: "experience",
    href: "/studio/immersive#spatial-reader",
    titleKo: "VR 갤러리 검수",
    titleEn: "VR gallery review",
    descriptionKo: "여러 컷을 곡면·벽면에 배열해 자막 크기와 관람 거리를 점검합니다.",
    descriptionEn: "Arrange panels on an arc or wall to review captions and viewing distance.",
    deliverablesKo: ["곡면·벽면 프리셋", "자막 검수", "2D 대체 화면"],
    deliverablesEn: ["Arc and wall presets", "Caption review", "2D fallback"],
    accent: "violet",
  },
  {
    id: "motion-panel-proof",
    stage: "motion",
    href: "/studio/animation?starter=motion-panel-proof",
    titleKo: "모션 컷 프루프",
    titleEn: "Motion panel proof",
    descriptionKo: "정지 원고를 유지한 채 컷 전환과 카메라 움직임만 추가해 빠르게 검증합니다.",
    descriptionEn: "Keep the still artwork intact while validating transitions and camera movement.",
    deliverablesKo: ["8초 애니매틱", "감속 전환", "정지 원고 원본"],
    deliverablesEn: ["Eight-second animatic", "Eased transition", "Still source artwork"],
    accent: "cyan",
  },
]);
export function auditStudioImmersiveCatalog(): readonly string[] {
  const issues: string[] = [];
  const workflowIds = new Set<string>();
  const kitIds = new Set<string>();
  const knownStages = new Set(STUDIO_IMMERSIVE_STAGES.map((stage) => stage.id));

  for (const workflow of STUDIO_IMMERSIVE_WORKFLOWS) {
    if (workflowIds.has(workflow.id)) issues.push(`duplicate-workflow:${workflow.id}`);
    workflowIds.add(workflow.id);
    if (!knownStages.has(workflow.stage)) issues.push(`unknown-stage:${workflow.id}`);
    if (!workflow.href.startsWith("/")) issues.push(`external-workflow:${workflow.id}`);
    if (!workflow.titleKo.trim() || !workflow.titleEn.trim()) issues.push(`missing-title:${workflow.id}`);
    if (workflow.tags.length < 2) issues.push(`insufficient-tags:${workflow.id}`);
  }
  for (const kit of STUDIO_IMMERSIVE_STARTER_KITS) {
    if (kitIds.has(kit.id)) issues.push(`duplicate-kit:${kit.id}`);
    kitIds.add(kit.id);
    if (!knownStages.has(kit.stage)) issues.push(`unknown-kit-stage:${kit.id}`);
    if (!kit.href.startsWith("/")) issues.push(`external-kit:${kit.id}`);
    if (kit.deliverablesKo.length < 3 || kit.deliverablesEn.length < 3) {
      issues.push(`incomplete-kit:${kit.id}`);
    }
  }
  for (const stage of STUDIO_IMMERSIVE_STAGES) {
    if (!STUDIO_IMMERSIVE_WORKFLOWS.some((workflow) => workflow.stage === stage.id)) {
      issues.push(`empty-stage:${stage.id}`);
    }
  }
  return Object.freeze([...new Set(issues)]);
}

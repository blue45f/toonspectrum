import type { StudioWorldInteractionDefinition, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";

export type StudioSpatialActionRisk = "inspect" | "collaborative" | "authority";
export type StudioSpatialActionId =
  | "primary"
  | "work-inbox"
  | "sessions"
  | "board"
  | "people"
  | "team-hub"
  | "today-board"
  | "schedule"
  | "huddle"
  | "project-overview"
  | "project-settings"
  | "production-control"
  | "quality-control"
  | "release-center"
  | "waterfall-splash"
  | "make-wish"
  | "take-photo"
  | "release-petals"
  | "toggle-lanterns"
  | "pet-animal"
  | "ring-gong"
  | "open-customization"
  | "bubble"
  | "spotlight"
  | "live-annotation"
  | "town-hub";

export interface StudioSpatialAction {
  readonly id: StudioSpatialActionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly risk: StudioSpatialActionRisk;
  readonly recommended?: boolean;
}

const action = (value: StudioSpatialAction): StudioSpatialAction => Object.freeze(value);
const COMMON: Readonly<Record<Exclude<StudioSpatialActionId, "primary">, StudioSpatialAction>> = Object.freeze({
  "work-inbox": action({ id: "work-inbox", labelKo: "내 작업·검수함", labelEn: "My work & reviews", descriptionKo: "현재 프로젝트의 담당 작업과 검수 요청을 확인합니다.", descriptionEn: "Check assignments and review requests for this project.", risk: "inspect" }),
  sessions: action({ id: "sessions", labelKo: "공동 작업 세션", labelEn: "Work sessions", descriptionKo: "대본 리딩·콘티·검수 세션을 준비하거나 이어갑니다.", descriptionEn: "Prepare or continue reading, storyboard and review sessions.", risk: "collaborative" }),
  board: action({ id: "board", labelKo: "공유 화이트보드", labelEn: "Shared whiteboard", descriptionKo: "근처 팀원과 P2P 보드를 엽니다.", descriptionEn: "Open the P2P board with nearby teammates.", risk: "collaborative" }),
  people: action({ id: "people", labelKo: "근처 사람과 대화", labelEn: "Talk to nearby people", descriptionKo: "주변 팀원에게 인사·대화·동행을 요청합니다.", descriptionEn: "Greet nearby teammates or request a conversation or follow.", risk: "collaborative" }),
  "team-hub": action({ id: "team-hub", labelKo: "팀·그룹·초대", labelEn: "Teams, groups & invites", descriptionKo: "제작 그룹을 만들고 팀원을 초대하거나 프로젝트를 배정합니다.", descriptionEn: "Create production groups, invite teammates and assign projects.", risk: "authority" }),
  "today-board": action({ id: "today-board", labelKo: "오늘의 일정·다음 작업", labelEn: "Today & next work", descriptionKo: "마감, 검수, 회의와 다음 작업을 한 번에 확인합니다.", descriptionEn: "See deadlines, reviews, meetings and the next useful action.", risk: "inspect" }),
  schedule: action({ id: "schedule", labelKo: "제작 일정 열기", labelEn: "Open production schedule", descriptionKo: "프로젝트 일정과 마감 계획을 엽니다.", descriptionEn: "Open the project schedule and delivery plan.", risk: "inspect" }),
  huddle: action({ id: "huddle", labelKo: "회의·통화 준비", labelEn: "Prepare meeting", descriptionKo: "참여자 동의를 받은 뒤 음성·영상 장치를 직접 선택합니다.", descriptionEn: "Request participant consent, then explicitly choose audio and video devices.", risk: "collaborative" }),
  "project-overview": action({ id: "project-overview", labelKo: "프로젝트 현황", labelEn: "Project overview", descriptionKo: "에피소드, 작업, 리스크와 진행률을 확인합니다.", descriptionEn: "Inspect episodes, tasks, risks and project progress.", risk: "inspect" }),
  "project-settings": action({ id: "project-settings", labelKo: "프로젝트 설정", labelEn: "Project settings", descriptionKo: "권한과 프로젝트 연결 설정을 확인합니다.", descriptionEn: "Review permissions and project integration settings.", risk: "authority" }),
  "production-control": action({ id: "production-control", labelKo: "프로덕션 관제실", labelEn: "Production control", descriptionKo: "병목, 일정, 작업 배정과 제작 상태를 확인합니다.", descriptionEn: "Inspect bottlenecks, schedule, assignments and production state.", risk: "inspect" }),
  "quality-control": action({ id: "quality-control", labelKo: "최종 QC 체크", labelEn: "Final quality control", descriptionKo: "미해결 검수, 원고 상태와 출고 전 체크리스트를 확인합니다.", descriptionEn: "Check unresolved reviews, manuscript state and pre-delivery quality gates.", risk: "inspect" }),
  "release-center": action({ id: "release-center", labelKo: "출고·내보내기", labelEn: "Release & export", descriptionKo: "최종 승인 후 플랫폼별 내보내기 절차로 이동합니다.", descriptionEn: "Continue to platform export after final approval.", risk: "authority" }),
  "waterfall-splash": action({ id: "waterfall-splash", labelKo: "물장난하기", labelEn: "Splash water", descriptionKo: "폭포 안개와 물결 이펙트를 가까이에서 실행합니다.", descriptionEn: "Trigger waterfall mist and ripples nearby.", risk: "inspect", recommended: true }),
  "make-wish": action({ id: "make-wish", labelKo: "소원 빌기", labelEn: "Make a wish", descriptionKo: "분수·폭포에 별빛 소원 이펙트를 남깁니다.", descriptionEn: "Leave a starlight wish effect at the fountain or falls.", risk: "inspect" }),
  "take-photo": action({ id: "take-photo", labelKo: "기념 사진", labelEn: "Take a photo", descriptionKo: "현재 장소에서 카메라 플래시와 프레임 이펙트를 실행합니다.", descriptionEn: "Trigger a camera flash and frame effect at this landmark.", risk: "inspect" }),
  "release-petals": action({ id: "release-petals", labelKo: "꽃잎 날리기", labelEn: "Release petals", descriptionKo: "정원 주변에 꽃잎 파티클을 흩뿌립니다.", descriptionEn: "Release petal particles around the garden.", risk: "inspect" }),
  "toggle-lanterns": action({ id: "toggle-lanterns", labelKo: "조명 밝히기", labelEn: "Light the lanterns", descriptionKo: "주변 조명을 잠시 더 밝게 만듭니다.", descriptionEn: "Brighten nearby lanterns for a short time.", risk: "inspect" }),
  "pet-animal": action({ id: "pet-animal", labelKo: "고양이 쓰다듬기", labelEn: "Pet the cat", descriptionKo: "주변 동물과 상호작용하고 하트 이펙트를 표시합니다.", descriptionEn: "Interact with a nearby animal and show a heart effect.", risk: "inspect" }),
  "ring-gong": action({ id: "ring-gong", labelKo: "완료 축하 공 울리기", labelEn: "Ring the celebration gong", descriptionKo: "완료를 축하하는 파동 이펙트를 실행합니다.", descriptionEn: "Trigger a celebration wave for completed work.", risk: "collaborative" }),
  "open-customization": action({ id: "open-customization", labelKo: "이 공간 꾸미기", labelEn: "Customize this space", descriptionKo: "안전한 내장 오브젝트와 캐릭터 액세서리를 선택합니다.", descriptionEn: "Choose safe bundled objects and character accessories.", risk: "inspect" }),
  bubble: action({ id: "bubble", labelKo: "소규모 Bubble 대화", labelEn: "Conversation bubble", descriptionKo: "근처 팀원 최대 세 명과 전체 명단 동의 후 임시 대화를 시작합니다.", descriptionEn: "Start a temporary nearby conversation after everyone accepts the full roster.", risk: "collaborative" }),
  spotlight: action({ id: "spotlight", labelKo: "Spotlight 발표", labelEn: "Spotlight presentation", descriptionKo: "현재 동의한 대화 그룹을 대상으로 무대 발표 모드를 준비합니다.", descriptionEn: "Prepare stage presentation mode for the currently consenting conversation.", risk: "collaborative" }),
  "live-annotation": action({ id: "live-annotation", labelKo: "라이브 화면 주석", labelEn: "Live annotation", descriptionKo: "레이저·펜·메모를 P2P로 공유합니다.", descriptionEn: "Share laser, pen and notes over P2P.", risk: "collaborative" }),
  "town-hub": action({ id: "town-hub", labelKo: "마을 활동·퀘스트", labelEn: "Town activities & quests", descriptionKo: "이벤트, 팀 자리, 미니게임과 블루프린트를 확인합니다.", descriptionEn: "Explore events, desk pods, mini-games and blueprints.", risk: "inspect" }),
});

function primary(interaction: StudioWorldInteractionDefinition): StudioSpatialAction {
  return action({
    id: "primary",
    labelKo: interaction.labelKo,
    labelEn: interaction.labelEn,
    descriptionKo: "이 오브젝트에 연결된 기본 제작 기능을 엽니다.",
    descriptionEn: "Open the primary production tool connected to this object.",
    risk: interaction.action === "live" ? "collaborative" : "inspect",
    recommended: true,
  });
}

function unique(values: readonly StudioSpatialAction[]): readonly StudioSpatialAction[] {
  return Object.freeze(values.filter((candidate, index, all) => all.findIndex((other) => other.id === candidate.id) === index));
}

/** A world object offers explicit choices; proximity never performs the action by itself. */
export function studioSpatialActions(
  interaction: StudioWorldInteractionDefinition,
  room: StudioWorldRoomDefinition | undefined,
): readonly StudioSpatialAction[] {
  const id = `${interaction.id}:${room?.id ?? interaction.zoneId}`.toLowerCase();
  if (/environment-.*falls/u.test(id)) return unique([
    COMMON["waterfall-splash"], COMMON["make-wish"], COMMON["take-photo"], COMMON["open-customization"],
  ]);
  if (/creator-fountain/u.test(id)) return unique([
    COMMON["make-wish"], COMMON["waterfall-splash"], COMMON["take-photo"], COMMON["open-customization"],
  ]);
  if (/garden/u.test(id)) return unique([
    COMMON["release-petals"], COMMON["take-photo"], COMMON["open-customization"],
  ]);
  if (/market|treehouse/u.test(id)) return unique([
    COMMON["open-customization"], COMMON.people, COMMON["take-photo"],
  ]);
  if (/observatory/u.test(id)) return unique([
    COMMON["toggle-lanterns"], COMMON["take-photo"], COMMON["make-wish"],
  ]);
  if (/gong/u.test(id)) return unique([
    COMMON["ring-gong"], COMMON["take-photo"], COMMON.people,
  ]);
  if (/event-stage/u.test(id)) return unique([
    COMMON.spotlight, COMMON["live-annotation"], COMMON["release-petals"], COMMON.huddle, COMMON.people,
  ]);
  const values: StudioSpatialAction[] = [primary(interaction)];
  switch (interaction.action) {
    case "story": values.push(COMMON.sessions, COMMON["today-board"], COMMON["project-overview"]); break;
    case "comic": values.push(COMMON.sessions, COMMON.board, COMMON["work-inbox"]); break;
    case "canvas": values.push(COMMON.board, COMMON.sessions, COMMON["work-inbox"]); break;
    case "review": values.push(COMMON["work-inbox"], COMMON.sessions, COMMON["quality-control"]); break;
    case "assets": values.push(COMMON["work-inbox"], COMMON["project-overview"]); break;
    case "live": values.push(COMMON.huddle, COMMON.sessions, COMMON.people, COMMON.board, COMMON.spotlight); break;
    case "community": values.push(COMMON.bubble, COMMON.people, COMMON["team-hub"], COMMON["town-hub"]); break;
    case "assistant": values.push(COMMON["today-board"], COMMON["production-control"], COMMON.schedule); break;
  }
  if (/meeting|conference|huddle/u.test(id)) values.push(COMMON.huddle, COMMON.sessions, COMMON.people);
  if (/team|reception|lobby|concierge/u.test(id)) values.push(COMMON["team-hub"], COMMON["today-board"]);
  if (/schedule|calendar|producer|control/u.test(id)) values.push(COMMON.schedule, COMMON["production-control"]);
  if (/qc|quality/u.test(id)) values.push(COMMON["quality-control"], COMMON["work-inbox"]);
  if (/release|export|delivery/u.test(id)) values.push(COMMON["release-center"], COMMON["quality-control"]);
  if (/desk|settings/u.test(id)) values.push(COMMON["work-inbox"], COMMON["project-settings"]);
  return unique(values).slice(0, 6);
}

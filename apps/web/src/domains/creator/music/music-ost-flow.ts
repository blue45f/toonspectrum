/**
 * OST 만들기 4단계(설정 → 생성·가져오기 → 미리듣기·보관 → 작품 연결)의 진행 상태.
 * 화면 상태에서 파생만 하고, 단계 완료를 추측으로 채우지 않는다.
 */
export type MusicOstStepId = "brief" | "create" | "listen" | "connect";
export type MusicOstStepState = "done" | "current" | "todo";

export interface MusicOstStep {
  readonly id: MusicOstStepId;
  readonly state: MusicOstStepState;
  /** 이 단계를 진행하는 화면 영역의 id. */
  readonly anchor: string;
}

export const MUSIC_OST_ANCHORS: Readonly<Record<MusicOstStepId, string>> = {
  brief: "music-brief",
  create: "music-generate",
  listen: "music-library",
  connect: "music-publish",
};

export interface MusicOstFlowInput {
  readonly briefReady: boolean;
  readonly trackCount: number;
  readonly savedCount: number;
  readonly bgmLinked: boolean;
}

export function musicOstFlow(input: MusicOstFlowInput): readonly MusicOstStep[] {
  const done: Readonly<Record<MusicOstStepId, boolean>> = {
    brief: input.briefReady,
    create: input.trackCount > 0,
    listen: input.savedCount > 0,
    connect: input.bgmLinked,
  };
  const order: readonly MusicOstStepId[] = ["brief", "create", "listen", "connect"];
  const current = order.find((id) => !done[id]);
  return order.map((id) => ({
    id,
    anchor: MUSIC_OST_ANCHORS[id],
    state: done[id] ? "done" : id === current ? "current" : "todo",
  }));
}

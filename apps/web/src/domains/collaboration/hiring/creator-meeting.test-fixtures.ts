import type { CreatorRoom, CreatorRoomMessage } from "../../../../../../packages/contracts/src/creator-hiring";

export const fixtureRoom: CreatorRoom = {
  id: "room-a", title: "비공개 면접", kind: "interview", hostId: "host", teamId: null, applicationId: "application-a",
  startsAt: "2026-09-20T12:00:00.000Z", endsAt: "2026-09-20T13:00:00.000Z", status: "live", epoch: 3, myStatus: "waiting",
  participants: [
    { userId: "host", displayName: "면접관", role: "host", status: "admitted" },
    { userId: "guest", displayName: "지원자", role: "guest", status: "waiting" },
  ], media: { status: "not-configured", recordingEnabled: false, transcriptionEnabled: false },
};
export const fixtureMessage: CreatorRoomMessage = { id: "message-a", userId: "host", displayName: "면접관", text: "대기 안내", createdAt: "2026-09-20T12:01:00.000Z" };
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

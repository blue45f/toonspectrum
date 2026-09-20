import { z } from "zod";

import type { CreatorRoom, CreatorRoomMessage } from "../../../../../../packages/contracts/src/creator-hiring";

import { api } from "@/infrastructure/api";

const id = z.string().min(1).max(256);
const status = z.enum(["invited", "waiting", "admitted", "removed", "left"]);
const epoch = z.number().int().min(1).max(2147483647);
const roomSchema = z.object({
  id, title: z.string().max(100), kind: z.enum(["interview", "meeting"]), hostId: id,
  teamId: id.nullable(), applicationId: id.nullable(),
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  status: z.enum(["scheduled", "live", "ended"]), epoch, myStatus: status,
  participants: z.array(z.object({ userId: id, displayName: z.string().max(1000), role: z.enum(["host", "guest"]), status })).max(12),
  media: z.object({ status: z.literal("not-configured"), recordingEnabled: z.literal(false), transcriptionEnabled: z.literal(false) }),
});
const messagesSchema = z.array(z.object({
  id, userId: id, displayName: z.string().max(1000), text: z.string().max(2000), createdAt: z.iso.datetime({ offset: true }),
})).max(100);

export type MeetingCommand =
  | { type: "enter" }
  | { type: "leave" }
  | { type: "host"; action: "admit" | "remove" | "end"; targetAccountId: string | null }
  | { type: "messages"; text: string; audience: "lobby" | "admitted" };

/** Validate this account's projection; server authorization remains authoritative. */
export function parseCreatorRoom(input: unknown, expectedId: string, actor: string): CreatorRoom {
  const value = roomSchema.safeParse(input);
  if (!value.success) throw new Error("면접·회의 응답 형식을 확인하지 못했어요.");
  const room = value.data;
  const me = room.participants.find((p) => p.userId === actor);
  const host = room.participants.find((p) => p.userId === room.hostId);
  if (room.id !== expectedId || !me || me.status !== room.myStatus || !host ||
      new Set(room.participants.map((p) => p.userId)).size !== room.participants.length ||
      room.participants.some((p) => (p.role === "host") !== (p.userId === room.hostId)) ||
      (actor !== room.hostId && room.participants.some((p) => p.userId !== actor && p.userId !== room.hostId)) ||
      Date.parse(room.startsAt) >= Date.parse(room.endsAt)) {
    throw new Error("현재 계정과 면접·회의의 연결을 확인하지 못했어요.");
  }
  return room;
}
export function parseCreatorRoomMessages(input: unknown): CreatorRoomMessage[] {
  const parsed = messagesSchema.safeParse(input);
  if (!parsed.success || new Set(parsed.data.map((m) => m.id)).size !== parsed.data.length) {
    throw new Error("대화 응답 형식을 확인하지 못했어요.");
  }
  return parsed.data;
}
export function meetingIsTerminal(room: CreatorRoom): boolean {
  return room.status === "ended" || room.myStatus === "left" || room.myStatus === "removed";
}
const roomPath = (roomId: string) => `/collaborations/rooms/${encodeURIComponent(roomId)}`;
const options = (signal: AbortSignal) => ({ signal, timeout: 10000, retry: 0 });
export const creatorMeetingClient = {
  async read(roomId: string, actor: string, signal: AbortSignal) {
    const room = parseCreatorRoom(await api.get<unknown>(roomPath(roomId), options(signal)), roomId, actor);
    signal.throwIfAborted();
    const messages = meetingIsTerminal(room) ? [] : parseCreatorRoomMessages(await api.get<unknown>(`${roomPath(roomId)}/messages`, {
      ...options(signal), params: { epoch: room.epoch },
    }));
    signal.throwIfAborted();
    return { room, messages };
  },
  async send(roomId: string, currentEpoch: number, command: MeetingCommand, signal: AbortSignal) {
    const { type, ...body } = command;
    const response = await api.post<unknown>(`${roomPath(roomId)}/${type}`, { ...body, expectedEpoch: currentEpoch }, options(signal));
    signal.throwIfAborted();
    const receipt = type === "messages" ? z.object({ id })
      : type === "host" ? z.object({ epoch, media: z.literal("not-configured") })
      : z.object({ status, epoch, media: z.literal("not-configured") });
    if (!receipt.safeParse(response).success) throw new Error("요청 처리 결과를 확인하지 못했어요.");
  },
};

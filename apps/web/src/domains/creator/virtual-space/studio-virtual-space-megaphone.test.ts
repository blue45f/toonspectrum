import { describe, expect, it } from "vitest";

import {
  canMegaphoneBroadcast,
  MegaphoneSession,
  pushMegaphoneCaption,
} from "./studio-virtual-space-megaphone";

describe("canMegaphoneBroadcast", () => {
  it("owner·admin만 방송할 수 있다", () => {
    expect(canMegaphoneBroadcast("owner")).toBe(true);
    expect(canMegaphoneBroadcast("admin")).toBe(true);
    expect(canMegaphoneBroadcast("editor")).toBe(false);
    expect(canMegaphoneBroadcast("commenter")).toBe(false);
    expect(canMegaphoneBroadcast("viewer")).toBe(false);
  });
});

describe("pushMegaphoneCaption", () => {
  it("자막을 푸시하고 최대 20개를 유지한다", () => {
    let captions = pushMegaphoneCaption([], { textKo: "첫 번째" });
    expect(captions).toHaveLength(1);
    expect(captions[0]?.textKo).toBe("첫 번째");
    expect(captions[0]?.sharingScreen).toBe(false);
    for (let i = 0; i < 25; i += 1) {
      captions = pushMegaphoneCaption(captions, { textKo: `자막 ${i}`, sharingScreen: true });
    }
    expect(captions).toHaveLength(20);
    expect(captions[19]?.sharingScreen).toBe(true);
  });

  it("빈 자막은 무시된다", () => {
    expect(pushMegaphoneCaption([], { textKo: "   " })).toHaveLength(0);
  });
});

describe("MegaphoneSession", () => {
  it("방송을 시작하고 중지한다", () => {
    const session = new MegaphoneSession();
    expect(session.getSnapshot().status).toBe("idle");
    session.start({ scope: "world", broadcasterName: "김선생", shareScreen: true });
    const broadcasting = session.getSnapshot();
    expect(broadcasting.status).toBe("broadcasting");
    expect(broadcasting.scope).toBe("world");
    expect(broadcasting.broadcasterName).toBe("김선생");
    expect(broadcasting.sharingScreen).toBe(true);
    session.stop();
    expect(session.getSnapshot().status).toBe("idle");
    expect(session.getSnapshot().sharingScreen).toBe(false);
  });

  it("중복 시작은 무시된다", () => {
    const session = new MegaphoneSession();
    session.start({ scope: "room" });
    session.start({ scope: "world" });
    expect(session.getSnapshot().scope).toBe("room");
  });

  it("자막을 방송 스냅샷에 쌓는다", () => {
    const session = new MegaphoneSession({ now: () => 1234 });
    session.start({ scope: "room" });
    session.pushCaption("공지합니다", "Announcement");
    const captions = session.getSnapshot().captions;
    expect(captions).toHaveLength(1);
    expect(captions[0]?.textKo).toBe("공지합니다");
    expect(captions[0]?.textEn).toBe("Announcement");
    expect(captions[0]?.createdAt).toBe(1234);
  });

  it("구독자에게 스냅샷 변경을 전파한다", () => {
    const session = new MegaphoneSession();
    const seen: string[] = [];
    const off = session.subscribe((snapshot) => seen.push(snapshot.status));
    session.start({ scope: "room" });
    session.stop();
    off();
    session.start({ scope: "room" });
    expect(seen).toEqual(["idle", "broadcasting", "idle"]);
  });

  it("실패 상태를 표시한다", () => {
    const session = new MegaphoneSession();
    session.fail("장치 오류");
    expect(session.getSnapshot().status).toBe("failed");
    expect(session.getSnapshot().error).toBe("장치 오류");
  });
});

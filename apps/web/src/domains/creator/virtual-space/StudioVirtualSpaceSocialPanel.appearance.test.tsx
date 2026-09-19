// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceSocialPanel } from "./StudioVirtualSpaceSocialPanel";
import { studioCharacterAppearanceForAvatarIndex } from "./studio-virtual-space-character-skins";
import { studioVirtualSpaceState, type StudioVirtualSpacePeer } from "./studio-virtual-space-model";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(cleanup);

const messages = {
  legacy: "이전 버전으로 접속한 팀원입니다. 캐릭터 일부 동작은 다르게 보일 수 있어요.",
  unknown: "상대 캐릭터가 아직 지원되지 않아 기본 캐릭터로 표시합니다.",
  revision: "캐릭터 버전이 달라 함께 지원하는 동작으로 표시합니다.",
};
const peer: StudioVirtualSpacePeer = {
  participant: { sessionId: "peer", displayName: "Teammate", role: "editor" },
  state: { ...studioVirtualSpaceState(), avatarIndex: 3, appearance: studioCharacterAppearanceForAvatarIndex(0) },
  sequence: 1, lastSeen: 100,
};
function props(selectedPeer: StudioVirtualSpacePeer | null = peer): ComponentProps<typeof StudioVirtualSpaceSocialPanel> {
  return {
    selectedPeer, peers: selectedPeer ? [selectedPeer] : [], disabled: false, focused: false,
    social: { requests: [], readyPeerIds: [], reviewReadyPeerIds: [], greetingReadyPeerIds: [], greetings: [], blockedPeerIds: [], available: true },
    onSelect: vi.fn(), onWave: vi.fn(), onRequest: vi.fn(), onRespond: vi.fn(), onCancel: vi.fn(), onBlock: vi.fn(),
  };
}

describe("selected teammate appearance compatibility", () => {
  it("shows no compatibility warning for an exact stable descriptor even when its legacy index differs", () => {
    const options = props();
    render(<StudioVirtualSpaceSocialPanel {...options} />);
    expect(screen.getByRole("button", { name: "Teammate" })).toBeTruthy();
    for (const message of Object.values(messages)) expect(screen.queryByText(message)).toBeNull();
    // Presentation support never supplies the authenticated social readiness/consent gate.
    const talk = screen.getByRole("button", { name: "대화 요청" });
    expect((talk as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(talk);
    expect(options.onRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["legacy", undefined],
    ["unknown", { ...studioCharacterAppearanceForAvatarIndex(0), skinKey: "future-skin" }],
    ["revision", { ...studioCharacterAppearanceForAvatarIndex(0), registryRevision: "future-registry" }],
  ] as const)("explains the %s fallback only for the selected teammate", (kind, appearance) => {
    const selected = { ...peer, state: { ...peer.state, appearance } };
    const options = props(selected);
    const view = render(<StudioVirtualSpaceSocialPanel {...options} />);
    expect(screen.getByText(messages[kind])).toBeTruthy();
    for (const [key, message] of Object.entries(messages)) {
      if (key !== kind) expect(screen.queryByText(message)).toBeNull();
    }
    view.rerender(<StudioVirtualSpaceSocialPanel {...props(peer)} />);
    expect(screen.queryByText(messages[kind])).toBeNull();
    view.rerender(<StudioVirtualSpaceSocialPanel {...options} selectedPeer={null} />);
    for (const message of Object.values(messages)) expect(screen.queryByText(message)).toBeNull();
  });
});

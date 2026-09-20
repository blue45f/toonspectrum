// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const media: TestAudio[] = [];
class TestAudio extends EventTarget {
  constructor(public src: string) { super(); media.push(this); }
  play = vi.fn(async () => {});
  pause = vi.fn();
  load = vi.fn();
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
}

function audioNode() {
  const parameter = () => ({
    value: 1, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
  });
  return {
    gain: parameter(), frequency: parameter(), Q: parameter(),
    threshold: parameter(), knee: parameter(), ratio: parameter(),
    attack: parameter(), release: parameter(), connect: vi.fn(), disconnect: vi.fn(),
  };
}
class TestContext {
  state = "running";
  currentTime = 0;
  sampleRate = 10;
  destination = {};
  createGain = audioNode;
  createBiquadFilter = audioNode;
  createDynamicsCompressor = audioNode;
  createConvolver = audioNode;
  createMediaElementSource = audioNode;
  createBuffer(channels: number, frames: number) {
    return { numberOfChannels: channels, getChannelData: () => new Float32Array(frames) };
  }
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); media.length = 0;
  vi.stubGlobal("Audio", TestAudio);
  vi.stubGlobal("AudioContext", TestContext);
  // Each module instance owns a visibility listener; keep this unit fixture isolated.
  vi.spyOn(document, "addEventListener").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  localStorage.clear();
});

async function start() {
  const audio = await import("./audio");
  audio.registerBgmPlaylist(["/a.mp3", "/b.mp3", "/c.mp3"]);
  audio.bgmPlay();
  return audio;
}

describe("playlist event ownership", () => {
  it("ignores a retiring track ending but advances when the current track ends", async () => {
    const audio = await start();
    const retired = media[0]!;
    audio.bgmSetMood("playlist:1");
    const current = media[1]!;
    retired.dispatchEvent(new Event("ended"));
    expect(audio.getAudioState().currentMoodId).toBe("playlist:1");
    expect(media).toHaveLength(2);
    current.dispatchEvent(new Event("ended"));
    expect(audio.getAudioState().currentMoodId).toBe("playlist:2");
    expect(media).toHaveLength(3);
    audio.bgmPause();
  });

  it("does not let a pre-suspension voice advance the resumed playlist", async () => {
    const audio = await start();
    const retired = media[0]!;
    audio.suspendBgmForContext("music-editor");
    audio.resumeBgmForContext("music-editor");
    expect(media).toHaveLength(2);
    retired.dispatchEvent(new Event("ended"));
    expect(audio.getAudioState().currentMoodId).toBe("playlist:0");
    expect(media).toHaveLength(2);
    audio.bgmPause();
  });
});

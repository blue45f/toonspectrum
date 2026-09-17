import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  readMusicEpisodeId,
  readMusicWorkId,
  scopeMusicBrief,
} from "./studio-music-work-scope";

import type { MusicBrief } from "@toonspectrum/core/studio-music";
import { defaultMusicBrief } from "@toonspectrum/core/studio-music";

function brief(): MusicBrief {
  return {
    ...defaultMusicBrief(),
    title: "다시 만난 밤",
    scene: "두 주인공이 역에서 재회한다.",
    purpose: "ost",
    vocals: true,
    lyrics: "긴 밤이 지나 우리 다시 만날 때",
    workId: "work-a",
    episodeId: "episode-12",
    rightsConfirmed: true,
  };
}

describe("music route work and episode scope", () => {
  it("accepts exactly bounded IDs without normalizing to another work", () => {
    for (const id of ["work-a", "WORK_b_123", "a".repeat(80)]) {
      assert.equal(readMusicWorkId(id), id);
    }
  });

  it("rejects missing, oversized, path-like and padded route values", () => {
    for (const id of [null, undefined, "", "a".repeat(81), "../work-b", "a/b", "work-a?x=1", " work-a", "work-a ", "work-a\n"]) {
      assert.equal(readMusicWorkId(id), "");
    }
  });

  it("binds an episode only when a valid work scope exists", () => {
    assert.equal(readMusicEpisodeId("episode-12", "work-a"), "episode-12");
    assert.equal(readMusicEpisodeId("episode-12", ""), "");
    assert.equal(readMusicEpisodeId("../episode-12", "work-a"), "");
  });

  it("moves a draft to the current work and episode without losing creative choices", () => {
    const original = brief();
    const result = scopeMusicBrief(original, "work-b", "episode-4");
    assert.deepEqual(result, {
      ...original,
      instruments: [...original.instruments],
      workId: "work-b",
      episodeId: "episode-4",
      rightsConfirmed: false,
    });
    assert.equal(original.workId, "work-a");
    assert.equal(original.episodeId, "episode-12");
    assert.equal(original.rightsConfirmed, true);
  });

  it("does not inherit a saved track's scope on the unbound music route", () => {
    const result = scopeMusicBrief(brief(), "");
    assert.equal(result.workId, "");
    assert.equal(result.episodeId, "");
  });

  it("resets consent even when reusing settings within the same scope", () => {
    assert.equal(scopeMusicBrief(brief(), "work-a", "episode-12").rightsConfirmed, false);
  });

  it("copies mutable instrument selection instead of editing a saved track", () => {
    const original = brief();
    const result = scopeMusicBrief(original, "work-b", "episode-4");
    result.instruments.push("drums");
    assert.deepEqual(original.instruments, ["piano", "strings"]);
  });

  it("always targets the latest route through repeated scope changes", () => {
    let current = brief();
    for (const [workId, episodeId] of [["work-b", "episode-2"], ["", "episode-9"], ["work-c", ""], ["work-a", "episode-12"]] as const) {
      current = scopeMusicBrief({ ...current, rightsConfirmed: true }, workId, episodeId);
      assert.equal(current.workId, workId);
      assert.equal(current.episodeId, workId ? episodeId : "");
      assert.equal(current.rightsConfirmed, false);
      assert.equal(current.lyrics, brief().lyrics);
    }
  });
});

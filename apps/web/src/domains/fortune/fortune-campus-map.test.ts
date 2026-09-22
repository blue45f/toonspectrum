import { describe, expect, it } from "vitest";
import { FORTUNE_EXPERIENCES } from "@toonspectrum/core/fortune";
import { FORTUNE_CAMPUS_ROOMS, fortuneCampusHref, fortuneCampusRoom } from "./fortune-campus-map";

describe("complete observatory binding", () => {
  it("covers every registered experience exactly once and no invented capability", () => {
    const ids = FORTUNE_CAMPUS_ROOMS.flatMap((room) => [...room.experiences]);
    expect(ids).toHaveLength(29);
    expect(new Set(ids).size).toBe(29);
    expect([...ids].sort()).toEqual(FORTUNE_EXPERIENCES.map((experience) => experience.id).sort());
  });
  it.each(FORTUNE_EXPERIENCES)("keeps $id on its canonical public content URL", (experience) => {
    expect(fortuneCampusRoom(experience.id)?.group).toBe(experience.group);
    expect(fortuneCampusHref(experience.id)).toBe(`/fortune?content=${experience.id}`);
  });
  it("preserves the legacy character entry without inventing a new reading", () => {
    expect(fortuneCampusHref("character")).toBe("/fortune?content=character");
    expect(fortuneCampusRoom("character")).toBeNull();
    expect(fortuneCampusHref("birth=private")).toBeNull();
    expect(fortuneCampusHref("unknown")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  createStudioMacroSession,
  recordStudioMacroCommand,
  startStudioMacroRecording,
  stopStudioMacroRecording,
} from "./studio-macro-recorder";
import { studioMacroSessionToAutoActionSet } from "./studio-macro-to-auto-actions";

describe("studio macro recorder", () => {
  it("records only while active and converts to auto-action commands", () => {
    let session = createStudioMacroSession("테스트 매크로");
    session = recordStudioMacroCommand(session, { type: "set-opacity", opacity: 0.5 });
    expect(session.commands).toHaveLength(0);

    session = startStudioMacroRecording(session, 123);
    session = recordStudioMacroCommand(session, { type: "set-opacity", opacity: 0.4 });
    session = recordStudioMacroCommand(session, { type: "set-hidden", hidden: true });
    session = recordStudioMacroCommand(session, { type: "lettering-font-size", fontSize: 18 });
    session = stopStudioMacroRecording(session);
    session = recordStudioMacroCommand(session, { type: "set-locked", locked: true });
    expect(session.commands).toHaveLength(3);

    const set = studioMacroSessionToAutoActionSet(session);
    expect(set.name).toBe("테스트 매크로");
    expect(set.commands.map((c) => c.type)).toEqual([
      "element.set-opacity",
      "element.set-hidden",
      "lettering.set-size",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { createOriginalSample } from "./ecosystem-content";
import { applyApprovedTranslations, applyWorldChange, dialogueRows, pageFingerprint, translationState, worldImpacts } from "./ecosystem-workflow";

function sample() {
  let sequence = 0;
  return createOriginalSample("romance", 800, "final", () => `id-${sequence++}`);
}

describe("creator ecosystem workflow", () => {
  it("tracks source changes before approved translation application", () => {
    const page = sample();
    const row = dialogueRows([page])[0]!;
    const draft = { id: "translation-1", pageId: page.id, elementId: row.elementId, source: row.source,
      locale: "en", text: "My latte went to your table.", approved: true, updatedAt: new Date(0).toISOString() };
    expect(translationState(row, draft)).toBe("approved");
    const pages = [page];
    const next = applyApprovedTranslations(pages, [draft], "en");
    expect(next).not.toBe(pages);
    const translated = next[0]!.elements.find(element => element.id === row.elementId);
    expect(translated && (translated.type === "text" || translated.type === "bubble") ? translated.text : null).toBe(draft.text);
    expect(translationState({ ...row, source: `${row.source}!` }, draft)).toBe("stale");
  });

  it("applies a world change only to selected, unlocked pages", () => {
    const first = sample();
    const second = { ...sample(), id: "released-page" };
    const impact = worldImpacts([first], []).find(item => item.entity === "world:nari:coat")!;
    const next = applyWorldChange([first, second], [second.id], impact.entity, impact.value, "#335577", [first.id, second.id]);
    const changed = worldImpacts(next, [second.id]).filter(item => item.entity === impact.entity && item.value === "#335577");
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(item => item.pageId === first.id)).toBe(true);
    expect(worldImpacts(next, [second.id]).some(item => item.pageId === second.id && item.entity === impact.entity && item.value === impact.value)).toBe(true);
    expect(() => applyWorldChange([first], [], impact.entity, impact.value, "red", [first.id])).toThrow(/HEX/u);
  });

  it("uses deterministic change hints", () => {
    const page = sample();
    expect(pageFingerprint(page)).toBe(pageFingerprint(page));
    expect(pageFingerprint({ ...page, note: "changed" })).not.toBe(pageFingerprint(page));
  });
});

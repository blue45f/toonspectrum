// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { createStudioAudiencePolicy, audiencePolicyStorageKey } from "../studio-audience-policy";
import { createStudioIpOpportunityDocument, ipOpportunityStorageKey } from "../studio-ip-opportunity";
import { createStudioStaffingBrief, staffingBriefStorageKey } from "../studio-staffing";
import { createStudioStoryDevelopmentDocument, storyDevelopmentStorageKey } from "../studio-story-adaptation";
import { StudioAudiencePolicyPanel } from "./StudioAudiencePolicyPanel";
import { StudioIpOpportunityPanel } from "./StudioIpOpportunityPanel";
import { StudioStaffingSourcingPanel } from "./StudioStaffingSourcingPanel";
import { StudioStoryDevelopmentPanel } from "./StudioStoryDevelopmentPanel";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
const cases = [
  { name: "audience policy", key: audiencePolicyStorageKey, field: "notes",
    seed: (id: string) => ({ ...createStudioAudiencePolicy(), notes: id }),
    view: (id: string) => <StudioAudiencePolicyPanel projectId={id} /> },
  { name: "IP opportunity", key: ipOpportunityStorageKey, field: "logline",
    seed: (id: string) => ({ ...createStudioIpOpportunityDocument(id), logline: id }),
    view: (id: string) => <StudioIpOpportunityPanel projectId={id} /> },
  { name: "staffing brief", key: staffingBriefStorageKey, field: "scope",
    seed: (id: string) => ({ ...createStudioStaffingBrief(id), scope: id }),
    view: (id: string) => <StudioStaffingSourcingPanel projectId={id} /> },
  { name: "story development", key: storyDevelopmentStorageKey, field: "title",
    seed: (id: string) => ({ ...createStudioStoryDevelopmentDocument(), title: id }),
    view: (id: string) => <StudioStoryDevelopmentPanel projectId={id} onApplyBeats={() => undefined} /> },
];
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("reviewed project-local working copies", () => {
  it.each(cases)("$name never writes the previous project's draft into the next project", ({ key, field, seed, view }) => {
    const alpha = "draft-alpha/한글";
    const beta = "draft-beta/%2F";
    window.localStorage.setItem(key(alpha), JSON.stringify(seed(alpha)));
    window.localStorage.setItem(key(beta), JSON.stringify(seed(beta)));
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const screen = render(<MemoryRouter>{view(alpha)}</MemoryRouter>);
    writes.mockClear();
    screen.rerender(<MemoryRouter>{view(beta)}</MemoryRouter>);
    const betaWrites = writes.mock.calls.filter(([storedKey]) => storedKey === key(beta));
    expect(betaWrites.length).toBeGreaterThan(0);
    for (const [, raw] of betaWrites) expect(JSON.parse(raw)[field]).toBe(beta);
    expect(JSON.parse(window.localStorage.getItem(key(alpha))!)[field]).toBe(alpha);
    expect(JSON.parse(window.localStorage.getItem(key(beta))!)[field]).toBe(beta);
    expect(writes.mock.calls.every(([storedKey]) => storedKey === key(beta))).toBe(true);
    screen.unmount();
    render(<MemoryRouter>{view(alpha)}</MemoryRouter>);
    expect(JSON.parse(window.localStorage.getItem(key(alpha))!)[field]).toBe(alpha);
  });
  it.each(cases)("$name stays editable with blocked browser storage", ({ view }) => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked read"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const screen = render(<MemoryRouter>{view("blocked-project")}</MemoryRouter>);
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });
});

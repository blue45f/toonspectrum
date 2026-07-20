import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STUDIO_TOOL_HINT_PREVIEW_KINDS } from "../studio-tool-hint-preview-kind";

import {
  StudioToolHintPreview,
} from "./StudioToolHintPreview";

const PREVIEW_KINDS = STUDIO_TOOL_HINT_PREVIEW_KINDS;

describe("StudioToolHintPreview", () => {
  it.each(PREVIEW_KINDS)("renders the %s micro-demo with stable integration hooks", (kind) => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview kind={kind} reducedMotion />
    );

    expect(html).toContain(`data-studio-tool-hint-preview="${kind}"`);
    expect(html).toContain(`data-preview-kind="${kind}"`);
    expect(html).toContain('data-motion="reduced"');
    expect(html).toContain('viewBox="0 0 216 104"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<animate");
  });

  it.each(PREVIEW_KINDS)("animates the %s demonstration when motion is allowed", (kind) => {
    const html = renderToStaticMarkup(
      <StudioToolHintPreview kind={kind} reducedMotion={false} />
    );

    expect(html).toContain('data-motion="animated"');
    expect(html).toContain("<animate");
  });

  it("gives formerly over-shared actions different visual signatures", () => {
    const actionKinds = [
      "pan",
      "transform",
      "crop",
      "comment",
      "perspective",
      "smudge",
      "liquify",
      "reference",
      "rotate-view",
      "frame-capture",
      "frame-playback",
      "frame-duplicate",
      "frame-delete",
    ] as const;
    const signatures = actionKinds.map((kind) =>
      renderToStaticMarkup(<StudioToolHintPreview kind={kind} reducedMotion />)
    );

    expect(new Set(signatures).size).toBe(actionKinds.length);
  });

  it("is decorative by default and can become a named image", () => {
    const decorative = renderToStaticMarkup(
      <StudioToolHintPreview kind="ink" reducedMotion />
    );
    const named = renderToStaticMarkup(
      <StudioToolHintPreview
        kind="ink"
        reducedMotion
        aria-label="브러시 획 미리보기"
      />
    );

    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('role="img"');
    expect(named).toContain('aria-label="브러시 획 미리보기"');
    expect(named).toContain('role="img"');
    expect(named).not.toContain("aria-hidden");
  });

  it("creates collision-free clip and ledger identifiers for sibling previews", () => {
    const html = renderToStaticMarkup(
      <div>
        <StudioToolHintPreview kind="text" reducedMotion />
        <StudioToolHintPreview kind="filter" reducedMotion />
      </div>
    );

    const identifiers = [...html.matchAll(/id="([^"]+(?:ledger|clip))"/g)].map(
      (match) => match[1]
    );

    expect(identifiers.length).toBe(4);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    for (const identifier of identifiers) {
      expect(html).toContain(`url(#${identifier})`);
    }
  });

  it("creates collision-free checker patterns for sibling opacity previews", () => {
    const html = renderToStaticMarkup(
      <div>
        <StudioToolHintPreview kind="opacity" reducedMotion />
        <StudioToolHintPreview kind="opacity" reducedMotion />
      </div>
    );

    const identifiers = [...html.matchAll(/id="([^"]+-opacity-checker)"/g)].map(
      (match) => match[1]
    );

    expect(identifiers).toHaveLength(2);
    expect(new Set(identifiers).size).toBe(2);
    for (const identifier of identifiers) {
      expect(html).toContain(`url(#${identifier})`);
    }
  });
});

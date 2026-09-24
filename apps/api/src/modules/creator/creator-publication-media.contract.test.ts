import { describe, expect, it } from "vitest";

import {
  CreatorPublicationMediaInputError,
  applyCreatorPublicationMediaPaths,
  creatorPublicationMediaSlot,
  planCreatorPublicationMediaMutation,
} from "./creator-publication-media.contract";

const dataUrl = (value: string) =>
  `data:image/png;base64,${Buffer.from(value).toString("base64")}`;

describe("creator publication media mutation planning", () => {
  it("stages inline media without persisting Base64 and preserves remote values", () => {
    const input = {
      cover: dataUrl("cover"),
      pages: [dataUrl("page-0"), "https://cdn.example.test/page-1.webp"],
    };
    const plan = planCreatorPublicationMediaMutation(input);

    expect(plan.entries.map((entry) => entry.slot)).toEqual(["cover", "page:0"]);
    expect(plan.stagedPatch).toEqual({
      cover: "",
      pages: ["", "https://cdn.example.test/page-1.webp"],
    });
    const materialized = applyCreatorPublicationMediaPaths("work / 1", input, plan);
    expect(materialized.cover).toMatch(
      /^\/api\/creator\/works\/work%20%2F%201\/media\/cover\/[a-f0-9]{64}$/,
    );
    expect(materialized.pages?.[0]).toMatch(
      /^\/api\/creator\/works\/work%20%2F%201\/media\/pages\/0\/[a-f0-9]{64}$/,
    );
    expect(materialized.pages?.[1]).toBe("https://cdn.example.test/page-1.webp");
  });

  it("is deterministic and preserves omitted update fields", () => {
    const input = { pages: [dataUrl("same"), dataUrl("same")] };
    const first = planCreatorPublicationMediaMutation(input);
    const second = planCreatorPublicationMediaMutation(input);
    expect(first).toEqual(second);
    expect(first.stagedPatch).not.toHaveProperty("cover");
    expect(creatorPublicationMediaSlot({ kind: "page", pageIndex: 4 })).toBe("page:4");
  });

  it("rejects malformed inline values and bounded mutation overflow", () => {
    expect(() => planCreatorPublicationMediaMutation({
      cover: "data:image/png;base64,not-valid***",
    })).toThrow(CreatorPublicationMediaInputError);

    expect(() => planCreatorPublicationMediaMutation({
      cover: dataUrl("12345"),
    }, 4)).toThrowError(expect.objectContaining({ reason: "mutation-too-large" }));
  });
});

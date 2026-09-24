import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hashStudioPublicationPages,
  resolveStudioPublicationOrigin,
  writeStudioPublicationIntegrity,
} from "./studio-publication-integrity";

import {
  readCreatorPublicationAudit,
  readCreatorPublicationSource,
} from "@toonspectrum/contracts/creator-publication-integrity";

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    vi.stubGlobal("crypto", {
      subtle: {
        digest: async (_algorithm: string, bytes: BufferSource) => {
          const input = new Uint8Array(bytes as ArrayBuffer);
          const output = new Uint8Array(32);
          input.forEach((value, index) => { output[index % output.length] ^= value; });
          return output.buffer;
        },
      },
    });
  }
});

describe("studio publication integrity", () => {
  it("distinguishes editor handoffs from ordinary file uploads", () => {
    expect(resolveStudioPublicationOrigin({
      currentSourceKind: null,
      studioHandoff: true,
      sourceWorkId: "work-7",
    })).toEqual({
      sourceKind: "studio_document",
      documentId: "work-7",
      disclosure: "ToonStudio 브라우저 편집기에서 제작 후 게시 인계한 원고",
      toolIds: ["toonstudio-web", "studio-editor", "publish-handoff"],
    });
    expect(resolveStudioPublicationOrigin({
      currentSourceKind: "external_tool",
      studioHandoff: false,
    })).toEqual({
      sourceKind: "external_tool",
      toolIds: ["toonstudio-web", "upload-publisher"],
    });
    expect(resolveStudioPublicationOrigin({
      studioHandoff: false,
    }).sourceKind).toBe("uploaded_file");
  });

  it("derives an ordered content checksum without exposing page bytes", async () => {
    const first = `data:text/plain;base64,${btoa("first")}`;
    const second = `data:text/plain;base64,${btoa("second")}`;

    const checksum = await hashStudioPublicationPages([first, second]);
    const reversed = await hashStudioPublicationPages([second, first]);

    expect(checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(reversed).toMatch(/^[a-f0-9]{64}$/u);
    expect(checksum).not.toBe(reversed);
  });

  it("writes source and private audit metadata at the saved revision boundary", async () => {
    const document = await writeStudioPublicationIntegrity({
      document: { pagesList: [{ id: "page-1" }] },
      sourceKind: "studio_document",
      projectId: "project-1",
      documentId: "document-1",
      revisionId: "local:7:12",
      pageImages: [`data:text/plain;base64,${btoa("page")}`],
      aiUsage: "assisted",
      ownerApproved: true,
      ownerUserId: "owner-1",
      approvedAt: "2026-09-24T10:47:13.000Z",
      toolIds: ["toonstudio-web", "studio-canvas-editor"],
    });

    expect(document.pagesList).toEqual([{ id: "page-1" }]);
    expect(readCreatorPublicationSource(document)).toMatchObject({
      kind: "studio_document",
      projectId: "project-1",
      documentId: "document-1",
      revisionId: "local:7:12",
      disclosure: "ToonStudio에서 AI 보조 기능을 사용해 제작한 원고",
    });
    expect(readCreatorPublicationSource(document)?.contentChecksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(readCreatorPublicationAudit(document)).toEqual({
      version: 1,
      editorActor: "owner",
      publisherActor: "owner",
      ownerApproved: true,
      ownerUserId: "owner-1",
      approvedAt: "2026-09-24T10:47:13.000Z",
      toolIds: ["toonstudio-web", "studio-canvas-editor"],
    });
  });

  it("preserves an explicit agent editor audit while recording the current publisher", async () => {
    const document = await writeStudioPublicationIntegrity({
      document: {
        publicationAudit: {
          editorActor: "agent",
          publisherActor: "agent",
          ownerApproved: false,
          toolIds: ["browser-agent"],
        },
      },
      sourceKind: "uploaded_file",
      revisionId: "upload:2",
      pageImages: ["https://cdn.example.test/page.webp"],
      publisherActor: "owner",
      ownerApproved: true,
      ownerUserId: "owner-1",
      toolIds: ["upload-publisher"],
    });

    expect(readCreatorPublicationAudit(document)).toMatchObject({
      editorActor: "agent",
      publisherActor: "owner",
      ownerApproved: true,
      toolIds: ["browser-agent", "upload-publisher"],
    });
  });
});

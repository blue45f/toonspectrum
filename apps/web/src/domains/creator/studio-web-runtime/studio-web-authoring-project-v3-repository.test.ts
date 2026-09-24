import { describe, expect, it } from "vitest";

import { createStudioScene3dDocument } from "../scene3d/studio-scene3d-document";
import {
  createStudioWebAuthoringProjectV3,
} from "./studio-web-authoring-project-v3";
import { StudioWebAuthoringProjectV3Repository } from "./studio-web-authoring-project-v3-repository";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

function project(revision = 1) {
  return createStudioWebAuthoringProjectV3({
    projectId: "project:repository",
    title: "Browser 3D project",
    scene: {
      ...createStudioScene3dDocument(
        "project:repository",
        "2026-09-24T00:00:00.000Z",
      ),
      revision,
    },
    revision,
    now: "2026-09-24T00:00:00.000Z",
  });
}

function memoryStore() {
  const rows = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); },
    delete: async (key) => { rows.delete(key); },
  };
  return { rows, store };
}

describe("Studio web authoring project V3 repository", () => {
  it("persists and reopens a browser-first project without a native host", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => memory.store,
    });

    expect((await repository.save(project())).status).toBe("saved");
    expect((await repository.save(project())).status).toBe("unchanged");
    const restored = await repository.load("project:repository");
    expect(restored).toEqual(project());
    expect(restored?.runtime).toMatchObject({
      primaryEnvironment: "browser",
      browserRequired: true,
      nativeRequired: false,
    });
  });

  it("protects durable state from stale and regressing writes", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => memory.store,
    });
    await repository.save(project(3));

    await expect(repository.save(project(4), { expectedStoredRevision: 2 }))
      .rejects.toMatchObject({
        code: "revision-conflict",
      });
    await expect(repository.save(project(2)))
      .rejects.toMatchObject({
        code: "revision-regression",
      });
    expect((await repository.load("project:repository"))?.revision).toBe(3);
  });

  it("serializes overlapping saves per project", async () => {
    const memory = memoryStore();
    const gate = Promise.withResolvers<void>();
    let first = true;
    const store: StudioAsyncKeyValueStore = {
      ...memory.store,
      set: async (key, value) => {
        if (first) {
          first = false;
          await gate.promise;
        }
        memory.rows.set(key, value);
      },
    };
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => store,
    });

    const one = repository.save(project(1));
    const two = repository.save(project(2));
    gate.resolve();
    await Promise.all([one, two]);
    expect((await repository.load("project:repository"))?.revision).toBe(2);
  });
});

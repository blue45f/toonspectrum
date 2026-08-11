import { describe, expect, it } from "vitest";

import {
  createStudioDryMediaUnionContinuationOpfsCasStore,
} from "./studio-dry-media-union-continuation-opfs-store";
import { StudioOpfsSyncAccessError } from "./studio-opfs-sync-access-store";
import { sha256HexPortable } from "./studio-sha256";

class MemoryFile {
  bytes = new Uint8Array(0);

  async createSyncAccessHandle() {
    let closed = false;
    return {
      getSize: () => this.bytes.byteLength,
      read: (target: Uint8Array, { at }: { readonly at: number }) => {
        if (closed) throw new Error("closed");
        const available = Math.max(
          0,
          Math.min(target.byteLength, this.bytes.byteLength - at),
        );
        target.set(this.bytes.subarray(at, at + available));
        return available;
      },
      write: (source: Uint8Array, { at }: { readonly at: number }) => {
        if (closed) throw new Error("closed");
        const nextLength = Math.max(this.bytes.byteLength, at + source.byteLength);
        if (nextLength !== this.bytes.byteLength) {
          const next = new Uint8Array(nextLength);
          next.set(this.bytes);
          this.bytes = next;
        }
        this.bytes.set(source, at);
        return source.byteLength;
      },
      truncate: (nextSize: number) => {
        const next = new Uint8Array(nextSize);
        next.set(this.bytes.subarray(0, nextSize));
        this.bytes = next;
      },
      flush: () => undefined,
      close: () => {
        closed = true;
      },
    };
  }
}

class MemoryDirectory {
  readonly directories = new Map<string, MemoryDirectory>();
  readonly files = new Map<string, MemoryFile>();

  async getDirectoryHandle(name: string, options?: { readonly create?: boolean }) {
    const current = this.directories.get(name);
    if (current) return current;
    if (!options?.create) throw new DOMException("missing", "NotFoundError");
    const created = new MemoryDirectory();
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options?: { readonly create?: boolean }) {
    const current = this.files.get(name);
    if (current) return current;
    if (!options?.create) throw new DOMException("missing", "NotFoundError");
    const created = new MemoryFile();
    this.files.set(name, created);
    return created;
  }

  async removeEntry(name: string) {
    if (!this.files.delete(name) && !this.directories.delete(name)) {
      throw new DOMException("missing", "NotFoundError");
    }
  }

  async *keys(): AsyncIterable<string> {
    yield* this.directories.keys();
    yield* this.files.keys();
  }
}

class DedicatedWorkerGlobalScope {
  readonly navigator: {
    readonly storage: { readonly getDirectory: () => Promise<MemoryDirectory> };
  };

  constructor(root: MemoryDirectory) {
    this.navigator = { storage: { getDirectory: async () => root } };
  }
}

describe("dry-media continuation OPFS CAS", () => {
  it("snapshots caller buffers before queued sync writes and reopens exact bytes", async () => {
    const root = new MemoryDirectory();
    const scope = new DedicatedWorkerGlobalScope(root);
    const first = await createStudioDryMediaUnionContinuationOpfsCasStore(scope);
    const page = new Uint8Array([11, 12, 13, 14]);
    const expectedPage = page.slice();
    const digest = sha256HexPortable(page);
    const write = first.putCas("page", digest, page);
    page.fill(99);
    await write;
    expect(await first.getCas("page", digest)).toEqual(expectedPage);

    const staging = new Uint8Array([5, 6, 7]);
    const append = first.appendStaging("stroke-opfs", BigInt(0), staging);
    staging.fill(88);
    await expect(append).resolves.toBe(BigInt(3));
    await expect(first.appendStaging(
      "stroke-opfs",
      BigInt(0),
      new Uint8Array([9]),
    )).rejects.toMatchObject({ code: "WRITE_FAILED" });

    const reopened = await createStudioDryMediaUnionContinuationOpfsCasStore(scope);
    expect(await reopened.getCas("page", digest)).toEqual(expectedPage);
    await reopened.removeStaging("stroke-opfs");
    await first.close();
    await expect(first.getCas("page", digest)).rejects.toMatchObject({
      code: "STORE_CLOSED",
    });
    await reopened.close();
  });

  it("fails closed outside a Dedicated Worker and rejects forged CAS identities", async () => {
    await expect(createStudioDryMediaUnionContinuationOpfsCasStore({
      document: {},
      navigator: { storage: { getDirectory: async () => new MemoryDirectory() } },
    })).rejects.toEqual(expect.objectContaining<Partial<StudioOpfsSyncAccessError>>({
      code: "NOT_DEDICATED_WORKER",
    }));

    const store = await createStudioDryMediaUnionContinuationOpfsCasStore(
      new DedicatedWorkerGlobalScope(new MemoryDirectory()),
    );
    await expect(store.putCas(
      "page",
      "0".repeat(64),
      new Uint8Array([1, 2, 3]),
    )).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await store.close();
  });
});

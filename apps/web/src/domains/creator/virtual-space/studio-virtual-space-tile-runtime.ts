import { studioTileViewportChunkKey, studioVisibleTileChunks, type StudioTileChunk, type StudioTileset, type StudioTileViewport, type StudioTileWorld } from "./studio-virtual-space-tile-chunks";

interface TileRuntimeOptions {
  readonly resolveUrl?: (url: string) => string;
  readonly parseGid: (gid: number) => { gid: number; rotation: number; flipped: boolean };
  readonly onError: (message: string) => void;
}

type TextureResult = { readonly width: number; readonly height: number } | { readonly error: string };
export interface StudioTileRuntimeBackend {
  requestTexture(tileset: StudioTileset, complete: (result: TextureResult) => void): void;
  removeTexture(tileset: StudioTileset): void;
  mountChunk(chunk: StudioTileChunk): () => void;
  onError(message: string): void;
  close?(): void;
}

/** 카메라가 요구한 청크와 이 runtime이 요청한 텍스처만 소유한다. */
export class StudioWorldTileRuntime {
  private readonly chunks = new Map<string, () => void>();
  private readonly loaded = new Set<number>();
  private readonly failed = new Set<number>();
  private readonly failedChunks = new Set<string>();
  private readonly pending = new Set<number>();
  private wanted: readonly StudioTileChunk[] = [];
  private closed = false;
  private viewportKey: string | undefined;

  constructor(private readonly world: StudioTileWorld, private readonly backend: StudioTileRuntimeBackend) {}

  update(viewport: StudioTileViewport): void {
    if (this.closed) return;
    const key = studioTileViewportChunkKey(this.world, viewport);
    if (this.viewportKey === key) return;
    this.viewportKey = key;
    this.wanted = studioVisibleTileChunks(this.world, viewport);
    this.reconcile();
  }

  private reconcile(): void {
    if (this.closed) return;
    const ids = new Set(this.wanted.map((chunk) => chunk.key));
    for (const [key, dispose] of this.chunks) {
      if (!ids.has(key)) { dispose(); this.chunks.delete(key); }
    }
    const needed = new Set(this.wanted.flatMap((chunk) => chunk.tilesets.map((tileset) => tileset.firstGid)));
    for (const tileset of this.world.tilesets) {
      if (!needed.has(tileset.firstGid) && this.loaded.delete(tileset.firstGid)) this.backend.removeTexture(tileset);
    }
    for (const chunk of this.wanted) {
      for (const tileset of chunk.tilesets) this.load(tileset);
      if (!this.chunks.has(chunk.key) && !this.failedChunks.has(chunk.key)
        && chunk.tilesets.every((tileset) => this.loaded.has(tileset.firstGid))) {
        try { this.chunks.set(chunk.key, this.backend.mountChunk(chunk)); }
        catch (error) {
          this.failedChunks.add(chunk.key);
          this.backend.onError(error instanceof Error ? error.message : "타일 레이어 생성에 실패했습니다.");
        }
      }
    }
  }

  private load(tileset: StudioTileset): void {
    const id = tileset.firstGid;
    if (this.loaded.has(id) || this.pending.has(id) || this.failed.has(id)) return;
    this.pending.add(id);
    let completed = false;
    const complete = (result: TextureResult) => {
      if (completed) return;
      completed = true;
      this.pending.delete(id);
      if (this.closed) { this.backend.removeTexture(tileset); return; }
      if ("error" in result || result.width !== tileset.imageWidth || result.height !== tileset.imageHeight) {
        this.backend.removeTexture(tileset);
        this.failed.add(id);
        this.backend.onError("error" in result ? result.error : `타일 이미지 크기가 매니페스트와 다릅니다: ${tileset.name}`);
        return;
      }
      this.loaded.add(id);
      this.reconcile();
    };
    try { this.backend.requestTexture(tileset, complete); }
    catch { complete({ error: `타일 이미지를 불러오지 못했습니다: ${tileset.name}` }); }
  }

  get diagnostics() {
    return {
      chunks: this.chunks.size, textures: this.loaded.size, pending: this.pending.size,
      failures: this.failed.size + this.failedChunks.size,
      ready: !this.closed && this.viewportKey !== undefined && this.viewportKey !== "invalid"
        && this.wanted.every((chunk) => this.chunks.has(chunk.key)),
    };
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    for (const dispose of this.chunks.values()) dispose();
    this.chunks.clear();
    for (const tileset of this.world.tilesets) {
      if (this.loaded.has(tileset.firstGid)) this.backend.removeTexture(tileset);
    }
    // 진행 중인 다운로드는 완료 콜백이 회수한다. 여기서 listener를 지우면 늦은 텍스처가 남는다.
    this.loaded.clear(); this.pending.clear(); this.wanted = [];
    this.backend.close?.();
  }
}

interface TileLayerPort {
  setScale(x: number, y: number): TileLayerPort;
  setDepth(depth: number): TileLayerPort;
  setAlpha(alpha: number): TileLayerPort;
  putTileAt(gid: number, x: number, y: number, recalculate: boolean): { rotation: number; flipX: boolean } | null;
}
interface TilemapPort {
  addTilesetImage(name: string, key: string, width: number, height: number, margin: number, spacing: number, firstGid: number): object | null;
  createBlankLayer(name: string, tilesets: string[], x: number, y: number): TileLayerPort | null;
  destroy(): void;
}
/** 실제 Phaser Scene이 구조적으로 충족하는 사용 표면만 노출한다. */
export interface StudioTileScenePort {
  readonly textures: {
    once(event: string, listener: () => void): unknown;
    off(event: string, listener: () => void): unknown;
    exists(key: string): boolean;
    get(key: string): { getSourceImage(): { width: number; height: number } };
    remove(key: string): unknown;
  };
  readonly load: {
    once(event: string, listener: () => void): unknown;
    on(event: "loaderror", listener: (file: { key: string }) => void): unknown;
    off(event: "loaderror", listener: (file: { key: string }) => void): unknown;
    off(event: string, listener: () => void): unknown;
    image(key: string, url: string): unknown;
    isLoading(): boolean;
    start(): unknown;
  };
  readonly make: { tilemap(config: { width: number; height: number; tileWidth: number; tileHeight: number }): TilemapPort };
  readonly events: { once(event: string, listener: () => void): unknown; off(event: string, listener: () => void): unknown };
}

let nextRuntimeId = 0;

/** 같은 Scene/namespace의 이전 다운로드가 다음 runtime의 텍스처를 지우지 않도록 세대를 나눈다. */
export function createStudioWorldTileRuntime(scene: StudioTileScenePort, world: StudioTileWorld, namespace: string, options: TileRuntimeOptions): StudioWorldTileRuntime {
  const ownedNamespace = `${namespace}:${++nextRuntimeId}`;
  const keyFor = (tileset: StudioTileset) => `${ownedNamespace}:tiles:${tileset.firstGid}`;
  const pending = new Map<() => void, () => void>();
  let closed = false;
  const detach = () => { scene.events.off("shutdown", shutdown); scene.events.off("destroy", destroyScene); };
  const remove = (tileset: StudioTileset) => { const key = keyFor(tileset); if (scene.textures.exists(key)) scene.textures.remove(key); };
  const runtime = new StudioWorldTileRuntime(world, {
    onError: options.onError,
    close: () => { closed = true; if (pending.size === 0) detach(); },
    removeTexture: remove,
    requestTexture: (tileset, done) => {
      const key = keyFor(tileset);
      // TextureManager는 Scene loader의 shutdown 뒤에도 살아 있으므로 늦은 cache 등록을 회수할 수 있다.
      const event = `addtexture-${key}`;
      const dispose = () => {
        scene.textures.off(event, complete); scene.load.off("loaderror", error);
        scene.load.off("complete", batchComplete); pending.delete(dispose);
        if (closed && pending.size === 0) detach();
      };
      const complete = () => {
        dispose();
        const image = scene.textures.get(key).getSourceImage();
        done({ width: image.width, height: image.height });
      };
      const error = (file: { key: string }) => {
        if (file.key !== key) return;
        dispose(); done({ error: `타일 이미지를 불러오지 못했습니다: ${tileset.name}` });
      };
      // HTTP 성공 뒤 이미지 해독 실패는 loaderror를 내지 않으므로 batch 종료도 확인한다.
      const batchComplete = () => { if (scene.textures.exists(key)) complete(); else error({ key }); };
      const watchLoader = () => {
        scene.load.off("loaderror", error); scene.load.on("loaderror", error);
        scene.load.off("complete", batchComplete); scene.load.once("complete", batchComplete);
      };
      pending.set(dispose, watchLoader);
      scene.textures.once(event, complete); watchLoader();
      try {
        scene.load.image(key, options.resolveUrl?.(tileset.imageUrl) ?? tileset.imageUrl);
        if (!scene.load.isLoading()) scene.load.start();
      } catch (failure) { dispose(); throw failure; }
    },
    mountChunk: (chunk) => {
      const first = chunk.tilesets[0];
      if (!first) throw new Error("비어 있는 타일 청크는 생성할 수 없습니다.");
      const map = scene.make.tilemap({ width: chunk.width, height: chunk.height, tileWidth: first.tileWidth, tileHeight: first.tileHeight });
      try {
        for (const tileset of chunk.tilesets) {
          if (!map.addTilesetImage(tileset.name, keyFor(tileset), tileset.tileWidth, tileset.tileHeight, tileset.margin, tileset.spacing, tileset.firstGid)) {
            throw new Error(`타일셋을 만들지 못했습니다: ${tileset.name}`);
          }
        }
        const layer = map.createBlankLayer(chunk.key, chunk.tilesets.map((tileset) => tileset.name),
          chunk.layer.x + chunk.column * world.tileWidth, chunk.layer.y + chunk.row * world.tileHeight);
        if (!layer) throw new Error(`타일 레이어를 만들지 못했습니다: ${chunk.layer.name}`);
        layer.setScale(world.tileWidth / first.tileWidth, world.tileHeight / first.tileHeight).setDepth(chunk.layer.depth).setAlpha(chunk.layer.opacity);
        for (let index = 0; index < chunk.data.length; index += 1) {
          const parsed = options.parseGid(chunk.data[index] ?? 0);
          if (parsed.gid === 0) continue;
          const tile = layer.putTileAt(parsed.gid, index % chunk.width, Math.floor(index / chunk.width), false);
          if (tile) { tile.rotation = parsed.rotation; tile.flipX = parsed.flipped; }
        }
        return () => map.destroy();
      } catch (error) { map.destroy(); throw error; }
    },
  });
  function shutdown() {
    runtime.destroy();
    // Phaser의 loader shutdown은 파일을 중단하지 않고 listener만 지운다. 남은 파일의 실패도 회수한다.
    for (const watchLoader of pending.values()) watchLoader();
  }
  function destroyScene() {
    runtime.destroy();
    for (const dispose of [...pending.keys()]) dispose();
    for (const tileset of world.tilesets) remove(tileset);
    detach();
  }
  scene.events.once("shutdown", shutdown); scene.events.once("destroy", destroyScene);
  return runtime;
}

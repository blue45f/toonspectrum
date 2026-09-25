import { studioWorldTilemapSchema, type StudioWorldTilemap } from "@toonspectrum/studio-project-model/world-publication";
import Phaser from "phaser";

import { createStudioWorldTileRuntime, type StudioWorldTileRuntime } from "../../src/domains/creator/virtual-space/studio-virtual-space-tile-runtime";

// 개발 전용: 원본 이미지를 실제 Phaser TilemapLayer로 렌더링한다. 서비스 월드로 게시하지 않는다.
const columns = 64, rows = 48, cell = 64;
const data = Array.from({ length: columns * rows }, (_, index) => {
  const x = index % columns, y = Math.floor(index / columns);
  const material = x > 26 && x < 37 || y > 19 && y < 28 ? 1 : 2;
  return (material | (x % 2 ? 0x80000000 : 0) | (y % 2 ? 0x40000000 : 0)) >>> 0;
});
const world: StudioWorldTilemap = studioWorldTilemapSchema.parse({
  orientation: "orthogonal", renderOrder: "right-down", width: columns, height: rows, tileWidth: cell, tileHeight: cell,
  tilesets: ["limestone", "grass"].map((name, index) => ({
    firstGid: index + 1, name, imageUrl: `/assets/virtual-studio/world-v2/tiles/${name}-native.png`,
    imageWidth: 1254, imageHeight: 1254, tileWidth: 1254, tileHeight: 1254, columns: 1, tileCount: 1, margin: 0, spacing: 0,
  })),
  layers: [{ id: "ground", name: "바닥", width: columns, height: rows, x: 0, y: 0, visible: true, opacity: 1, depth: 0, data }],
});
let runtime: StudioWorldTileRuntime | null = null;
let errors: string[] = [];
const root = document.getElementById("tile-root");
if (!root) throw new Error("타일 검증 화면이 없습니다.");
const selectedRenderer = new URLSearchParams(location.search).get("renderer") === "canvas" ? Phaser.CANVAS : Phaser.WEBGL;
const game = new Phaser.Game({
  type: selectedRenderer, parent: root, width: innerWidth, height: innerHeight,
  backgroundColor: "#24372d", antialias: true,
  scale: { mode: Phaser.Scale.RESIZE },
  scene: {
    key: "tile-world",
    create(this: Phaser.Scene) {
      this.cameras.main.setBounds(0, 0, columns * cell, rows * cell).centerOn(32 * cell, 24 * cell);
      runtime = createStudioWorldTileRuntime(this, world, "browser-tile-qa", {
        parseGid: Phaser.Tilemaps.Parsers.Tiled.ParseGID,
        onError: (message) => { errors.push(message); },
      });
    },
    update(this: Phaser.Scene) {
      runtime?.update(this.cameras.main.worldView);
      const status = document.getElementById("tile-status");
      const metrics = runtime?.diagnostics;
      if (status && metrics) {
        status.textContent = errors.length ? errors.join(" · ") : `${metrics.ready ? "준비 완료" : "타일 로딩 중"} · ${metrics.chunks}개 청크 · ${metrics.textures}개 원본 이미지`;
        status.dataset.ready = String(metrics.ready);
      }
    },
  },
});

export function state() {
  const scene = game.scene.getScenes(true)[0];
  const camera = scene?.cameras.main;
  return {
    ...runtime?.diagnostics, errors,
    renderer: game.renderer.type === Phaser.WEBGL ? "webgl" : "canvas",
    textureKeys: game.textures.getTextureKeys(), layers: scene?.children.list.length ?? 0,
    viewport: { width: game.scale.width, height: game.scale.height },
    scroll: camera ? { x: camera.scrollX, y: camera.scrollY } : null,
    worldView: camera ? { x: camera.worldView.x, y: camera.worldView.y, width: camera.worldView.width, height: camera.worldView.height } : null,
  };
}
export function pan(x: number, y: number, zoom = 1) { game.scene.getScenes(true)[0]?.cameras.main.setZoom(zoom).centerOn(x, y); }
export function dispose() { runtime?.destroy(); runtime = null; }
export function restart() { errors = []; game.scene.getScenes(true)[0]?.scene.restart(); }
export function destroy() { game.destroy(true); }

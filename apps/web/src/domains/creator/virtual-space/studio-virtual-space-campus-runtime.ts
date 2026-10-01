/**
 * 공중섬 캠퍼스 런타임(Phaser): 섬 가장자리 절벽, 3/4 시점 벽·문·매트, 구역 표지판, 코드로 그린 오브젝트,
 * 광장 바닥 무늬를 만든다.
 *
 * - 벽의 보이는 사각형은 manifest 충돌체와 같은 값(campus-world의 studioCampusWallSegments)을 쓴다.
 * - 깊이: 바닥 타일(-996·-994) < 바닥 장식(-980·-900) < 옆벽 윗면(900) < y 정렬(바닥 y + 1000) < 벽걸이(벽 + 1·2).
 * - Canvas는 생성·update·destroy만 부른다(Canvas 파일이 더 커지지 않게 캠퍼스 그리기는 모두 이 모듈에 둔다).
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  CAMPUS_HEIGHT,
  CAMPUS_NORTH_WALL_HEIGHT,
  CAMPUS_PLAZA_MOTTO,
  CAMPUS_WIDTH,
  CAMPUS_ZONES,
  type StudioCampusObject,
  type StudioCampusZoneBlueprint,
} from "./studio-virtual-space-campus-blueprint";
import {
  CAMPUS_ART,
  CAMPUS_TEXTURE_SCALE,
  campusDoorMatTexture,
  campusNorthWallTexture,
  campusObjectTexture,
  campusRailingTexture,
  campusShade,
  campusSideWallTexture,
  campusSignTexture,
  campusSouthWallTexture,
  campusStyleColor,
} from "./studio-virtual-space-campus-textures";
import type { StudioCampusScene, StudioCampusSign, StudioCampusWallSegment } from "./studio-virtual-space-campus-world";

type CampusScene = Pick<Phaser.Scene, "add" | "textures">;

export interface StudioCampusRuntimeOptions {
  readonly style: StudioVirtualArtStyleKey;
  /** bt(한국어, 영어). 표지판 부제·광장 문구에 쓴다. */
  readonly translate: (ko: string, en: string) => string;
}

const ISLAND = Object.freeze({ left: 64, top: 64, right: CAMPUS_WIDTH - 64, bottom: CAMPUS_HEIGHT - 64 });
const SIDE_WALL_DEPTH = 900;
const FLOOR_DECAL_DEPTH = -900;
const GROUND_ART_DEPTH = -980;
const CLIFF_DEPTH = -990;

/** 벽 사각형의 y 정렬 깊이(아래 가장자리 + 1000). 옆벽은 바닥 높이 띠라서 고정 깊이. */
export function studioCampusWallDepth(wall: StudioCampusWallSegment): number {
  if (wall.side === "west" || wall.side === "east") return SIDE_WALL_DEPTH;
  return Math.round(wall.rect.y + wall.rect.height) + 1_000;
}

/** 오브젝트의 y 정렬 깊이. 벽걸이는 붙은 북쪽 벽 바로 앞(벽 + 1)이다. */
export function studioCampusObjectDepth(object: StudioCampusObject, zones: readonly StudioCampusZoneBlueprint[] = CAMPUS_ZONES): number {
  if (object.wallMounted) {
    const zone = zones.find((candidate) => {
      const x = candidate.tiles.column * 64, y = candidate.tiles.row * 64;
      return object.x >= x && object.x <= x + candidate.tiles.width * 64 && object.y >= y && object.y <= y + candidate.tiles.height * 64;
    });
    if (zone) return zone.tiles.row * 64 + CAMPUS_NORTH_WALL_HEIGHT + 1_001;
  }
  return Math.round(object.y) + 1_000;
}

/** 표지판 깊이: 벽 위 간판은 벽 + 2(문을 지나는 사람 머리 위), 기둥 간판은 발밑 y 정렬. */
export function studioCampusSignDepth(sign: StudioCampusSign): number {
  return sign.mount === "wall" ? Math.round(sign.y - 6 + CAMPUS_NORTH_WALL_HEIGHT) + 1_002 : Math.round(sign.y) + 1_000;
}

export class StudioCampusRuntime {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly glows: { readonly target: Phaser.GameObjects.Image; readonly phase: number }[] = [];

  constructor(scene: CampusScene, campus: StudioCampusScene, options: StudioCampusRuntimeOptions) {
    const { style } = options;
    this.drawIslandRim(scene, style);
    this.drawPlaza(scene, style, options.translate);
    for (const zone of campus.zones) {
      const walls = campus.walls.filter((wall) => wall.zoneId === zone.roomId);
      this.drawWalls(scene, zone, walls, style);
    }
    // 문 안쪽 바닥의 매트: 문 틈 바로 안쪽에 놓아 입구를 알린다.
    for (const doorway of campus.doorways) {
      const mat = scene.add.image(0, 0, campusDoorMatTexture(scene, style)).setDisplaySize(104, 30).setDepth(FLOOR_DECAL_DEPTH).setAlpha(0.92);
      const centerX = doorway.rect.x + doorway.rect.width / 2, centerY = doorway.rect.y + doorway.rect.height / 2;
      if (doorway.side === "south") mat.setPosition(centerX, doorway.rect.y - 16);
      else if (doorway.side === "north") mat.setPosition(centerX, doorway.rect.y + doorway.rect.height + 16);
      else mat.setAngle(90).setPosition(doorway.side === "west" ? doorway.rect.x + doorway.rect.width + 16 : doorway.rect.x - 16, centerY);
      this.objects.push(mat);
    }
    for (const object of campus.objects) this.drawObject(scene, object, style);
    for (const sign of campus.signs) this.drawSign(scene, sign, style, options.translate);
  }

  private drawIslandRim(scene: CampusScene, style: StudioVirtualArtStyleKey): void {
    const rock = campusStyleColor(CAMPUS_ART.rock, style);
    const cliff = scene.add.graphics().setDepth(CLIFF_DEPTH);
    // 남쪽 절벽 면: 섬 아래로 떨어지는 바위층.
    const top = ISLAND.bottom;
    const height = CAMPUS_HEIGHT - top;
    cliff.fillStyle(campusShade(rock, 0.12), 1).fillRect(ISLAND.left, top, ISLAND.right - ISLAND.left, 14);
    cliff.fillStyle(rock, 1).fillRect(ISLAND.left + 6, top + 14, ISLAND.right - ISLAND.left - 12, height - 14);
    cliff.fillStyle(campusShade(rock, -0.3), 1).fillRect(ISLAND.left + 12, top + 40, ISLAND.right - ISLAND.left - 24, height - 40);
    for (let x = ISLAND.left + 20; x < ISLAND.right - 20; x += 46) {
      const jag = 10 + ((x * 7) % 17);
      cliff.fillStyle(campusShade(rock, -0.45), 0.8).fillTriangle(x, CAMPUS_HEIGHT, x + 23, CAMPUS_HEIGHT - jag, x + 46, CAMPUS_HEIGHT);
      cliff.lineStyle(1, campusShade(rock, 0.25), 0.4).lineBetween(x, top + 22 + (x % 9), x + 30, top + 22 + (x % 9));
    }
    // 동·서·북 가장자리: 얇은 바위 테두리와 그림자.
    cliff.fillStyle(campusShade(rock, -0.15), 1)
      .fillRect(ISLAND.left - 10, ISLAND.top, 10, ISLAND.bottom - ISLAND.top + 20)
      .fillRect(ISLAND.right, ISLAND.top, 10, ISLAND.bottom - ISLAND.top + 20)
      .fillRect(ISLAND.left, ISLAND.top - 8, ISLAND.right - ISLAND.left, 8);
    cliff.lineStyle(3, campusShade(CAMPUS_ART.greenDeep, style === "neon" ? -0.4 : 0), 0.55)
      .strokeRect(ISLAND.left + 1, ISLAND.top + 1, ISLAND.right - ISLAND.left - 2, ISLAND.bottom - ISLAND.top - 2);
    this.objects.push(cliff);
  }

  private drawPlaza(scene: CampusScene, style: StudioVirtualArtStyleKey, translate: StudioCampusRuntimeOptions["translate"]): void {
    const stone = campusStyleColor(0xd9d2c3, style);
    const inlay = scene.add.graphics().setDepth(GROUND_ART_DEPTH);
    const cx = 1472, cy = 1110;
    inlay.fillStyle(campusShade(stone, -0.35), 0.35).fillEllipse(cx, cy + 6, 540, 300);
    inlay.fillStyle(stone, 0.55).fillEllipse(cx, cy, 520, 280);
    inlay.lineStyle(3, campusShade(stone, 0.4), 0.8).strokeEllipse(cx, cy, 520, 280);
    inlay.lineStyle(2, campusShade(stone, -0.25), 0.55).strokeEllipse(cx, cy, 440, 232);
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      inlay.lineStyle(2, campusShade(stone, -0.2), 0.45)
        .lineBetween(cx + Math.cos(angle) * 220, cy + Math.sin(angle) * 116, cx + Math.cos(angle) * 260, cy + Math.sin(angle) * 140);
    }
    for (const [x, y] of [[cx, cy - 140], [cx, cy + 140], [cx - 260, cy], [cx + 260, cy]] as const) {
      inlay.fillStyle(campusStyleColor(CAMPUS_ART.gold, style), 0.7).fillCircle(x, y, 6);
    }
    this.objects.push(inlay);
    const motto = scene.add.text(CAMPUS_PLAZA_MOTTO.x, CAMPUS_PLAZA_MOTTO.y, translate(CAMPUS_PLAZA_MOTTO.textKo, CAMPUS_PLAZA_MOTTO.textEn), {
      fontFamily: "Pretendard, Inter, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: `#${campusShade(stone, 0.5).toString(16).padStart(6, "0")}`,
      resolution: CAMPUS_TEXTURE_SCALE,
    }).setOrigin(0.5).setAlpha(0.72).setDepth(GROUND_ART_DEPTH + 1);
    this.objects.push(motto);
  }

  private drawWalls(scene: CampusScene, zone: StudioCampusZoneBlueprint, walls: readonly StudioCampusWallSegment[], style: StudioVirtualArtStyleKey): void {
    const jamb = campusShade(campusStyleColor(zone.wallTint, style), -0.35);
    for (const wall of walls) {
      const { x, y, width, height } = wall.rect;
      const depth = studioCampusWallDepth(wall);
      if (wall.side === "north") {
        const sprite = scene.add.tileSprite(x, y, width, height, campusNorthWallTexture(scene, zone.wallTint, style))
          .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE).setDepth(depth);
        // 벽 아래 바닥에 떨어지는 부드러운 그림자로 벽이 서 있는 느낌을 준다.
        const shade = scene.add.graphics().setDepth(FLOOR_DECAL_DEPTH);
        shade.fillStyle(CAMPUS_ART.shadow, 0.2).fillRect(x, y + height, width, 5);
        shade.fillStyle(CAMPUS_ART.shadow, 0.1).fillRect(x, y + height + 5, width, 7);
        this.objects.push(sprite, shade);
      } else if (wall.side === "south") {
        const sprite = scene.add.tileSprite(x, y, width, height, campusSouthWallTexture(scene, zone.wallTint, style))
          .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE).setDepth(depth);
        this.objects.push(sprite);
      } else {
        const sprite = scene.add.tileSprite(x, y, width, height, campusSideWallTexture(scene, zone.wallTint, style))
          .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE, 1 / CAMPUS_TEXTURE_SCALE).setDepth(depth);
        this.objects.push(sprite);
      }
      // 문설주와 벽 끝 기둥: 벽 구간 양 끝을 짙은 기둥으로 마감한다.
      const posts = scene.add.graphics().setDepth(depth + 1);
      if (wall.side === "north" || wall.side === "south") {
        for (const px of [x, x + width - 6]) posts.fillStyle(jamb, 1).fillRect(px, y, 6, height);
      } else {
        for (const py of [y, y + height - 6]) posts.fillStyle(jamb, 1).fillRect(x, py, width, 6);
      }
      this.objects.push(posts);
    }
  }

  private drawObject(scene: CampusScene, object: StudioCampusObject, style: StudioVirtualArtStyleKey): void {
    if (object.kind === "railing") {
      const railing = scene.add.tileSprite(object.x - object.width / 2, object.y - object.height, object.width, object.height,
        campusRailingTexture(scene, style))
        .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE).setDepth(Math.round(object.y) + 1_000);
      this.objects.push(railing);
      return;
    }
    const key = campusObjectTexture(scene, object, style);
    if (!key) return;
    const image = scene.add.image(object.x, object.y, key).setOrigin(0.5, 1)
      .setDisplaySize(object.width, object.height).setDepth(studioCampusObjectDepth(object));
    this.objects.push(image);
    if (object.kind === "stage-screen" || object.kind === "arcade-cabinet") this.glows.push({ target: image, phase: this.glows.length * 1.7 });
  }

  private drawSign(scene: CampusScene, sign: StudioCampusSign, style: StudioVirtualArtStyleKey, translate: StudioCampusRuntimeOptions["translate"]): void {
    const zone = CAMPUS_ZONES.find((candidate) => candidate.roomId === sign.zoneId);
    const key = campusSignTexture(scene, {
      title: sign.signEn,
      subtitle: translate(sign.labelKo, sign.labelEn),
      width: sign.width,
      height: sign.height,
      accent: zone ? campusShade(zone.wallTint, 0.45) : CAMPUS_ART.cream,
    }, style);
    const depth = studioCampusSignDepth(sign);
    if (sign.mount === "post") {
      const posts = scene.add.graphics().setDepth(depth);
      const wood = campusStyleColor(CAMPUS_ART.woodDark, style);
      for (const px of [sign.x - sign.width / 2 + 18, sign.x + sign.width / 2 - 24]) {
        posts.fillStyle(wood, 1).fillRect(px, sign.y - 30, 6, 30);
        posts.fillStyle(campusShade(wood, 0.3), 1).fillRect(px, sign.y - 30, 2, 30);
      }
      posts.fillStyle(CAMPUS_ART.shadow, 0.22).fillEllipse(sign.x, sign.y, sign.width * 0.8, 8);
      this.objects.push(posts);
    }
    const image = scene.add.image(sign.x, sign.mount === "post" ? sign.y - 26 : sign.y, key)
      .setOrigin(0.5, 1).setDisplaySize(sign.width, sign.height).setDepth(depth + 1);
    this.objects.push(image);
  }

  /** 무대 스크린·오락기 화면의 은은한 밝기 변화. 모션 줄이기에서는 고정한다. */
  update(time: number, reducedMotion: boolean): void {
    for (const glow of this.glows) glow.target.setAlpha(reducedMotion ? 1 : 0.9 + Math.sin(time / 480 + glow.phase) * 0.1);
  }

  destroy(): void {
    for (const object of this.objects.splice(0)) object.destroy();
    this.glows.splice(0);
  }
}

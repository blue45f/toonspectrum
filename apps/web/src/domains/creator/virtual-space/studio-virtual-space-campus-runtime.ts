/**
 * 공중섬 캠퍼스 런타임(Phaser): 섬 가장자리 절벽, 3/4 시점 벽·문·매트, 구역 표지판, 코드로 그린 오브젝트,
 * 광장 바닥 무늬를 만든다.
 *
 * - 벽의 보이는 사각형은 manifest 충돌체와 같은 값(campus-world의 studioCampusWallSegments)을 쓴다.
 * - 깊이: 바닥 타일(-996·-994) < 바닥 장식(-980·-900) < 옆벽 윗면(900) < y 정렬(바닥 y + 1000) < 벽걸이(벽 + 1·2).
 * - Canvas는 생성·update·destroy만 부른다(Canvas 파일이 더 커지지 않게 캠퍼스 그리기는 모두 이 모듈에 둔다).
 * - 근접 연출(게더타운식 "다가가면 반응"): 갤러리 액자 스포트라이트·확대, 오락기 화면빛, 하위 맵 게이트 고리,
 *   무대 조명 강화. 세기는 거리로 정하고 150ms 시간 상수로 부드럽게 바뀐다(모션 줄이기면 맥동 없이 정적으로 켜진다).
 * - 사무실 소품(트랙 G): 모니터 책상 화면빛, 네온 사인 깜빡임, 벽시계 바늘(실제 시각)을 office-props 순수 계산으로 얹는다.
 *   전부 오브젝트 국소 효과이며 전면 오버레이는 만들지 않는다.
 * - 생동감(나비·꽃잎·새·물고기·무대 조명·분수 물보라·김·반딧불)은 campus-life 런타임이 맡는다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  CAMPUS_GATES,
  CAMPUS_HEIGHT,
  CAMPUS_LIFE,
  CAMPUS_NORTH_WALL_HEIGHT,
  CAMPUS_PLAZA_MOTTO,
  CAMPUS_WIDTH,
  CAMPUS_ZONES,
  type StudioCampusObject,
  type StudioCampusZoneBlueprint,
} from "./studio-virtual-space-campus-blueprint";
import {
  StudioCampusLifeRuntime,
  type StudioCampusLifePhase,
  type StudioCampusLifeQuality,
  type StudioCampusLifeUpdate,
} from "./studio-virtual-space-campus-life";
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
  campusThemeFloorTexture,
} from "./studio-virtual-space-campus-textures";
import {
  officeClockHands,
  officeClockSecondBucket,
  officeMonitorGlow,
  officeNeonFlicker,
} from "./studio-virtual-space-office-props";
import {
  studioSpaceThemeFloorSpec,
  studioSpaceThemeWallTint,
  type StudioSpaceTheme,
} from "./studio-virtual-space-theme";
import type { StudioCampusScene, StudioCampusSign, StudioCampusWallSegment } from "./studio-virtual-space-campus-world";
import type { StudioWorldRect } from "./studio-virtual-space-world-manifest";

type CampusScene = Pick<Phaser.Scene, "add" | "textures" | "make">;

/** Canvas가 한 번 만들어 매 프레임 값만 바꿔 넣는 입력(객체를 새로 만들지 않는다). */
export interface StudioCampusRuntimeFrame {
  time: number;
  reducedMotion: boolean;
  /** 내 발밑 좌표. 근접 연출 거리 기준이다. */
  playerX: number;
  playerY: number;
  /** 카메라가 보는 월드 영역(camera.worldView). 화면 밖 생물은 계산하지 않는다. */
  view: StudioWorldRect;
  phase: StudioCampusLifePhase;
  quality: StudioCampusLifeQuality | null;
}

export function createStudioCampusRuntimeFrame(view: StudioWorldRect): StudioCampusRuntimeFrame {
  return { time: 0, reducedMotion: false, playerX: -1e6, playerY: -1e6, view, phase: "day", quality: null };
}

/** 근접 연출 반경(px): 이 안에서 세기가 0→1로 오른다(가장자리 40%는 부드럽게). */
export const CAMPUS_PROXIMITY_RADIUS = Object.freeze({ frame: 120, arcade: 96, gate: 150, stage: 230 });
const PROXIMITY_EASE_MS = 150;

/** 거리 → 근접 세기(0~1). 반경 밖 0, 반경의 60% 안쪽은 1, 그 사이는 smoothstep. */
export function studioCampusProximityLevel(distance: number, radius: number): number {
  if (!Number.isFinite(distance) || radius <= 0 || distance >= radius) return 0;
  const inner = radius * 0.6;
  if (distance <= inner) return 1;
  const t = 1 - (distance - inner) / (radius - inner);
  return t * t * (3 - 2 * t);
}

interface ProximityTarget {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  level: number;
}

export interface StudioCampusRuntimeOptions {
  readonly style: StudioVirtualArtStyleKey;
  /** bt(한국어, 영어). 표지판 부제·광장 문구에 쓴다. */
  readonly translate: (ko: string, en: string) => string;
  /**
   * 공간 테마(트랙 H). 있으면 벽 틴트·구역 바닥·절벽·광장·장식색을 테마 팔레트로 그리고,
   * 없으면 기존 블루프린트/아트 스타일 팔레트 그대로다. 전면 틴트 같은 화면 효과는 만들지 않는다.
   */
  readonly theme?: StudioSpaceTheme;
}

const ISLAND = Object.freeze({ left: 64, top: 64, right: CAMPUS_WIDTH - 64, bottom: CAMPUS_HEIGHT - 64 });
const SIDE_WALL_DEPTH = 900;
const FLOOR_DECAL_DEPTH = -900;
const GROUND_ART_DEPTH = -980;
/** 테마 구역 바닥: 타일맵 바닥(-994) 위, 지면 장식(-980) 아래. */
const ZONE_FLOOR_DEPTH = -993;
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
  private readonly glows: { readonly target: Phaser.GameObjects.Image; readonly phase: number; readonly near: ProximityTarget | null }[] = [];
  private readonly frames: { readonly image: Phaser.GameObjects.Image; readonly spot: Phaser.GameObjects.Graphics;
    readonly width: number; readonly height: number; readonly near: ProximityTarget }[] = [];
  private readonly screenLights: { readonly light: Phaser.GameObjects.Graphics; readonly near: ProximityTarget }[] = [];
  private readonly gates: { readonly rings: Phaser.GameObjects.Graphics; readonly near: ProximityTarget; readonly phase: number }[] = [];
  private readonly monitors: { readonly image: Phaser.GameObjects.Image; readonly light: Phaser.GameObjects.Graphics;
    readonly near: ProximityTarget; readonly seed: string }[] = [];
  private readonly neons: { readonly image: Phaser.GameObjects.Image; readonly seed: string }[] = [];
  private readonly clocks: { readonly hands: Phaser.GameObjects.Graphics; readonly radius: number;
    readonly ink: number; readonly accent: number; lastSecond: number }[] = [];
  private readonly stage: ProximityTarget | null;
  private readonly life: StudioCampusLifeRuntime;
  private readonly lifeFrame: StudioCampusLifeUpdate;
  private readonly theme: StudioSpaceTheme | null;
  private lastTime: number | null = null;
  private playerX = -1e6;
  private playerY = -1e6;
  private ease = 1;

  constructor(scene: CampusScene, campus: StudioCampusScene, options: StudioCampusRuntimeOptions) {
    const { style } = options;
    this.theme = options.theme ?? null;
    this.drawIslandRim(scene, style);
    this.drawPlaza(scene, style, options.translate);
    for (const zone of campus.zones) {
      if (this.theme) this.drawZoneFloor(scene, zone);
      const walls = campus.walls.filter((wall) => wall.zoneId === zone.roomId);
      this.drawWalls(scene, zone, walls, style);
    }
    // 문 안쪽 바닥의 매트: 문 틈 바로 안쪽에 놓아 입구를 알린다.
    for (const doorway of campus.doorways) {
      const mat = scene.add.image(0, 0, campusDoorMatTexture(scene, style, this.theme?.decorAccent)).setDisplaySize(104, 30).setDepth(FLOOR_DECAL_DEPTH).setAlpha(0.92);
      const centerX = doorway.rect.x + doorway.rect.width / 2, centerY = doorway.rect.y + doorway.rect.height / 2;
      if (doorway.side === "south") mat.setPosition(centerX, doorway.rect.y - 16);
      else if (doorway.side === "north") mat.setPosition(centerX, doorway.rect.y + doorway.rect.height + 16);
      else mat.setAngle(90).setPosition(doorway.side === "west" ? doorway.rect.x + doorway.rect.width + 16 : doorway.rect.x - 16, centerY);
      this.objects.push(mat);
    }
    for (const object of campus.objects) this.drawObject(scene, object, style);
    for (const sign of campus.signs) this.drawSign(scene, sign, style, options.translate);
    for (const gate of CAMPUS_GATES) {
      if (campus.personal && gate.projectOnly) continue;
      this.drawGateRings(scene, gate.portal.x, gate.portal.y, style);
    }
    const screen = campus.objects.find((object) => object.kind === "stage-screen");
    this.stage = screen ? { x: screen.x, y: screen.y + 176, radius: CAMPUS_PROXIMITY_RADIUS.stage, level: 0 } : null;
    this.life = new StudioCampusLifeRuntime(scene, CAMPUS_LIFE, style);
    this.lifeFrame = { time: 0, view: { x: 0, y: 0, width: 0, height: 0 }, phase: "day", reducedMotion: false, quality: null, stageBoost: 0 };
  }

  /** 근접 세기를 시간 상수로 목표에 가깝게 옮긴다. */
  private approach(target: ProximityTarget): number {
    const goal = studioCampusProximityLevel(Math.hypot(this.playerX - target.x, this.playerY - target.y), target.radius);
    target.level += (goal - target.level) * this.ease;
    if (Math.abs(goal - target.level) < 0.002) target.level = goal;
    return target.level;
  }

  /** 하위 맵 게이트 바닥의 빛 고리. 가까이 가면 넓어지고 밝아진다(문이 열리는 느낌). */
  private drawGateRings(scene: CampusScene, x: number, y: number, style: StudioVirtualArtStyleKey): void {
    const rings = scene.add.graphics().setDepth(FLOOR_DECAL_DEPTH + 2).setPosition(x, y + 10).setBlendMode("ADD");
    const glow = campusStyleColor(CAMPUS_ART.violet, style), core = campusStyleColor(CAMPUS_ART.cyan, style);
    rings.fillStyle(glow, 0.22).fillEllipse(0, 0, 112, 40);
    rings.lineStyle(3, core, 0.75).strokeEllipse(0, 0, 96, 32);
    rings.lineStyle(2, glow, 0.6).strokeEllipse(0, 0, 70, 22);
    this.objects.push(rings);
    this.gates.push({ rings, near: { x, y: y + 44, radius: CAMPUS_PROXIMITY_RADIUS.gate, level: 0 }, phase: this.gates.length * 1.3 });
  }

  /** 구역 벽 틴트: 테마가 있으면 테마 팔레트, 없으면 블루프린트 기본값. */
  private wallTintOf(zone: StudioCampusZoneBlueprint): number {
    return this.theme ? studioSpaceThemeWallTint(this.theme, zone) : zone.wallTint;
  }

  /** 테마 바닥: 구역 사각형 전체에 테마 패턴 타일을 깐다 (타일맵 바닥 위, 장식 아래). 아트 스타일과 무관하게 테마 색으로만 그린다. */
  private drawZoneFloor(scene: CampusScene, zone: StudioCampusZoneBlueprint): void {
    if (!this.theme) return;
    const spec = studioSpaceThemeFloorSpec(this.theme, zone.tone);
    const x = zone.tiles.column * 64, y = zone.tiles.row * 64;
    const width = zone.tiles.width * 64, height = zone.tiles.height * 64;
    const floor = scene.add.tileSprite(x, y, width, height, campusThemeFloorTexture(scene, spec))
      .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE).setDepth(ZONE_FLOOR_DEPTH);
    this.objects.push(floor);
  }

  private drawIslandRim(scene: CampusScene, style: StudioVirtualArtStyleKey): void {
    const rock = campusStyleColor(this.theme ? this.theme.cliff : CAMPUS_ART.rock, style);
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
    const stone = campusStyleColor(this.theme ? this.theme.plazaStone : 0xd9d2c3, style);
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
    const wallTint = this.wallTintOf(zone);
    const jamb = campusShade(campusStyleColor(wallTint, style), -0.35);
    for (const wall of walls) {
      const { x, y, width, height } = wall.rect;
      const depth = studioCampusWallDepth(wall);
      if (wall.side === "north") {
        const sprite = scene.add.tileSprite(x, y, width, height, campusNorthWallTexture(scene, wallTint, style))
          .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE).setDepth(depth);
        // 벽 아래 바닥에 떨어지는 부드러운 그림자로 벽이 서 있는 느낌을 준다.
        const shade = scene.add.graphics().setDepth(FLOOR_DECAL_DEPTH);
        shade.fillStyle(CAMPUS_ART.shadow, 0.2).fillRect(x, y + height, width, 5);
        shade.fillStyle(CAMPUS_ART.shadow, 0.1).fillRect(x, y + height + 5, width, 7);
        this.objects.push(sprite, shade);
      } else if (wall.side === "south") {
        const sprite = scene.add.tileSprite(x, y, width, height, campusSouthWallTexture(scene, wallTint, style))
          .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE).setDepth(depth);
        this.objects.push(sprite);
      } else {
        const sprite = scene.add.tileSprite(x, y, width, height, campusSideWallTexture(scene, wallTint, style))
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
        campusRailingTexture(scene, style, this.theme?.decorAccent))
        .setOrigin(0).setTileScale(1 / CAMPUS_TEXTURE_SCALE).setDepth(Math.round(object.y) + 1_000);
      this.objects.push(railing);
      return;
    }
    const key = campusObjectTexture(scene, object, style);
    if (!key) return;
    const image = scene.add.image(object.x, object.y, key).setOrigin(0.5, 1)
      .setDisplaySize(object.width, object.height).setDepth(studioCampusObjectDepth(object));
    this.objects.push(image);
    if (object.kind === "arcade-cabinet") {
      const near: ProximityTarget = { x: object.x, y: object.y + 30, radius: CAMPUS_PROXIMITY_RADIUS.arcade, level: 0 };
      this.glows.push({ target: image, phase: this.glows.length * 1.7, near });
      // 다가가면 화면 빛이 바닥에 번진다.
      const light = scene.add.graphics().setDepth(FLOOR_DECAL_DEPTH + 1).setPosition(object.x, object.y + 14).setBlendMode("ADD").setAlpha(0);
      light.fillStyle(campusStyleColor(object.variant === 1 ? CAMPUS_ART.pink : object.variant === 2 ? CAMPUS_ART.orange : CAMPUS_ART.cyan, style), 0.5)
        .fillEllipse(0, 0, 86, 28);
      this.objects.push(light);
      this.screenLights.push({ light, near });
    } else if (object.kind === "stage-screen") {
      this.glows.push({ target: image, phase: this.glows.length * 1.7, near: null });
    } else if (object.kind === "desk-monitor") {
      // 모니터 책상: 화면 빛이 바닥에 번지고, 가까이 가면 또렷해진다(office-props 강도 곡선).
      const near: ProximityTarget = { x: object.x, y: object.y + 30, radius: CAMPUS_PROXIMITY_RADIUS.arcade, level: 0 };
      const light = scene.add.graphics().setDepth(FLOOR_DECAL_DEPTH + 1).setPosition(object.x, object.y + 12).setBlendMode("ADD").setAlpha(0);
      light.fillStyle(campusStyleColor(CAMPUS_ART.glass, style), 0.5).fillEllipse(0, 0, 96, 26);
      this.objects.push(light);
      this.monitors.push({ image, light, near, seed: object.id });
    } else if (object.kind === "neon-sign") {
      this.neons.push({ image, seed: object.id });
    } else if (object.kind === "wall-clock") {
      // 벽시계: 바늘은 텍스처에 없고, 실제 시각으로 매초 다시 그리는 그래픽으로 얹는다.
      const hands = scene.add.graphics().setDepth(studioCampusObjectDepth(object) + 1)
        .setPosition(object.x, object.y - object.height / 2);
      this.objects.push(hands);
      this.clocks.push({
        hands,
        radius: Math.min(object.width, object.height) / 2 - 7,
        ink: campusStyleColor(CAMPUS_ART.ink, style),
        accent: campusStyleColor(CAMPUS_ART.red, style),
        lastSecond: -1,
      });
    } else if (object.kind === "frame") {
      // 갤러리 액자: 다가가면 위에서 스포트라이트가 내려오고 액자가 살짝 커진다.
      const spot = scene.add.graphics().setDepth(studioCampusObjectDepth(object) + 1).setPosition(object.x, object.y).setBlendMode("ADD").setAlpha(0);
      const warm = campusStyleColor(0xfff1c4, style);
      spot.fillStyle(warm, 0.28).fillTriangle(-10, -object.height - 46, 10, -object.height - 46, object.width * 0.62, 8)
        .fillTriangle(-10, -object.height - 46, object.width * 0.62, 8, -object.width * 0.62, 8);
      spot.fillStyle(warm, 0.35).fillEllipse(0, 6, object.width * 1.25, 18);
      this.objects.push(spot);
      this.frames.push({ image, spot, width: object.width, height: object.height,
        near: { x: object.x, y: object.y + 34, radius: CAMPUS_PROXIMITY_RADIUS.frame, level: 0 } });
    }
  }

  private drawSign(scene: CampusScene, sign: StudioCampusSign, style: StudioVirtualArtStyleKey, translate: StudioCampusRuntimeOptions["translate"]): void {
    const zone = CAMPUS_ZONES.find((candidate) => candidate.roomId === sign.zoneId);
    const key = campusSignTexture(scene, {
      title: sign.signEn,
      subtitle: translate(sign.labelKo, sign.labelEn),
      width: sign.width,
      height: sign.height,
      accent: zone ? campusShade(this.wallTintOf(zone), 0.45) : CAMPUS_ART.cream,
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

  /**
   * 무대 스크린·오락기 화면의 은은한 밝기 변화, 근접 연출, 생동감 런타임을 한 프레임 진행한다.
   * 모션 줄이기에서는 맥동·확대 없이 근접 강조만 정적으로 켠다.
   */
  update(frame: StudioCampusRuntimeFrame): void {
    const { time, reducedMotion } = frame;
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(100, time - this.lastTime));
    this.lastTime = time;
    this.ease = reducedMotion ? 1 : 1 - Math.exp(-dt / PROXIMITY_EASE_MS);
    this.playerX = frame.playerX;
    this.playerY = frame.playerY;
    for (const glow of this.glows) {
      const level = glow.near ? this.approach(glow.near) : 0;
      glow.target.setAlpha(reducedMotion ? 1 : Math.min(1, 0.9 + Math.sin(time / (480 - level * 300) + glow.phase) * (0.1 - level * 0.05) + level * 0.1));
    }
    for (const { light, near } of this.screenLights) {
      light.setAlpha(near.level * (reducedMotion ? 0.8 : 0.65 + Math.sin(time / 140) * 0.15));
    }
    for (const item of this.frames) {
      const level = this.approach(item.near);
      item.spot.setAlpha(level * 0.9);
      const scale = reducedMotion ? 1 : 1 + level * 0.05;
      item.image.setDisplaySize(item.width * scale, item.height * scale);
    }
    for (const gate of this.gates) {
      const level = this.approach(gate.near);
      const pulse = reducedMotion ? 0 : Math.sin(time / 520 + gate.phase) * 0.06;
      gate.rings.setAlpha(Math.min(1, 0.32 + level * 0.6 + pulse)).setScale(1 + level * 0.28 + pulse);
    }
    for (const monitor of this.monitors) {
      const level = this.approach(monitor.near);
      const intensity = officeMonitorGlow(time, monitor.seed, reducedMotion);
      monitor.light.setAlpha((0.3 + level * 0.7) * intensity * 0.55);
      monitor.image.setAlpha(0.92 + intensity * 0.08);
    }
    for (const neon of this.neons) {
      neon.image.setAlpha(0.55 + officeNeonFlicker(time, neon.seed, reducedMotion) * 0.45);
    }
    if (this.clocks.length > 0) this.updateClocks(reducedMotion);
    const life = this.lifeFrame;
    life.time = time;
    life.view = frame.view;
    life.phase = frame.phase;
    life.reducedMotion = reducedMotion;
    life.quality = frame.quality;
    life.stageBoost = this.stage ? this.approach(this.stage) : 0;
    this.life.update(life);
  }

  /** 벽시계 바늘을 실제 현지 시각으로 다시 그린다. 초가 바뀔 때만 그려서 저비용을 유지한다. */
  private updateClocks(reducedMotion: boolean): void {
    const utcNow = Date.now();
    const localNow = utcNow - new Date(utcNow).getTimezoneOffset() * 60_000;
    const bucket = officeClockSecondBucket(localNow);
    const hands = officeClockHands(reducedMotion ? bucket * 1_000 : localNow);
    for (const clock of this.clocks) {
      if (clock.lastSecond === bucket) continue;
      clock.lastSecond = bucket;
      const { radius } = clock;
      const draw = (angle: number, length: number, width: number, color: number, alpha: number): void => {
        clock.hands.lineStyle(width, color, alpha).lineBetween(0, 0, Math.sin(angle) * length, -Math.cos(angle) * length);
      };
      clock.hands.clear();
      draw(hands.hourAngle, radius * 0.48, 3, clock.ink, 0.95);
      draw(hands.minuteAngle, radius * 0.72, 2.2, clock.ink, 0.95);
      draw(hands.secondAngle, radius * 0.84, 1.2, clock.accent, 0.9);
      clock.hands.fillStyle(clock.ink, 1).fillCircle(0, 0, 2);
    }
  }

  destroy(): void {
    this.life.destroy();
    for (const object of this.objects.splice(0)) object.destroy();
    this.glows.splice(0);
    this.frames.splice(0);
    this.screenLights.splice(0);
    this.gates.splice(0);
    this.monitors.splice(0);
    this.neons.splice(0);
    this.clocks.splice(0);
  }
}

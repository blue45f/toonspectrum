import { pathBounds } from "./path";
import { sceneIRSchema } from "./scene";

import type { ColorIR } from "./color";
import type { ComicBalloonIR, ComicEffectLineIR, ComicPageIR, ComicToneIR } from "./comic";
import type { PathIR } from "./path";
import type { SceneIR, SceneNodeIR } from "./scene";

/**
 * ComicGraphIR → SceneIR lowering (V12 §13, comic lane).
 *
 * Panels become clip groups (masksContent → group.clip = panel.shape), so the
 * "톤·효과선 컷 경계 인식" contract renders identically on every SceneIR
 * engine instead of living in tool-side conventions. Anything the v1 scene
 * cannot express yet (text nodes, lpi/angle halftone screens) is reported in
 * `warnings` — never silently dropped (absolute rule: no quiet loss).
 */

export interface ComicLoweringOptions {
  /** Page background; defaults to opaque white. */
  background?: ColorIR;
}

export interface ComicLoweringResult {
  scene: SceneIR;
  warnings: string[];
}

const WHITE: ColorIR = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: ColorIR = { r: 0, g: 0, b: 0, a: 1 };
const PANEL_BORDER_WIDTH = 2;
const BALLOON_BORDER_WIDTH = 1.5;

/**
 * Deterministic LCG (Numerical Recipes constants) — effect-line generation must
 * be reproducible from ComicEffectLineIR.seed alone, so Math.random is banned.
 */
function createLcg(seed: number): () => number {
  let state = Math.floor(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function fillNode(id: string, path: PathIR, color: ColorIR): SceneNodeIR {
  return {
    id,
    kind: "fill-path",
    opacity: 1,
    blend: "src-over",
    path,
    paint: { kind: "solid", color },
    fillRule: "nonzero",
  };
}

function strokeNode(
  id: string,
  path: PathIR,
  color: ColorIR,
  strokeWidth: number,
): SceneNodeIR {
  return {
    id,
    kind: "stroke-path",
    opacity: 1,
    blend: "src-over",
    path,
    paint: { kind: "solid", color },
    strokeWidth,
    cap: "round",
    join: "round",
    miterLimit: 4,
  };
}

function linePath(x1: number, y1: number, x2: number, y2: number): PathIR {
  return {
    verbs: [
      { v: "M", x: x1, y: y1 },
      { v: "L", x: x2, y: y2 },
    ],
  };
}

function lowerBalloon(balloon: ComicBalloonIR, warnings: string[]): SceneNodeIR[] {
  const nodes: SceneNodeIR[] = [
    fillNode(`balloon:${balloon.id}:fill`, balloon.shape, WHITE),
    strokeNode(`balloon:${balloon.id}:stroke`, balloon.shape, BLACK, BALLOON_BORDER_WIDTH),
  ];
  if (balloon.tail !== null) {
    nodes.push(fillNode(`balloon:${balloon.id}:tail`, balloon.tail, WHITE));
  }
  if (balloon.textNodeId !== null) {
    warnings.push(
      `balloon ${balloon.id}: text node ${balloon.textNodeId} 연결은 텍스트 레인 배선 시 적용됩니다 (v1 lowering은 텍스트 노드를 생성하지 않음)`,
    );
  }
  return nodes;
}

function lowerTone(tone: ComicToneIR, warnings: string[]): SceneNodeIR {
  warnings.push(
    `tone ${tone.id}: lpi/angle 하프톤 패턴은 스크린톤 프로바이더 배선 시 적용됩니다 (현재 density 근사)`,
  );
  return fillNode(`tone:${tone.id}`, tone.region, {
    r: 0.5,
    g: 0.5,
    b: 0.5,
    a: tone.density,
  });
}

function lowerEffectLine(
  effect: ComicEffectLineIR,
  panelShape: PathIR,
  warnings: string[],
): SceneNodeIR[] {
  const bounds = pathBounds(panelShape);
  if (bounds === null) {
    warnings.push(
      `effect ${effect.id}: panel ${effect.panelId} shape has no geometry — 효과선을 생성할 수 없어 제외됨`,
    );
    return [];
  }
  const rand = createLcg(effect.seed);
  const [cx, cy] = effect.center;
  const maxRadius = Math.max(
    Math.hypot(bounds.minX - cx, bounds.minY - cy),
    Math.hypot(bounds.maxX - cx, bounds.minY - cy),
    Math.hypot(bounds.minX - cx, bounds.maxY - cy),
    Math.hypot(bounds.maxX - cx, bounds.maxY - cy),
    1,
  );
  const nodes: SceneNodeIR[] = [];

  if (effect.kind === "speed") {
    // Parallel motion lines: one base direction per seed, strokes offset along
    // the perpendicular across the panel, with jittered extents.
    const angle = rand() * Math.PI;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const perpX = -dirY;
    const perpY = dirX;
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    const diagonal = Math.max(
      Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
      1,
    );
    for (let index = 0; index < effect.strokeCount; index += 1) {
      const offset = (rand() - 0.5) * diagonal;
      const originX = midX + perpX * offset;
      const originY = midY + perpY * offset;
      const back = (diagonal / 2) * (0.6 + 0.4 * rand());
      const forward = (diagonal / 2) * (0.6 + 0.4 * rand());
      nodes.push(
        strokeNode(
          `effect:${effect.id}:${index}`,
          linePath(
            originX - dirX * back,
            originY - dirY * back,
            originX + dirX * forward,
            originY + dirY * forward,
          ),
          BLACK,
          0.6 + 1.2 * rand(),
        ),
      );
    }
    return nodes;
  }

  // Radial families share the ray construction; flash adds strong per-stroke
  // width variation and reaches closer to the focal center.
  const isFlash = effect.kind === "flash";
  for (let index = 0; index < effect.strokeCount; index += 1) {
    const angle = rand() * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const innerRadius = isFlash
      ? maxRadius * (0.15 + 0.25 * rand())
      : maxRadius * (0.45 + 0.35 * rand());
    const outerRadius = maxRadius * 1.05;
    const width = isFlash ? 0.5 + 4.5 * rand() : 0.8 + 1.6 * rand();
    nodes.push(
      strokeNode(
        `effect:${effect.id}:${index}`,
        linePath(
          cx + dirX * innerRadius,
          cy + dirY * innerRadius,
          cx + dirX * outerRadius,
          cy + dirY * outerRadius,
        ),
        BLACK,
        width,
      ),
    );
  }
  return nodes;
}

/**
 * Lowers one comic page into a renderable SceneIR. Panels are traversed in
 * reading order; each becomes a group whose clip is the panel shape when
 * masksContent is set, so tones/effect lines respect panel boundaries in every
 * engine. The returned scene is re-parsed through sceneIRSchema, so it is
 * always schema-valid.
 */
export function lowerComicPageToScene(
  page: ComicPageIR,
  options: ComicLoweringOptions = {},
): ComicLoweringResult {
  const warnings: string[] = [];
  const nodes: SceneNodeIR[] = [];
  const panelIds = new Set(page.panels.map((panel) => panel.id));

  const orphanWarning = (kind: string, id: string, panelId: string): void => {
    warnings.push(
      `${kind} ${id}: unknown panel ${panelId} — 컷 그룹에 배치할 수 없어 제외됨`,
    );
  };
  for (const balloon of page.balloons) {
    if (!panelIds.has(balloon.panelId)) orphanWarning("balloon", balloon.id, balloon.panelId);
  }
  for (const tone of page.tones) {
    if (!panelIds.has(tone.panelId)) orphanWarning("tone", tone.id, tone.panelId);
  }
  for (const effect of page.effectLines) {
    if (!panelIds.has(effect.panelId)) orphanWarning("effect", effect.id, effect.panelId);
  }

  const panels = [...page.panels].sort((a, b) => a.readingOrder - b.readingOrder);
  for (const panel of panels) {
    const children: SceneNodeIR[] = [
      fillNode(`panel:${panel.id}:bg`, panel.shape, WHITE),
    ];
    for (const tone of page.tones) {
      if (tone.panelId !== panel.id) continue;
      children.push(lowerTone(tone, warnings));
    }
    for (const effect of page.effectLines) {
      if (effect.panelId !== panel.id) continue;
      children.push(...lowerEffectLine(effect, panel.shape, warnings));
    }
    children.push(
      strokeNode(`panel:${panel.id}:border`, panel.shape, BLACK, PANEL_BORDER_WIDTH),
    );
    const balloons = page.balloons
      .filter((balloon) => balloon.panelId === panel.id)
      .sort((a, b) => a.readingOrder - b.readingOrder);
    for (const balloon of balloons) {
      children.push(...lowerBalloon(balloon, warnings));
    }
    nodes.push({
      id: `panel:${panel.id}`,
      kind: "group",
      opacity: 1,
      blend: "src-over",
      clip: panel.masksContent ? panel.shape : null,
      children,
    });
  }

  const scene = sceneIRSchema.parse({
    version: 11,
    width: page.widthPx,
    height: page.heightPx,
    background: options.background ?? WHITE,
    nodes,
  });
  return { scene, warnings };
}

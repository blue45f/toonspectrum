import { validateAnimationGraph } from "../ir/animation";
import { validateComicGraph } from "../ir/comic";
import { validateEffectGraph } from "../ir/effect";
import { isSceneCommand } from "../ir/journal";
import { transformPathIR, translateMat2d } from "../ir/path-transform";
import { findNode } from "../ir/scene";

import type { ComicBalloonIR, ComicGraphIR, ComicPageIR, ComicPanelIR } from "../ir/comic";
import type { ComicPartialCommandIR, CommandIR, SceneCommandIR } from "../ir/journal";
import type { ProjectStateIR } from "../ir/project-state";
import type { SceneIR, SceneNodeIR } from "../ir/scene";

/**
 * Pure command reducers. Every command application is deterministic: identical
 * (state, command) inputs yield structurally identical states, which is what
 * makes journal replay and collaboration convergence testable.
 *
 * Two entry points:
 * - `applyProjectCommand` — the full reducer (scene + comic/animation/effects
 *   graphs). CommandBus and recovery replay through this one.
 * - `applyCommand` — the legacy scene-layer reducer, kept for scene-only
 *   callers. It refuses graph commands loudly instead of silently dropping
 *   their effect, because a caller holding only a SceneIR has nowhere to put
 *   the graph result.
 */

export class CommandApplyError extends Error {
  constructor(
    message: string,
    readonly command: CommandIR,
  ) {
    super(message);
    this.name = "CommandApplyError";
  }
}

export function applyCommand(scene: SceneIR | null, command: CommandIR): SceneIR {
  if (!isSceneCommand(command)) {
    throw new CommandApplyError(
      `${command.type} is a project-graph command; apply it with applyProjectCommand`,
      command,
    );
  }
  if (command.type === "scene/init") {
    return command.scene;
  }
  if (scene === null) {
    throw new CommandApplyError(
      `command ${command.type} requires an initialized scene`,
      command,
    );
  }
  return applySceneCommand(scene, command);
}

/**
 * Full project reducer. Graph commands validate their result through the
 * structural validators (validateComicGraph / validateAnimationGraph /
 * validateEffectGraph) before anything is accepted — an invalid graph is a
 * dispatch error, never a journaled warning.
 *
 * Design decisions (v1, whole-value replacement semantics — see ir/journal.ts):
 * - `scene/init` replaces the scene layer only; existing graphs are preserved.
 *   Dropping a graph must always be an explicit, journaled clear command —
 *   never a side effect (no silent loss).
 * - A clear command on an already-empty layer is an idempotent no-op (still
 *   journaled), keeping replay deterministic without order-sensitive guards.
 */
export function applyProjectCommand(
  state: ProjectStateIR | null,
  command: CommandIR,
): ProjectStateIR {
  if (command.type === "scene/init") {
    return {
      scene: command.scene,
      comic: state?.comic ?? null,
      animation: state?.animation ?? null,
      effects: state?.effects ?? null,
    };
  }
  if (state === null) {
    throw new CommandApplyError(
      `command ${command.type} requires an initialized scene`,
      command,
    );
  }
  switch (command.type) {
    case "comic/set-page": {
      const current: ComicGraphIR =
        state.comic ?? { version: 1, pages: [], characters: [], exportProfiles: [] };
      const index = current.pages.findIndex((page) => page.id === command.page.id);
      const pages =
        index === -1
          ? [...current.pages, command.page]
          : current.pages.map((page, i) => (i === index ? command.page : page));
      const comic: ComicGraphIR = { ...current, pages };
      const issues = validateComicGraph(comic);
      if (issues.length > 0) {
        throw new CommandApplyError(
          `comic/set-page rejected: ${issues.map((issue) => issue.message).join("; ")}`,
          command,
        );
      }
      return { ...state, comic };
    }
    case "comic/clear":
      return { ...state, comic: null };
    case "comic/move-balloon":
    case "comic/set-balloon-text-node":
    case "comic/move-panel":
    case "comic/reorder-panels":
    case "comic/add-panel":
    case "comic/remove-panel":
    case "comic/add-balloon":
    case "comic/remove-balloon":
      return applyComicPartialCommand(state, command);
    case "animation/set-graph": {
      const issues = validateAnimationGraph(command.graph);
      if (issues.length > 0) {
        throw new CommandApplyError(
          `animation/set-graph rejected: ${issues.map((issue) => issue.message).join("; ")}`,
          command,
        );
      }
      return { ...state, animation: command.graph };
    }
    case "animation/clear":
      return { ...state, animation: null };
    case "effects/set-graph": {
      const issues = validateEffectGraph(command.graph);
      if (issues.length > 0) {
        throw new CommandApplyError(
          `effects/set-graph rejected: ${issues.map((issue) => issue.message).join("; ")}`,
          command,
        );
      }
      return { ...state, effects: command.graph };
    }
    case "effects/clear":
      return { ...state, effects: null };
    default:
      return { ...state, scene: applySceneCommand(state.scene, command) };
  }
}

function applySceneCommand(
  scene: SceneIR,
  command: Exclude<SceneCommandIR, { type: "scene/init" }>,
): SceneIR {
  switch (command.type) {
    case "scene/add-node": {
      const nodes = [...scene.nodes];
      const index = command.index ?? nodes.length;
      if (index > nodes.length) {
        throw new CommandApplyError(
          `add-node index ${index} out of range (${nodes.length})`,
          command,
        );
      }
      nodes.splice(index, 0, command.node);
      return { ...scene, nodes };
    }
    case "scene/update-node": {
      let found = false;
      const patchNode = (node: SceneNodeIR): SceneNodeIR => {
        if (node.id !== command.id) {
          if (node.kind === "group") {
            return { ...node, children: node.children.map(patchNode) };
          }
          return node;
        }
        found = true;
        const next: SceneNodeIR = { ...node };
        if (command.patch.opacity !== undefined) next.opacity = command.patch.opacity;
        if (
          command.patch.paint !== undefined &&
          (next.kind === "fill-path" || next.kind === "stroke-path")
        ) {
          next.paint = command.patch.paint;
        }
        if (command.patch.strokeWidth !== undefined && next.kind === "stroke-path") {
          next.strokeWidth = command.patch.strokeWidth;
        }
        return next;
      };
      const nodes = scene.nodes.map(patchNode);
      if (!found) {
        throw new CommandApplyError(`update-node: unknown id ${command.id}`, command);
      }
      return { ...scene, nodes };
    }
    case "scene/remove-node": {
      let removed = false;
      const removeFrom = (nodes: SceneNodeIR[]): SceneNodeIR[] => {
        const result: SceneNodeIR[] = [];
        for (const node of nodes) {
          if (node.id === command.id) {
            removed = true;
            continue;
          }
          if (node.kind === "group") {
            result.push({ ...node, children: removeFrom(node.children) });
          } else {
            result.push(node);
          }
        }
        return result;
      };
      const nodes = removeFrom(scene.nodes);
      if (!removed) {
        throw new CommandApplyError(`remove-node: unknown id ${command.id}`, command);
      }
      return { ...scene, nodes };
    }
    case "scene/set-background":
      return { ...scene, background: command.color };
  }
}

/**
 * Comic partial edits (V12 §14.1 v2 surface). Shared contract for all eight
 * commands:
 * - The page is addressed by id; an empty comic layer or unknown page/entity
 *   is a CommandApplyError before any state is touched (seq never consumed).
 * - The edited graph is re-validated through validateComicGraph; a result that
 *   fails structural validation is rejected wholesale.
 * - Reducers are pure and deterministic — panel/balloon array storage order is
 *   preserved; only the semantic readingOrder fields move.
 */
function applyComicPartialCommand(
  state: ProjectStateIR,
  command: ComicPartialCommandIR,
): ProjectStateIR {
  const comic = state.comic;
  if (comic === null) {
    throw new CommandApplyError(
      `${command.type}: comic layer is empty (dispatch comic/set-page first)`,
      command,
    );
  }
  const pageIndex = comic.pages.findIndex((page) => page.id === command.pageId);
  const page = pageIndex === -1 ? undefined : comic.pages[pageIndex];
  if (page === undefined) {
    throw new CommandApplyError(
      `${command.type}: unknown page ${command.pageId}`,
      command,
    );
  }
  const nextPage = editComicPage(page, command, state.scene);
  const nextComic: ComicGraphIR = {
    ...comic,
    pages: comic.pages.map((entry, index) => (index === pageIndex ? nextPage : entry)),
  };
  const issues = validateComicGraph(nextComic);
  if (issues.length > 0) {
    throw new CommandApplyError(
      `${command.type} rejected: ${issues.map((issue) => issue.message).join("; ")}`,
      command,
    );
  }
  return { ...state, comic: nextComic };
}

function editComicPage(
  page: ComicPageIR,
  command: ComicPartialCommandIR,
  scene: SceneIR,
): ComicPageIR {
  switch (command.type) {
    case "comic/move-balloon": {
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) {
        throw new CommandApplyError(
          `comic/move-balloon: translation must be finite (got ${command.x}, ${command.y})`,
          command,
        );
      }
      const balloon = requireBalloon(page, command.balloonId, command);
      const move = translateMat2d(command.x, command.y);
      const moved: ComicBalloonIR = {
        ...balloon,
        shape: transformPathIR(balloon.shape, move),
        tail: balloon.tail === null ? null : transformPathIR(balloon.tail, move),
      };
      return {
        ...page,
        balloons: page.balloons.map((entry) => (entry.id === balloon.id ? moved : entry)),
      };
    }
    case "comic/set-balloon-text-node": {
      const balloon = requireBalloon(page, command.balloonId, command);
      if (command.textNodeId !== null) {
        assertSceneTextNode(scene, command.textNodeId, command);
      }
      return {
        ...page,
        balloons: page.balloons.map((entry) =>
          entry.id === balloon.id ? { ...entry, textNodeId: command.textNodeId } : entry,
        ),
      };
    }
    case "comic/move-panel": {
      const panel = requirePanel(page, command.panelId, command);
      return {
        ...page,
        panels: page.panels.map((entry) =>
          entry.id === panel.id ? { ...entry, shape: command.shape } : entry,
        ),
      };
    }
    case "comic/reorder-panels": {
      const order = command.readingOrder;
      const unique = new Set(order);
      const isPermutation =
        unique.size === order.length &&
        order.length === page.panels.length &&
        page.panels.every((panel) => unique.has(panel.id));
      if (!isPermutation) {
        throw new CommandApplyError(
          `comic/reorder-panels: readingOrder must be an exact permutation of the ` +
            `panel ids of page ${page.id}`,
          command,
        );
      }
      const position = new Map(order.map((id, index) => [id, index]));
      return {
        ...page,
        panels: page.panels.map((panel) => ({
          ...panel,
          readingOrder: position.get(panel.id) ?? panel.readingOrder,
        })),
      };
    }
    case "comic/add-panel":
      // Duplicate ids and non-contiguous readingOrder are caught by
      // validateComicGraph on the edited graph.
      return { ...page, panels: [...page.panels, command.panel] };
    case "comic/remove-panel": {
      const panel = requirePanel(page, command.panelId, command);
      const dependents = [
        ...page.balloons
          .filter((balloon) => balloon.panelId === panel.id)
          .map((balloon) => `balloon ${balloon.id}`),
        ...page.tones
          .filter((tone) => tone.panelId === panel.id)
          .map((tone) => `tone ${tone.id}`),
        ...page.effectLines
          .filter((line) => line.panelId === panel.id)
          .map((line) => `effect line ${line.id}`),
      ];
      if (dependents.length > 0) {
        // V12 §14.1 defines the comic transaction chain but no cascade for
        // panel removal — so orphan handling is refusal with reasons, never an
        // implicit delete (journal "no silent loss" principle).
        throw new CommandApplyError(
          `comic/remove-panel refused: panel ${panel.id} is still referenced by ` +
            `${dependents.join(", ")}; remove the dependents explicitly first`,
          command,
        );
      }
      return {
        ...page,
        panels: page.panels
          .filter((entry) => entry.id !== panel.id)
          .map((entry) =>
            entry.readingOrder > panel.readingOrder
              ? { ...entry, readingOrder: entry.readingOrder - 1 }
              : entry,
          ),
      };
    }
    case "comic/add-balloon": {
      // validateComicGraph does not de-duplicate balloon ids, so the reducer
      // owns this integrity check.
      if (page.balloons.some((balloon) => balloon.id === command.balloon.id)) {
        throw new CommandApplyError(
          `comic/add-balloon: duplicate balloon id ${command.balloon.id} in page ${page.id}`,
          command,
        );
      }
      if (command.balloon.textNodeId !== null) {
        assertSceneTextNode(scene, command.balloon.textNodeId, command);
      }
      return { ...page, balloons: [...page.balloons, command.balloon] };
    }
    case "comic/remove-balloon": {
      const balloon = requireBalloon(page, command.balloonId, command);
      return {
        ...page,
        balloons: page.balloons
          .filter((entry) => entry.id !== balloon.id)
          .map((entry) =>
            entry.panelId === balloon.panelId && entry.readingOrder > balloon.readingOrder
              ? { ...entry, readingOrder: entry.readingOrder - 1 }
              : entry,
          ),
      };
    }
  }
}

function requirePanel(
  page: ComicPageIR,
  panelId: string,
  command: CommandIR,
): ComicPanelIR {
  const panel = page.panels.find((entry) => entry.id === panelId);
  if (panel === undefined) {
    throw new CommandApplyError(
      `${command.type}: unknown panel ${panelId} in page ${page.id}`,
      command,
    );
  }
  return panel;
}

function requireBalloon(
  page: ComicPageIR,
  balloonId: string,
  command: CommandIR,
): ComicBalloonIR {
  const balloon = page.balloons.find((entry) => entry.id === balloonId);
  if (balloon === undefined) {
    throw new CommandApplyError(
      `${command.type}: unknown balloon ${balloonId} in page ${page.id}`,
      command,
    );
  }
  return balloon;
}

/**
 * Cross-layer integrity for balloon → scene text links. validateComicGraph
 * cannot see the scene layer, so the reducer gates link *creation*; links left
 * dangling by later scene edits remain a provider-level concern (v1 parity).
 */
function assertSceneTextNode(scene: SceneIR, textNodeId: string, command: CommandIR): void {
  const node = findNode(scene, textNodeId);
  if (node === null) {
    throw new CommandApplyError(
      `${command.type}: unknown scene node ${textNodeId}`,
      command,
    );
  }
  if (node.kind !== "text") {
    throw new CommandApplyError(
      `${command.type}: scene node ${textNodeId} is kind ${node.kind}, expected text`,
      command,
    );
  }
}

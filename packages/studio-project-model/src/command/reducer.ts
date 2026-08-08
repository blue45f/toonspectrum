import { validateAnimationGraph } from "../ir/animation";
import { validateComicGraph } from "../ir/comic";
import { validateEffectGraph } from "../ir/effect";
import { isSceneCommand } from "../ir/journal";

import type { ComicGraphIR } from "../ir/comic";
import type { CommandIR, SceneCommandIR } from "../ir/journal";
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

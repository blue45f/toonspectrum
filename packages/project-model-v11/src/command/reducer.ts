import type { CommandIR } from "../ir/journal";
import type { SceneIR, SceneNodeIR } from "../ir/scene";

/**
 * Pure command reducer. Every command application is deterministic: identical
 * (scene, command) inputs yield structurally identical scenes, which is what
 * makes journal replay and collaboration convergence testable.
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
  if (command.type === "scene/init") {
    return command.scene;
  }
  if (scene === null) {
    throw new CommandApplyError(
      `command ${command.type} requires an initialized scene`,
      command,
    );
  }
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

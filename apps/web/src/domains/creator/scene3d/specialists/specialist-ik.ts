// The pinned npm release has no working package root entry; consume only its solver core.
// These exact versioned subpaths avoid URDF/Three helper and nested Worker runtimes.
import { Goal } from "closed-chain-ik/src/core/Goal.js";
import { Joint } from "closed-chain-ik/src/core/Joint.js";
import { Link } from "closed-chain-ik/src/core/Link.js";
import { Solver } from "closed-chain-ik/src/core/Solver.js";
import { Matrix4, Quaternion, Vector3 } from "three";
import { SpecialistError } from "./specialist-contract";
import { glbArtifact, readSpecialistDocument, sha256 } from "./specialist-gltf";
import type { Node, WebIO } from "@gltf-transform/core";
import type {
  SpecialistArtifact,
  SpecialistOptions,
} from "./specialist-contract";

/** Rotation-only chain solve on a derived GLB. Not an anatomical/full-body constraint solver. */
export async function processIkPose(
  io: WebIO,
  source: Uint8Array,
  options: Extract<SpecialistOptions, { kind: "ik" }>,
): Promise<{ artifacts: SpecialistArtifact[]; warnings: string[] }> {
  const document = await readSpecialistDocument(io, source);
  const root = document.getRoot();
  if (root.listAnimations().length)
    throw new SpecialistError(
      "unsupported",
      "Use a rigged GLB without animation clips so playback cannot overwrite the solved pose.",
    );
  const byName = (name: string): Node => {
    const matches = root.listNodes().filter((node) => node.getName() === name);
    if (matches.length !== 1)
      throw new SpecialistError(
        "invalid-input",
        "Choose a unique node name: " + name,
      );
    return matches[0]!;
  };
  const first = byName(options.rootName);
  const tip = byName(options.tipName);
  const chain: Node[] = [];
  for (let node: Node | null = tip; node; node = node.getParentNode()) {
    chain.unshift(node);
    if (node === first) break;
  }
  if (chain[0] !== first || chain.length < 3 || chain.length > 16)
    throw new SpecialistError(
      "unsupported",
      "Choose a root and descendant tip spanning 3 to 16 nodes.",
    );
  const anchored = new Link();
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const parent = first.getParentNode();
  if (parent) matrix.fromArray(parent.getWorldMatrix());
  matrix.decompose(position, quaternion, scale);
  if (
    scale.distanceTo(new Vector3(1, 1, 1)) > 1e-5 ||
    chain.some((node) => node.getScale().some((n) => Math.abs(n - 1) > 1e-5))
  ) {
    throw new SpecialistError(
      "unsupported",
      "Bake scale before IK processing; the solver only accepts unit-scale chains.",
    );
  }
  anchored.setPosition(position.x, position.y, position.z);
  anchored.setQuaternion(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w,
  );
  const joints: Joint[] = [];
  let previous = anchored;
  let tipLink: Link = anchored;
  const limit = (options.angleLimitDegrees * Math.PI) / 180;
  for (const [index, node] of chain.entries()) {
    const joint = new Joint();
    joint.name = node.getName();
    joint.setPosition(...node.getTranslation());
    joint.setQuaternion(...node.getRotation());
    if (index < chain.length - 1) {
      // Pinned 0.0.3 public DOF codes: EX=3, EY=4, EZ=5. Its .d.ts declares an ambient const enum.
      joint.setDoF(3, 4, 5);
      joint.setMinLimits(-limit, -limit, -limit);
      joint.setMaxLimits(limit, limit, limit);
    }
    previous.addChild(joint);
    const link = new Link();
    joint.addChild(link);
    previous = link;
    tipLink = link;
    joints.push(joint);
  }
  const goal = new Goal();
  goal.setGoalDoF(0, 1, 2);
  goal.setPosition(...options.target);
  goal.makeClosure(tipLink);
  const solver = new Solver(anchored);
  solver.useSVD = false;
  solver.maxIterations = 160;
  solver.dampingFactor = 0.03;
  solver.translationConvergeThreshold = options.tolerance / 2;
  solver.stallThreshold = 1e-7;
  const statuses = solver.solve();
  const measured: number[] = [0, 0, 0];
  tipLink.getWorldPosition(measured);
  const error = Math.hypot(...measured.map((n, i) => n - options.target[i]!));
  if (!Number.isFinite(error) || error > options.tolerance)
    throw new SpecialistError(
      "runtime",
      "The bounded IK solve did not reach the target. Adjust the target or joint limits.",
    );
  const rotations: { name: string; quaternion: number[] }[] = [];
  for (const [index, joint] of joints.entries()) {
    joint.updateDoFMatrix();
    const delta = new Quaternion().setFromRotationMatrix(
      new Matrix4().fromArray(joint.matrixDoF),
    );
    const rotation = new Quaternion()
      .fromArray(chain[index]!.getRotation())
      .multiply(delta)
      .normalize();
    if (!rotation.toArray().every(Number.isFinite))
      throw new SpecialistError("runtime", "Non-finite pose output.");
    chain[index]!.setRotation(rotation.toArray());
    rotations.push({
      name: chain[index]!.getName(),
      quaternion: rotation.toArray(),
    });
  }
  const restoredTip = new Vector3().setFromMatrixPosition(
    new Matrix4().fromArray(tip.getWorldMatrix()),
  );
  const roundTripError = restoredTip.distanceTo(new Vector3(...options.target));
  if (roundTripError > options.tolerance)
    throw new SpecialistError(
      "runtime",
      "glTF pose projection differs from the solved chain.",
    );
  const artifact = await glbArtifact(io, document, "ik-pose.glb");
  const reopened = await io.readBinary(artifact.bytes);
  const reopenedTip = reopened
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === options.tipName);
  if (!reopenedTip)
    throw new SpecialistError(
      "runtime",
      "The exported pose lost the endpoint.",
    );
  const persistedError = new Vector3()
    .setFromMatrixPosition(
      new Matrix4().fromArray(reopenedTip.getWorldMatrix()),
    )
    .distanceTo(new Vector3(...options.target));
  if (!Number.isFinite(persistedError) || persistedError > options.tolerance)
    throw new SpecialistError(
      "runtime",
      "Persisted GLB pose does not reach the requested target.",
    );
  const receipt = new TextEncoder().encode(
    JSON.stringify(
      {
        version: 1,
        sourceSha256: sha256(source),
        options,
        error,
        roundTripError,
        persistedError,
        solverStatuses: statuses,
        rotations,
        authority: "derived-glb-only",
      },
      null,
      2,
    ),
  );
  return {
    artifacts: [
      artifact,
      {
        name: "ik-pose.json",
        mime: "application/json",
        bytes: receipt,
        sha256: sha256(receipt),
      },
    ],
    warnings: [
      "This is a position-only rotation-chain solver with symmetric XYZ limits. It does not guarantee anatomical joint limits, body contact, self-collision, full-body balance or VRM compatibility. Source and editor poses remain unchanged.",
    ],
  };
}

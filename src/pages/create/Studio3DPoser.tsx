import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, Capsule, Cone, ContactShadows, Cylinder, OrbitControls, RoundedBox, Sphere, Torus } from "@react-three/drei";
import { Camera, Check, Glasses, Heart, Rotate3D, Sparkles, UserRound, WandSparkles, X } from "lucide-react";
import * as THREE from "three";

import {
  CAMERA_PRESETS,
  CHARACTER_PRESETS,
  EXPRESSIONS,
  POSE_PRESETS,
  type CameraPresetId,
  type CharacterPreset,
  type ExpressionId,
  type FringeStyle,
  type HairStyle,
  type PoseId,
  type PosePreset,
  type Vec3,
} from "./studio-3d-presets";

type Studio3DPoserProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (pngDataUrl: string, width: number, height: number) => void;
};

type CaptureState = {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
};

const FACE_DARK = "#2a211c";
const FACE_SOFT = "#f4a0aa";
const HEART_RED = "#f06278";
const EYE_WHITE = "#fff8ef";
const EYE_HIGHLIGHT = "#fffef9";
const TEAR_BLUE = "#7bbff7";
const HAT_DARK = "#33251f";
const INK_OUTLINE = "#16100c";
const INK_OUTLINE_SCALE = 1.052;
const INK_OUTLINE_USER_DATA_KEY = "studio3dInkOutline";

function createToonGradientMap() {
  const gradient = new Uint8Array([
    120, 120, 120, 255,
    206, 206, 206, 255,
    255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(gradient, 3, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const TOON_GRADIENT_MAP = createToonGradientMap();
const INK_OUTLINE_MATERIAL = new THREE.MeshBasicMaterial({
  color: INK_OUTLINE,
  side: THREE.BackSide,
  toneMapped: false,
});

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

function materialProps(color: string, _flatness = 0.72) {
  return { color, gradientMap: TOON_GRADIENT_MAP };
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function addInkOutline(mesh: THREE.Mesh) {
  const outline = new THREE.Mesh(mesh.geometry, INK_OUTLINE_MATERIAL);
  outline.name = `${mesh.name || "characterMesh"}InkOutline`;
  outline.userData[INK_OUTLINE_USER_DATA_KEY] = true;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.frustumCulled = mesh.frustumCulled;
  outline.scale.setScalar(INK_OUTLINE_SCALE);
  mesh.add(outline);
  return outline;
}

function CharacterInkOutlines({ rootRef }: { rootRef: MutableRefObject<THREE.Group | null> }) {
  // Character branches swap meshes for expressions and accessories, so refresh outlines after each commit.
  useLayoutEffect(() => {
    if (!rootRef.current) return undefined;

    const outlines: THREE.Mesh[] = [];
    rootRef.current.traverse((object) => {
      if (!isMesh(object) || object.userData[INK_OUTLINE_USER_DATA_KEY] === true) return;
      outlines.push(addInkOutline(object));
    });

    return () => {
      outlines.forEach((outline) => {
        outline.parent?.remove(outline);
      });
    };
  });

  return null;
}

function findCharacter(id: string) {
  return CHARACTER_PRESETS.find((preset) => preset.id === id) ?? CHARACTER_PRESETS[0];
}

function findPose(id: PoseId) {
  return POSE_PRESETS.find((preset) => preset.id === id) ?? POSE_PRESETS[0];
}

function findCameraPreset(id: CameraPresetId) {
  return CAMERA_PRESETS.find((preset) => preset.id === id) ?? CAMERA_PRESETS[0];
}

function roundExportSize(canvas: HTMLCanvasElement) {
  const aspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 0.75;
  const height = 480;
  return { width: Math.round(height * aspect), height };
}

function CaptureBridge({ captureRef }: { captureRef: MutableRefObject<CaptureState> }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    captureRef.current = { gl, scene, camera };
    return () => {
      if (captureRef.current.gl === gl) {
        captureRef.current = { gl: null, scene: null, camera: null };
      }
    };
  }, [camera, captureRef, gl, scene]);

  return null;
}

function CameraDirector({ presetId }: { presetId: CameraPresetId }) {
  const { camera, invalidate } = useThree();
  const preset = findCameraPreset(presetId);

  useEffect(() => {
    camera.position.set(...preset.position);
    camera.lookAt(...preset.target);
    camera.updateMatrixWorld();
    if ("updateProjectionMatrix" in camera) {
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, invalidate, preset.position, preset.target]);

  return null;
}

function BreathingRoot({ children, lift }: { children: React.ReactNode; lift: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = lift + Math.sin(clock.elapsedTime * 1.7) * 0.012;
  });

  return <group ref={groupRef}>{children}</group>;
}

function ChibiCharacter({
  character,
  expression,
  pose,
  bodyRotation,
}: {
  character: CharacterPreset;
  expression: ExpressionId;
  pose: PosePreset;
  bodyRotation: number;
}) {
  const characterRootRef = useRef<THREE.Group>(null);

  return (
    <BreathingRoot lift={pose.lift}>
      <group ref={characterRootRef} rotation={[0, bodyRotation, 0]}>
        <group rotation={pose.body}>
          <BackPropView character={character} />

          <Leg side="left" rotation={pose.leftLeg} character={character} />
          <Leg side="right" rotation={pose.rightLeg} character={character} />

          <Capsule args={[0.42, 0.46, 8, 18]} position={[0, 1.12, 0]} scale={[1, 1.08, 0.84]} castShadow receiveShadow>
            <meshToonMaterial {...materialProps(character.outfit)} />
          </Capsule>
          <RoundedBox args={[0.58, 0.18, 0.42]} radius={0.07} smoothness={5} position={[0, 1.37, 0.23]} castShadow receiveShadow>
            <meshToonMaterial {...materialProps(character.outfitTrim, 0.66)} />
          </RoundedBox>
          <Sphere args={[0.18, 16, 10]} position={[0, 1.56, 0.01]} scale={[0.8, 0.55, 0.8]} castShadow receiveShadow>
            <meshToonMaterial {...materialProps(character.skin)} />
          </Sphere>

          <Arm side="left" rotation={pose.leftArm} character={character} />
          <Arm side="right" rotation={pose.rightArm} character={character} />

          <group position={[0, 2.02, 0.05]} rotation={pose.head}>
            <Sphere args={[0.7, 24, 16]} scale={[1, 0.95, 0.98]} castShadow receiveShadow>
              <meshToonMaterial {...materialProps(character.skin)} />
            </Sphere>
            <Hair style={character.hairStyle} fringe={character.fringe} color={character.hair} />
            <HeadPropView character={character} />
            <ExpressionFace expression={expression} blush={character.blush} eyeColor={character.eye} />
            <AccessoryView character={character} />
          </group>
        </group>
        <CharacterInkOutlines rootRef={characterRootRef} />
      </group>
    </BreathingRoot>
  );
}

function Arm({ side, rotation, character }: { side: "left" | "right"; rotation: Vec3; character: CharacterPreset }) {
  const x = side === "left" ? -0.52 : 0.52;

  return (
    <group position={[x, 1.43, 0.04]} rotation={rotation}>
      <Capsule args={[0.105, 0.26, 6, 12]} position={[0, -0.2, 0]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(character.outfit)} />
      </Capsule>
      <Capsule args={[0.09, 0.22, 6, 12]} position={[0, -0.45, 0]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(character.skin)} />
      </Capsule>
      <Sphere args={[0.12, 14, 10]} position={[0, -0.66, 0.02]} scale={[1, 0.92, 1]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(character.skin)} />
      </Sphere>
    </group>
  );
}

function Leg({ side, rotation, character }: { side: "left" | "right"; rotation: Vec3; character: CharacterPreset }) {
  const x = side === "left" ? -0.22 : 0.22;

  return (
    <group position={[x, 0.82, 0.02]} rotation={rotation}>
      <Capsule args={[0.13, 0.38, 6, 12]} position={[0, -0.28, 0]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(character.outfitTrim, 0.68)} />
      </Capsule>
      <Capsule args={[0.105, 0.18, 6, 12]} position={[0, -0.56, 0.01]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(character.skin)} />
      </Capsule>
      <RoundedBox args={[0.27, 0.14, 0.32]} radius={0.06} smoothness={5} position={[0, -0.72, 0.09]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(character.shoe, 0.78)} />
      </RoundedBox>
    </group>
  );
}

function BackPropView({ character }: { character: CharacterPreset }) {
  if (character.prop === "cape") {
    return (
      <group position={[0, 1.06, -0.23]} rotation={[0.05, 0, 0]}>
        <Sphere args={[0.44, 18, 10]} scale={[1.12, 1.32, 0.16]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.accessoryColor, 0.7)} />
        </Sphere>
        <RoundedBox args={[0.76, 0.08, 0.08]} radius={0.035} smoothness={5} position={[0, 0.42, 0.05]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.outfitTrim, 0.62)} />
        </RoundedBox>
      </group>
    );
  }

  if (character.prop === "swordBack") {
    return (
      <group position={[0.27, 1.22, -0.35]} rotation={[0, 0, -0.64]}>
        <Capsule args={[0.035, 0.96, 5, 12]} position={[0, 0, 0]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps("#cbd4dd", 0.42)} />
        </Capsule>
        <Capsule args={[0.045, 0.24, 5, 10]} position={[0, 0.58, 0.02]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.shoe, 0.66)} />
        </Capsule>
        <Capsule args={[0.024, 0.22, 4, 8]} position={[0, 0.43, 0.03]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.outfitTrim, 0.58)} />
        </Capsule>
      </group>
    );
  }

  return null;
}

function HeadPropView({ character }: { character: CharacterPreset }) {
  if (character.prop === "wizardHat") {
    return (
      <group position={[0.02, 0.7, -0.02]} rotation={[0.02, 0, -0.14]}>
        <Cylinder args={[0.48, 0.56, 0.06, 28]} position={[0, -0.09, 0.08]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.outfitTrim, 0.64)} />
        </Cylinder>
        <Cone args={[0.34, 0.76, 26]} position={[0, 0.26, 0.02]} rotation={[0.1, 0, 0.1]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.accessoryColor, 0.58)} />
        </Cone>
        <Capsule args={[0.018, 0.32, 4, 8]} position={[0.02, 0.03, 0.34]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.outfitTrim, 0.54)} />
        </Capsule>
      </group>
    );
  }

  if (character.prop === "headband") {
    return (
      <group position={[0, 0.33, 0.64]}>
        <Capsule args={[0.027, 0.82, 4, 14]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.accessoryColor, 0.58)} />
        </Capsule>
        <Capsule args={[0.02, 0.24, 4, 8]} position={[0.47, -0.04, -0.02]} rotation={[0, 0, -0.36]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(character.accessoryColor, 0.58)} />
        </Capsule>
      </group>
    );
  }

  return null;
}

function Hair({ style, fringe, color }: { style: HairStyle; fringe: FringeStyle; color: string }) {
  return (
    <group>
      <Sphere args={[0.69, 20, 12]} position={[0, 0.28, -0.16]} scale={[1.04, 0.58, 0.92]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Sphere>
      <Fringe style={fringe} color={color} />

      {style === "bob" && <BobHair color={color} />}
      {style === "short" && <ShortHair color={color} />}
      {style === "twin" && <TwinHair color={color} />}
      {style === "curly" && <CurlyHair color={color} />}
      {style === "side" && <SideHair color={color} />}
      {style === "spiky" && <SpikyHair color={color} />}
    </group>
  );
}

function Fringe({ style, color }: { style: FringeStyle; color: string }) {
  if (style === "sideSwept") {
    return (
      <group>
        <FringeLock x={-0.1} y={0.31} z={0.58} scale={[1.95, 0.48, 0.22]} rotation={-0.12} color={color} />
        <FringeLock x={0.38} y={0.27} z={0.57} scale={[0.86, 0.36, 0.2]} rotation={0.2} color={color} />
      </group>
    );
  }

  if (style === "rounded") {
    return (
      <group>
        <FringeLock x={0} y={0.31} z={0.58} scale={[2.12, 0.46, 0.22]} rotation={0} color={color} />
        <FringeLock x={-0.4} y={0.25} z={0.57} scale={[0.74, 0.38, 0.18]} rotation={0.12} color={color} />
        <FringeLock x={0.4} y={0.25} z={0.57} scale={[0.74, 0.38, 0.18]} rotation={-0.12} color={color} />
      </group>
    );
  }

  if (style === "parted") {
    return (
      <group>
        <FringeLock x={-0.23} y={0.3} z={0.58} scale={[1.22, 0.44, 0.22]} rotation={-0.18} color={color} />
        <FringeLock x={0.24} y={0.3} z={0.58} scale={[1.2, 0.42, 0.22]} rotation={0.18} color={color} />
        <Sphere args={[0.025, 8, 6]} position={[0, 0.34, 0.6]} scale={[0.7, 1.2, 0.2]}>
          <meshToonMaterial {...materialProps(characterBandColor(color), 0.68)} />
        </Sphere>
      </group>
    );
  }

  if (style === "curtain") {
    return (
      <group>
        <FringeLock x={-0.34} y={0.28} z={0.58} scale={[1.03, 0.48, 0.21]} rotation={-0.34} color={color} />
        <FringeLock x={0.34} y={0.28} z={0.58} scale={[1.03, 0.48, 0.21]} rotation={0.34} color={color} />
        <FringeLock x={0} y={0.36} z={0.56} scale={[0.7, 0.26, 0.18]} rotation={0} color={color} />
      </group>
    );
  }

  if (style === "blunt") {
    return (
      <group>
        <RoundedBox args={[0.92, 0.18, 0.18]} radius={0.08} smoothness={7} position={[0, 0.27, 0.57]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(color, 0.6)} />
        </RoundedBox>
        <FringeLock x={-0.47} y={0.24} z={0.55} scale={[0.44, 0.32, 0.17]} rotation={0.12} color={color} />
        <FringeLock x={0.47} y={0.24} z={0.55} scale={[0.44, 0.32, 0.17]} rotation={-0.12} color={color} />
      </group>
    );
  }

  return (
    <group>
      <FringeLock x={-0.16} y={0.32} z={0.58} scale={[1.2, 0.38, 0.2]} rotation={-0.28} color={color} />
      <FringeLock x={0.28} y={0.31} z={0.57} scale={[0.9, 0.34, 0.18]} rotation={0.24} color={color} />
    </group>
  );
}

function FringeLock({
  x,
  y,
  z,
  rotation,
  scale,
  color,
}: {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: Vec3;
  color: string;
}) {
  return (
    <Sphere args={[0.22, 18, 10]} position={[x, y, z]} rotation={[0, 0, rotation]} scale={scale} castShadow receiveShadow>
      <meshToonMaterial {...materialProps(color, 0.6)} />
    </Sphere>
  );
}

function BobHair({ color }: { color: string }) {
  return (
    <group>
      <Capsule args={[0.15, 0.42, 6, 12]} position={[-0.58, -0.12, 0.02]} rotation={[0, 0, -0.08]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Capsule>
      <Capsule args={[0.15, 0.42, 6, 12]} position={[0.58, -0.12, 0.02]} rotation={[0, 0, 0.08]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Capsule>
      <RoundedBox args={[0.82, 0.34, 0.42]} radius={0.13} smoothness={6} position={[0, -0.18, -0.33]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.64)} />
      </RoundedBox>
    </group>
  );
}

function ShortHair({ color }: { color: string }) {
  return (
    <group>
      <Capsule args={[0.11, 0.32, 5, 10]} position={[-0.56, 0.02, 0.08]} rotation={[0, 0, -0.25]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Capsule>
      <Capsule args={[0.1, 0.28, 5, 10]} position={[0.55, 0.05, 0.04]} rotation={[0, 0, 0.25]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Capsule>
    </group>
  );
}

function TwinHair({ color }: { color: string }) {
  return (
    <group>
      <Sphere args={[0.26, 16, 10]} position={[-0.82, 0.0, -0.02]} scale={[0.86, 1.15, 0.84]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Sphere>
      <Sphere args={[0.26, 16, 10]} position={[0.82, 0.0, -0.02]} scale={[0.86, 1.15, 0.84]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Sphere>
      <Capsule args={[0.06, 0.18, 5, 10]} position={[-0.58, 0.08, 0.0]} rotation={[0, 0, 1.2]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps("#f4efe4", 0.68)} />
      </Capsule>
      <Capsule args={[0.06, 0.18, 5, 10]} position={[0.58, 0.08, 0.0]} rotation={[0, 0, -1.2]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps("#f4efe4", 0.68)} />
      </Capsule>
    </group>
  );
}

function CurlyHair({ color }: { color: string }) {
  const curls: Array<[number, number, number]> = [
    [-0.58, 0.12, 0.1],
    [-0.66, -0.05, -0.02],
    [0.58, 0.12, 0.1],
    [0.66, -0.05, -0.02],
    [-0.2, 0.55, -0.03],
    [0.18, 0.55, -0.03],
  ];

  return (
    <group>
      {curls.map(([x, y, z]) => (
        <Sphere key={`${x}-${y}-${z}`} args={[0.15, 12, 8]} position={[x, y, z]} scale={[1, 0.92, 0.82]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(color, 0.58)} />
        </Sphere>
      ))}
    </group>
  );
}

function SideHair({ color }: { color: string }) {
  return (
    <group>
      <Capsule args={[0.18, 0.58, 7, 12]} position={[0.78, -0.08, -0.1]} rotation={[0, 0, -0.38]} scale={[1, 1, 0.86]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Capsule>
      <Sphere args={[0.18, 14, 9]} position={[0.84, -0.42, -0.05]} scale={[0.82, 1, 0.8]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Sphere>
    </group>
  );
}

function SpikyHair({ color }: { color: string }) {
  return (
    <group>
      <Cone args={[0.15, 0.38, 5]} position={[-0.32, 0.66, -0.08]} rotation={[0, 0, -0.32]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.58)} />
      </Cone>
      <Cone args={[0.17, 0.46, 5]} position={[0, 0.72, -0.06]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.58)} />
      </Cone>
      <Cone args={[0.15, 0.36, 5]} position={[0.32, 0.64, -0.08]} rotation={[0, 0, 0.28]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.58)} />
      </Cone>
    </group>
  );
}

type AnimeEyeShape = "round" | "wide" | "narrow" | "droopy";

function ExpressionFace({ expression, blush, eyeColor }: { expression: ExpressionId; blush: string; eyeColor: string }) {
  return (
    <group>
      <Cheek x={-0.42} color={blush} />
      <Cheek x={0.42} color={blush} />
      {expression === "happy" && <HappyFace />}
      {expression === "sad" && <SadFace eyeColor={eyeColor} />}
      {expression === "angry" && <AngryFace eyeColor={eyeColor} />}
      {expression === "surprised" && <SurprisedFace eyeColor={eyeColor} />}
      {expression === "love" && <LoveFace />}
      {expression === "neutral" && <NeutralFace eyeColor={eyeColor} />}
    </group>
  );
}

function Cheek({ x, color }: { x: number; color: string }) {
  return (
    <Sphere args={[0.055, 12, 8]} position={[x, -0.15, 0.705]} scale={[1.45, 0.72, 0.18]}>
      <meshToonMaterial {...materialProps(color)} transparent opacity={0.78} />
    </Sphere>
  );
}

function AnimeEye({
  x,
  color,
  shape = "round",
  rotation = 0,
  irisOffsetY = 0,
}: {
  x: number;
  color: string;
  shape?: AnimeEyeShape;
  rotation?: number;
  irisOffsetY?: number;
}) {
  const config = {
    round: { y: 0.05, scale: [1.02, 1.12, 0.16] as Vec3, irisScale: [1, 1, 0.18] as Vec3 },
    wide: { y: 0.06, scale: [1.12, 1.34, 0.16] as Vec3, irisScale: [1.04, 1.08, 0.18] as Vec3 },
    narrow: { y: 0.05, scale: [1.18, 0.72, 0.16] as Vec3, irisScale: [0.9, 0.76, 0.18] as Vec3 },
    droopy: { y: 0.01, scale: [1.05, 0.96, 0.16] as Vec3, irisScale: [0.95, 0.92, 0.18] as Vec3 },
  }[shape];

  return (
    <group position={[x, config.y, 0.708]} rotation={[0, 0, rotation]}>
      <Sphere args={[0.115, 20, 12]} scale={config.scale}>
        <meshToonMaterial {...materialProps(EYE_WHITE)} />
      </Sphere>
      {shape === "narrow" && (
        <Capsule args={[0.01, 0.2, 4, 8]} position={[0, 0.066, 0.018]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.18]}>
          <meshToonMaterial {...materialProps(FACE_DARK, 0.76)} />
        </Capsule>
      )}
      <Sphere args={[0.061, 18, 10]} position={[0, irisOffsetY, 0.026]} scale={config.irisScale}>
        <meshToonMaterial {...materialProps(color)} />
      </Sphere>
      <Sphere args={[0.032, 14, 8]} position={[0, irisOffsetY - 0.003, 0.049]} scale={[1, 1, 0.2]}>
        <meshToonMaterial {...materialProps(FACE_DARK, 0.68)} />
      </Sphere>
      <Sphere args={[0.014, 10, 6]} position={[-0.022, irisOffsetY + 0.028, 0.068]} scale={[1, 1, 0.18]}>
        <meshToonMaterial {...materialProps(EYE_HIGHLIGHT)} />
      </Sphere>
    </group>
  );
}

function EyeSmile({ x }: { x: number }) {
  return (
    <Torus args={[0.1, 0.013, 7, 24, Math.PI]} position={[x, 0.06, 0.735]} rotation={[0, 0, Math.PI]} scale={[1.12, 0.56, 1]}>
      <meshToonMaterial {...materialProps(FACE_DARK, 0.78)} />
    </Torus>
  );
}

function Eyebrow({ x, y = 0.22, rotation = 0 }: { x: number; y?: number; rotation?: number }) {
  return (
    <Capsule args={[0.012, 0.15, 4, 8]} position={[x, y, 0.738]} rotation={[0, 0, rotation]}>
      <meshToonMaterial {...materialProps(FACE_DARK, 0.76)} />
    </Capsule>
  );
}

function MouthSmile({ y = -0.25, scale = 1 }: { y?: number; scale?: number }) {
  return (
    <Torus args={[0.13 * scale, 0.014, 6, 24, Math.PI]} position={[0, y, 0.735]} rotation={[0, 0, Math.PI]} scale={[1, 0.55, 1]}>
      <meshToonMaterial {...materialProps(FACE_DARK, 0.78)} />
    </Torus>
  );
}

function MouthSad() {
  return (
    <Torus args={[0.12, 0.014, 6, 22, Math.PI]} position={[0, -0.27, 0.735]} scale={[1, 0.5, 1]}>
      <meshToonMaterial {...materialProps(FACE_DARK, 0.78)} />
    </Torus>
  );
}

function MouthFlat({ y = -0.27 }: { y?: number }) {
  return (
    <Capsule args={[0.014, 0.14, 4, 8]} position={[0, y, 0.735]} rotation={[0, 0, Math.PI / 2]}>
      <meshToonMaterial {...materialProps(FACE_DARK, 0.78)} />
    </Capsule>
  );
}

function HappyFace() {
  return (
    <group>
      <Eyebrow x={-0.25} y={0.23} rotation={0.16} />
      <Eyebrow x={0.25} y={0.23} rotation={-0.16} />
      <EyeSmile x={-0.24} />
      <EyeSmile x={0.24} />
      <MouthSmile />
    </group>
  );
}

function SadFace({ eyeColor }: { eyeColor: string }) {
  return (
    <group>
      <Eyebrow x={-0.25} y={0.19} rotation={0.42} />
      <Eyebrow x={0.25} y={0.19} rotation={-0.42} />
      <AnimeEye x={-0.24} color={eyeColor} shape="droopy" rotation={-0.05} irisOffsetY={-0.012} />
      <AnimeEye x={0.24} color={eyeColor} shape="droopy" rotation={0.05} irisOffsetY={-0.012} />
      <MouthSad />
      <Sphere args={[0.035, 10, 7]} position={[0.36, -0.02, 0.748]} scale={[0.65, 1.2, 0.2]}>
        <meshToonMaterial {...materialProps(TEAR_BLUE)} />
      </Sphere>
    </group>
  );
}

function AngryFace({ eyeColor }: { eyeColor: string }) {
  return (
    <group>
      <Eyebrow x={-0.25} y={0.21} rotation={-0.72} />
      <Eyebrow x={0.25} y={0.21} rotation={0.72} />
      <AnimeEye x={-0.24} color={eyeColor} shape="narrow" rotation={-0.08} />
      <AnimeEye x={0.24} color={eyeColor} shape="narrow" rotation={0.08} />
      <MouthFlat y={-0.3} />
    </group>
  );
}

function SurprisedFace({ eyeColor }: { eyeColor: string }) {
  return (
    <group>
      <Eyebrow x={-0.25} y={0.28} rotation={0.07} />
      <Eyebrow x={0.25} y={0.28} rotation={-0.07} />
      <AnimeEye x={-0.24} color={eyeColor} shape="wide" irisOffsetY={0.002} />
      <AnimeEye x={0.24} color={eyeColor} shape="wide" irisOffsetY={0.002} />
      <Torus args={[0.075, 0.018, 8, 24]} position={[0, -0.26, 0.735]} scale={[0.78, 1.05, 1]}>
        <meshToonMaterial {...materialProps(FACE_DARK, 0.78)} />
      </Torus>
    </group>
  );
}

function LoveFace() {
  return (
    <group>
      <Eyebrow x={-0.25} y={0.24} rotation={0.18} />
      <Eyebrow x={0.25} y={0.24} rotation={-0.18} />
      <HeartEye x={-0.24} />
      <HeartEye x={0.24} />
      <MouthSmile y={-0.28} scale={0.86} />
    </group>
  );
}

function HeartEye({ x }: { x: number }) {
  return (
    <group position={[x, 0.05, 0.728]}>
      <Sphere args={[0.045, 10, 7]} position={[-0.035, 0.035, 0]} scale={[1, 1, 0.18]}>
        <meshToonMaterial {...materialProps(HEART_RED, 0.62)} />
      </Sphere>
      <Sphere args={[0.045, 10, 7]} position={[0.035, 0.035, 0]} scale={[1, 1, 0.18]}>
        <meshToonMaterial {...materialProps(HEART_RED, 0.62)} />
      </Sphere>
      <Cone args={[0.066, 0.11, 3]} position={[0, -0.02, 0]} rotation={[0, 0, Math.PI]} scale={[1, 1, 0.2]}>
        <meshToonMaterial {...materialProps(HEART_RED, 0.62)} />
      </Cone>
      <Sphere args={[0.012, 8, 5]} position={[-0.026, 0.06, 0.035]} scale={[1, 1, 0.16]}>
        <meshToonMaterial {...materialProps(EYE_HIGHLIGHT)} />
      </Sphere>
    </group>
  );
}

function NeutralFace({ eyeColor }: { eyeColor: string }) {
  return (
    <group>
      <Eyebrow x={-0.25} y={0.22} rotation={0.04} />
      <Eyebrow x={0.25} y={0.22} rotation={-0.04} />
      <AnimeEye x={-0.24} color={eyeColor} />
      <AnimeEye x={0.24} color={eyeColor} />
      <MouthFlat />
    </group>
  );
}

function AccessoryView({ character }: { character: CharacterPreset }) {
  if (character.accessory === "none") return null;

  return (
    <group>
      {character.accessory === "glasses" && <GlassesAccessory color={character.accessoryColor} />}
      {character.accessory === "ribbon" && <RibbonAccessory color={character.accessoryColor} />}
      {character.accessory === "catEars" && <CatEarsAccessory color={character.accessoryColor} />}
      {character.accessory === "hat" && <HatAccessory color={character.accessoryColor} />}
      {character.accessory === "flower" && <FlowerAccessory color={character.accessoryColor} />}
      {character.accessory === "horns" && <HornsAccessory color={character.accessoryColor} />}
      {character.accessory === "maidHeadband" && <MaidHeadbandAccessory color={character.accessoryColor} />}
      {character.accessory === "crown" && <CrownAccessory color={character.accessoryColor} />}
      {character.accessory === "antenna" && <AntennaAccessory color={character.accessoryColor} />}
    </group>
  );
}

function GlassesAccessory({ color }: { color: string }) {
  return (
    <group>
      <Torus args={[0.15, 0.012, 8, 28]} position={[-0.24, 0.05, 0.72]} scale={[1, 0.82, 1]}>
        <meshToonMaterial {...materialProps(color, 0.7)} />
      </Torus>
      <Torus args={[0.15, 0.012, 8, 28]} position={[0.24, 0.05, 0.72]} scale={[1, 0.82, 1]}>
        <meshToonMaterial {...materialProps(color, 0.7)} />
      </Torus>
      <Capsule args={[0.01, 0.14, 4, 8]} position={[0, 0.05, 0.72]} rotation={[0, 0, Math.PI / 2]}>
        <meshToonMaterial {...materialProps(color, 0.7)} />
      </Capsule>
    </group>
  );
}

function RibbonAccessory({ color }: { color: string }) {
  return (
    <group position={[0.38, 0.63, 0.12]} rotation={[0, 0, -0.2]}>
      <Sphere args={[0.14, 14, 8]} position={[-0.11, 0, 0]} scale={[1.35, 0.76, 0.36]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.55)} />
      </Sphere>
      <Sphere args={[0.14, 14, 8]} position={[0.11, 0, 0]} scale={[1.35, 0.76, 0.36]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.55)} />
      </Sphere>
      <Sphere args={[0.055, 10, 6]} position={[0, 0, 0.03]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps("#ffd1df", 0.6)} />
      </Sphere>
    </group>
  );
}

function CatEarsAccessory({ color }: { color: string }) {
  return (
    <group>
      <Cone args={[0.18, 0.38, 4]} position={[-0.38, 0.68, -0.03]} rotation={[0, 0, 0.26]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.58)} />
      </Cone>
      <Cone args={[0.18, 0.38, 4]} position={[0.38, 0.68, -0.03]} rotation={[0, 0, -0.26]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.58)} />
      </Cone>
      <Cone args={[0.09, 0.19, 4]} position={[-0.38, 0.69, 0.02]} rotation={[0, 0, 0.26]} scale={[0.72, 0.72, 0.72]}>
        <meshToonMaterial {...materialProps(FACE_SOFT, 0.68)} />
      </Cone>
      <Cone args={[0.09, 0.19, 4]} position={[0.38, 0.69, 0.02]} rotation={[0, 0, -0.26]} scale={[0.72, 0.72, 0.72]}>
        <meshToonMaterial {...materialProps(FACE_SOFT, 0.68)} />
      </Cone>
    </group>
  );
}

function HatAccessory({ color }: { color: string }) {
  return (
    <group position={[0, 0.55, 0.02]} rotation={[0.02, 0, -0.12]}>
      <Cylinder args={[0.58, 0.58, 0.055, 28]} position={[0, 0, 0]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(HAT_DARK, 0.68)} />
      </Cylinder>
      <Cylinder args={[0.38, 0.44, 0.25, 24]} position={[0, 0.13, 0]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.62)} />
      </Cylinder>
      <Capsule args={[0.018, 0.42, 4, 10]} position={[0, 0.02, 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <meshToonMaterial {...materialProps(characterBandColor(color), 0.6)} />
      </Capsule>
    </group>
  );
}

function characterBandColor(color: string) {
  if (color === "#497ec5") return "#cfe5ff";
  return "#f5dfc4";
}

function FlowerAccessory({ color }: { color: string }) {
  const petals: Array<[number, number]> = [
    [0, 0.095],
    [0.085, 0.025],
    [0.055, -0.08],
    [-0.055, -0.08],
    [-0.085, 0.025],
  ];

  return (
    <group position={[-0.43, 0.45, 0.48]} rotation={[0, 0, -0.2]}>
      {petals.map(([x, y]) => (
        <Sphere key={`${x}-${y}`} args={[0.055, 10, 6]} position={[x, y, 0]} scale={[1, 0.72, 0.22]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(color, 0.58)} />
        </Sphere>
      ))}
      <Sphere args={[0.04, 10, 6]} position={[0, 0, 0.03]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps("#ffd86b", 0.55)} />
      </Sphere>
    </group>
  );
}

function HornsAccessory({ color }: { color: string }) {
  return (
    <group>
      <Cone args={[0.12, 0.3, 5]} position={[-0.34, 0.66, -0.04]} rotation={[0, 0, 0.42]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.56)} />
      </Cone>
      <Cone args={[0.12, 0.3, 5]} position={[0.34, 0.66, -0.04]} rotation={[0, 0, -0.42]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.56)} />
      </Cone>
    </group>
  );
}

function MaidHeadbandAccessory({ color }: { color: string }) {
  return (
    <group position={[0, 0.55, 0.3]} rotation={[0.08, 0, 0]}>
      <Capsule args={[0.035, 0.56, 5, 12]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.72)} />
      </Capsule>
      <Sphere args={[0.055, 10, 6]} position={[-0.2, 0.035, 0.02]} scale={[1.1, 0.7, 0.22]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.72)} />
      </Sphere>
      <Sphere args={[0.055, 10, 6]} position={[0.2, 0.035, 0.02]} scale={[1.1, 0.7, 0.22]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.72)} />
      </Sphere>
    </group>
  );
}

function CrownAccessory({ color }: { color: string }) {
  return (
    <group position={[0, 0.67, 0.03]} rotation={[0, 0, -0.04]}>
      <Cylinder args={[0.24, 0.28, 0.08, 18]} position={[0, 0, 0]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color, 0.42)} />
      </Cylinder>
      {[-0.14, 0, 0.14].map((x) => (
        <Cone key={x} args={[0.07, 0.16, 5]} position={[x, 0.11, 0]} castShadow receiveShadow>
          <meshToonMaterial {...materialProps(color, 0.4)} />
        </Cone>
      ))}
      <Sphere args={[0.024, 8, 5]} position={[0, 0.2, 0.03]} scale={[1, 1, 0.24]}>
        <meshToonMaterial {...materialProps("#fff0a8", 0.38)} />
      </Sphere>
    </group>
  );
}

function AntennaAccessory({ color }: { color: string }) {
  return (
    <group position={[0.28, 0.68, 0.03]} rotation={[0, 0, -0.22]}>
      <Capsule args={[0.018, 0.28, 4, 8]} position={[0, 0.1, 0]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps("#637180", 0.48)} />
      </Capsule>
      <Sphere args={[0.055, 12, 7]} position={[0, 0.28, 0.02]} scale={[1, 1, 0.8]} castShadow receiveShadow>
        <meshToonMaterial {...materialProps(color)} emissive={color} emissiveIntensity={0.08} />
      </Sphere>
    </group>
  );
}

function PoserScene({
  character,
  expression,
  pose,
  rotationDeg,
  cameraPreset,
  captureRef,
}: {
  character: CharacterPreset;
  expression: ExpressionId;
  pose: PosePreset;
  rotationDeg: number;
  cameraPreset: CameraPresetId;
  captureRef: MutableRefObject<CaptureState>;
}) {
  return (
    <>
      <CaptureBridge captureRef={captureRef} />
      <CameraDirector presetId={cameraPreset} />
      <ambientLight intensity={2.25} color="#fff8ef" />
      <directionalLight position={[-3.2, 4.8, 4.2]} intensity={0.95} color="#fff0d9" castShadow shadow-mapSize={[1024, 1024]} />
      <Bounds fit clip observe margin={1.18} maxDuration={0.45}>
        <ChibiCharacter character={character} expression={expression} pose={pose} bodyRotation={THREE.MathUtils.degToRad(rotationDeg)} />
      </Bounds>
      <ContactShadows position={[0, 0.02, 0]} scale={3.2} blur={3.4} opacity={0.16} far={2.8} color="#261d18" />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3.2}
        maxDistance={7}
        minPolarAngle={0.5}
        maxPolarAngle={1.68}
        target={[0, 1.35, 0]}
      />
    </>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
      <span className="grid size-7 place-items-center rounded-md border border-line bg-panel text-accent">{icon}</span>
      <span>{title}</span>
    </div>
  );
}

function StudioButton({
  selected,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        "rounded-lg border px-3 py-2 text-left text-sm font-medium transition duration-150 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80",
        selected
          ? "border-accent bg-accent-soft text-fg shadow-[0_0_0_1px_oklch(0.72_0.185_42/0.18)_inset]"
          : "border-line bg-panel/80 text-fg-2 hover:border-accent/60 hover:bg-accent-soft/55 hover:text-fg",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Studio3DPoser({ open, onClose, onInsert }: Studio3DPoserProps) {
  const captureRef = useRef<CaptureState>({ gl: null, scene: null, camera: null });
  const [characterId, setCharacterId] = useState(CHARACTER_PRESETS[0].id);
  const [expression, setExpression] = useState<ExpressionId>("happy");
  const [poseId, setPoseId] = useState<PoseId>("idle");
  const [rotationDeg, setRotationDeg] = useState(12);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>("front");

  const character = findCharacter(characterId);
  const pose = findPose(poseId);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const handleInsert = () => {
    const capture = captureRef.current;
    if (!capture.gl || !capture.scene || !capture.camera) return;

    capture.gl.render(capture.scene, capture.camera);
    const pngDataUrl = capture.gl.domElement.toDataURL("image/png");
    const size = roundExportSize(capture.gl.domElement);
    onInsert(pngDataUrl, size.width, size.height);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.08_0.012_68/0.76)] p-3 text-fg backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="3D 캐릭터 포저"
        className="flex h-[min(92vh,880px)] w-[min(1180px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl shadow-[oklch(0.05_0.01_65/0.45)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">3D Pose Snap</p>
            <h2 className="truncate text-lg font-semibold text-fg">치비 캐릭터 포저</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg border border-line bg-panel text-fg-2 transition hover:border-accent/60 hover:bg-accent-soft hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] max-lg:grid-cols-1 max-lg:grid-rows-[minmax(380px,1fr)_auto]">
          <main className="relative grid min-h-0 place-items-center overflow-hidden border-r border-line bg-panel max-lg:border-b max-lg:border-r-0">
            <div className="absolute inset-0 bg-[linear-gradient(oklch(0.305_0.012_64/0.28)_1px,transparent_1px),linear-gradient(90deg,oklch(0.305_0.012_64/0.2)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <div className="absolute left-4 top-4 rounded-lg border border-line bg-card/90 px-3 py-2 text-xs text-fg-2 shadow-sm backdrop-blur">
              <span className="font-semibold text-fg">{character.name}</span>
              <span className="mx-2 text-fg-3">/</span>
              <span>{pose.label}</span>
            </div>
            <div className="relative z-10 aspect-[3/4] h-[min(70vh,660px)] min-h-[360px] rounded-lg border border-line bg-[radial-gradient(circle_at_50%_35%,oklch(0.72_0.185_42/0.13),transparent_48%),linear-gradient(180deg,oklch(0.245_0.011_64/0.58),oklch(0.185_0.009_68/0.2))]">
              <Canvas
                camera={{ position: findCameraPreset(cameraPreset).position, fov: 34, near: 0.1, far: 100 }}
                dpr={[1, 2]}
                gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
                shadows
                onCreated={({ gl, scene }) => {
                  gl.setClearColor(0x000000, 0);
                  scene.background = null;
                }}
              >
                <PoserScene
                  character={character}
                  expression={expression}
                  pose={pose}
                  rotationDeg={rotationDeg}
                  cameraPreset={cameraPreset}
                  captureRef={captureRef}
                />
              </Canvas>
            </div>
          </main>

          <aside className="flex min-h-0 flex-col bg-card/80">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <section>
                <SectionTitle icon={<UserRound className="size-4" />} title="캐릭터" />
                <div className="grid grid-cols-2 gap-2">
                  {CHARACTER_PRESETS.map((preset) => (
                    <StudioButton
                      key={preset.id}
                      selected={preset.id === characterId}
                      onClick={() => setCharacterId(preset.id)}
                      className="min-h-[72px]"
                    >
                      <span className="mb-2 flex items-center gap-1.5">
                        <span className="size-3 rounded-full border border-line" style={{ backgroundColor: preset.skin }} />
                        <span className="size-3 rounded-full border border-line" style={{ backgroundColor: preset.hair }} />
                        <span className="size-3 rounded-full border border-line" style={{ backgroundColor: preset.outfit }} />
                      </span>
                      <span className="block text-fg">{preset.name}</span>
                      <span className="mt-0.5 block text-xs font-normal text-fg-3">{preset.tag}</span>
                    </StudioButton>
                  ))}
                </div>
              </section>

              <section>
                <SectionTitle icon={<Sparkles className="size-4" />} title="표정" />
                <div className="grid grid-cols-3 gap-2">
                  {EXPRESSIONS.map((item) => (
                    <StudioButton key={item.id} selected={item.id === expression} onClick={() => setExpression(item.id)}>
                      {item.label}
                    </StudioButton>
                  ))}
                </div>
              </section>

              <section>
                <SectionTitle icon={<WandSparkles className="size-4" />} title="포즈" />
                <div className="grid grid-cols-2 gap-2">
                  {POSE_PRESETS.map((item) => (
                    <StudioButton key={item.id} selected={item.id === poseId} onClick={() => setPoseId(item.id)} className="min-h-[58px]">
                      <span className="block text-fg">{item.label}</span>
                      <span className="mt-0.5 block text-xs font-normal text-fg-3">{item.hint}</span>
                    </StudioButton>
                  ))}
                </div>
              </section>

              <section>
                <SectionTitle icon={<Camera className="size-4" />} title="카메라" />
                <div className="grid grid-cols-3 gap-2">
                  {CAMERA_PRESETS.map((item) => (
                    <StudioButton key={item.id} selected={item.id === cameraPreset} onClick={() => setCameraPreset(item.id)}>
                      {item.label}
                    </StudioButton>
                  ))}
                </div>
              </section>

              <section>
                <SectionTitle icon={<Rotate3D className="size-4" />} title="회전" />
                <div className="rounded-lg border border-line bg-panel px-3 py-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-fg-2">몸 방향</span>
                    <span className="font-medium tabular-nums text-fg">{rotationDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={rotationDeg}
                    onChange={(event) => setRotationDeg(Number(event.target.value))}
                    className="h-2 w-full accent-accent"
                    aria-label="몸 방향 회전"
                  />
                  <div className="mt-2 flex justify-between text-[0.7rem] text-fg-3">
                    <span>-180°</span>
                    <span>0°</span>
                    <span>180°</span>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel px-3 py-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  <Glasses className="size-4 text-accent" />
                  <span>현재 조합</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-fg-2">
                  <span>캐릭터</span>
                  <span className="text-right text-fg">{character.name}</span>
                  <span>표정</span>
                  <span className="text-right text-fg">{EXPRESSIONS.find((item) => item.id === expression)?.label}</span>
                  <span>포즈</span>
                  <span className="text-right text-fg">{pose.label}</span>
                </div>
              </section>
            </div>

            <footer className="flex gap-2 border-t border-line bg-panel px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-fg-2 transition hover:border-accent/60 hover:bg-accent-soft hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
              >
                <X className="size-4" />
                닫기
              </button>
              <button
                type="button"
                onClick={handleInsert}
                className="inline-flex h-11 flex-[1.35] items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
              >
                <Check className="size-4" />
                이 포즈로 추가
                <Heart className="size-4" />
              </button>
            </footer>
          </aside>
        </div>
      </div>
    </div>
  );
}

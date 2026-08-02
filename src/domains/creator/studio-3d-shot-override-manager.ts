export interface CameraTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  near: number;
  far: number;
  projection: "perspective" | "orthographic";
}

export interface NodeOverride {
  nodeId: string;
  visible?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  materialColor?: string;
  toonOutlineWidth?: number;
}

export interface StudioShotOverride {
  shotId: string;
  name: string;
  camera: CameraTransform;
  nodeOverrides: Record<string, NodeOverride>;
  vrmPoseOverrides: Record<string, Record<string, [number, number, number]>>;
  vrmExpressionOverrides: Record<string, Record<string, number>>;
  lightOverrides?: {
    intensity?: number;
    color?: string;
    direction?: [number, number, number];
  };
}

export interface Studio3DShotScene {
  activeShotId: string;
  shots: Record<string, StudioShotOverride>;
}

export function createDefaultShotOverride(shotId: string, name: string): StudioShotOverride {
  return {
    shotId,
    name,
    camera: {
      position: [0, 1.5, 3],
      rotation: [0, 0, 0],
      fov: 45,
      near: 0.1,
      far: 1000,
      projection: "perspective",
    },
    nodeOverrides: {},
    vrmPoseOverrides: {},
    vrmExpressionOverrides: {},
  };
}

export class Studio3DShotManager {
  private scene: Studio3DShotScene;

  constructor(initialShotId = "shot-1", initialShotName = "Shot 1 (메인 컷)") {
    const defaultShot = createDefaultShotOverride(initialShotId, initialShotName);
    this.scene = {
      activeShotId: initialShotId,
      shots: {
        [initialShotId]: defaultShot,
      },
    };
  }

  public getActiveShot(): StudioShotOverride {
    return this.scene.shots[this.scene.activeShotId] ?? createDefaultShotOverride(this.scene.activeShotId, "Active Shot");
  }

  public setActiveShot(shotId: string): StudioShotOverride {
    if (!this.scene.shots[shotId]) {
      this.scene.shots[shotId] = createDefaultShotOverride(shotId, `Shot ${Object.keys(this.scene.shots).length + 1}`);
    }
    this.scene.activeShotId = shotId;
    return this.scene.shots[shotId];
  }

  public addShot(shotId: string, name: string, copyFromActive = true): StudioShotOverride {
    const active = this.getActiveShot();
    const newShot: StudioShotOverride = copyFromActive
      ? {
          ...JSON.parse(JSON.stringify(active)),
          shotId,
          name,
        }
      : createDefaultShotOverride(shotId, name);

    this.scene.shots[shotId] = newShot;
    return newShot;
  }

  public removeShot(shotId: string): boolean {
    const keys = Object.keys(this.scene.shots);
    if (keys.length <= 1) return false; // 최소 1개 컷 유지
    delete this.scene.shots[shotId];
    if (this.scene.activeShotId === shotId) {
      this.scene.activeShotId = Object.keys(this.scene.shots)[0];
    }
    return true;
  }

  public setNodeOverride(shotId: string, nodeId: string, override: Partial<NodeOverride>): void {
    const shot = this.scene.shots[shotId];
    if (!shot) return;
    shot.nodeOverrides[nodeId] = {
      ...(shot.nodeOverrides[nodeId] ?? { nodeId }),
      ...override,
    };
  }

  public setCameraTransform(shotId: string, camera: Partial<CameraTransform>): void {
    const shot = this.scene.shots[shotId];
    if (!shot) return;
    shot.camera = { ...shot.camera, ...camera };
  }

  public listShots(): StudioShotOverride[] {
    return Object.values(this.scene.shots);
  }

  public serialize(): string {
    return JSON.stringify(this.scene, null, 2);
  }

  public deserialize(json: string): void {
    const parsed = JSON.parse(json) as Studio3DShotScene;
    if (parsed && parsed.shots && parsed.activeShotId) {
      this.scene = parsed;
    }
  }
}

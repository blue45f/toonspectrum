/**
 * Studio 3D Modifier DAG (Directed Acyclic Graph)
 *
 * 비파괴(non-destructive) Modifier 스택을 관리합니다.
 * Blender/3ds Max 스타일의 Modifier 연산 파이프라인을 구현하며,
 * 각 Modifier는 독립 파라미터와 활성화 상태를 가집니다.
 *
 * 설계서 참조: §4.5 Modifier/Feature DAG, §6.3 MOD-012~MOD-021
 */

export type ModifierType =
  | "mirror"
  | "array"
  | "boolean"
  | "bevel"
  | "solidify"
  | "subdivision"
  | "decimate"
  | "weld"
  | "weighted-normal"
  | "curve-deform"
  | "lattice"
  | "shrinkwrap"
  | "simple-deform";

export interface ModifierParams {
  mirror?: { axis: ("x" | "y" | "z")[]; clipping: boolean; mergeThreshold: number };
  array?: { count: number; offset: [number, number, number]; useRelative: boolean };
  boolean?: { operation: "union" | "subtract" | "intersect"; targetMeshId: string };
  bevel?: { width: number; segments: number; limitAngle: number };
  solidify?: { thickness: number; offset: number; evenThickness: boolean; fillRim: boolean };
  subdivision?: { level: number; uvSmooth: "none" | "keep-corners" | "all" };
  decimate?: { ratio: number; symmetryAxis?: "x" | "y" | "z" };
  weld?: { threshold: number };
  "weighted-normal"?: { weight: number; faceInfluence: boolean };
  "curve-deform"?: { curveId: string; axis: "x" | "y" | "z" };
  lattice?: { resolution: [number, number, number] };
  shrinkwrap?: { targetId: string; offset: number; mode: "nearest" | "project" | "nearest-surface" };
  "simple-deform"?: { mode: "twist" | "bend" | "taper" | "stretch"; angle: number; factor: number; axis: "x" | "y" | "z" };
}

export interface ModifierNode {
  id: string;
  type: ModifierType;
  name: string;
  enabled: boolean;
  showInViewport: boolean;
  expanded: boolean;
  params: ModifierParams[ModifierType];
}

export class Studio3DModifierDAG {
  private stack: ModifierNode[] = [];
  private nextId = 1;

  public addModifier(type: ModifierType, name?: string, params?: ModifierParams[ModifierType]): ModifierNode {
    const id = `mod-${this.nextId++}`;
    const node: ModifierNode = {
      id,
      type,
      name: name ?? this.getDefaultName(type),
      enabled: true,
      showInViewport: true,
      expanded: true,
      params: params ?? this.getDefaultParams(type),
    };
    this.stack.push(node);
    return node;
  }

  public removeModifier(id: string): boolean {
    const idx = this.stack.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.stack.splice(idx, 1);
    return true;
  }

  public moveModifier(id: string, newIndex: number): boolean {
    const idx = this.stack.findIndex((m) => m.id === id);
    if (idx === -1 || newIndex < 0 || newIndex >= this.stack.length) return false;
    const [mod] = this.stack.splice(idx, 1);
    this.stack.splice(newIndex, 0, mod);
    return true;
  }

  public toggleModifier(id: string, enabled?: boolean): boolean {
    const mod = this.stack.find((m) => m.id === id);
    if (!mod) return false;
    mod.enabled = enabled ?? !mod.enabled;
    return true;
  }

  public getStack(): readonly ModifierNode[] {
    return this.stack;
  }

  public getActiveModifiers(): ModifierNode[] {
    return this.stack.filter((m) => m.enabled);
  }

  public getModifier(id: string): ModifierNode | undefined {
    return this.stack.find((m) => m.id === id);
  }

  public duplicateModifier(id: string): ModifierNode | undefined {
    const src = this.stack.find((m) => m.id === id);
    if (!src) return undefined;
    return this.addModifier(
      src.type,
      `${src.name} (복사)`,
      structuredClone(src.params),
    );
  }

  public serializeToJSON(): string {
    return JSON.stringify(this.stack, null, 2);
  }

  public loadFromJSON(json: string): void {
    const parsed = JSON.parse(json) as ModifierNode[];
    this.stack = parsed;
    const maxId = parsed.reduce((max, m) => {
      const num = parseInt(m.id.replace("mod-", ""), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    this.nextId = maxId + 1;
  }

  private getDefaultName(type: ModifierType): string {
    const names: Record<ModifierType, string> = {
      mirror: "거울 (Mirror)",
      array: "배열 (Array)",
      boolean: "불리언 (Boolean)",
      bevel: "베벨 (Bevel)",
      solidify: "두께 부여 (Solidify)",
      subdivision: "서브디비전 (Subdivision)",
      decimate: "폴리곤 간소화 (Decimate)",
      weld: "정점 병합 (Weld)",
      "weighted-normal": "가중 노멀 (Weighted Normal)",
      "curve-deform": "커브 변형 (Curve Deform)",
      lattice: "격자 변형 (Lattice)",
      shrinkwrap: "표면 붙이기 (Shrinkwrap)",
      "simple-deform": "단순 변형 (Simple Deform)",
    };
    return names[type];
  }

  private getDefaultParams(type: ModifierType): ModifierParams[ModifierType] {
    const defaults: Record<string, unknown> = {
      mirror: { axis: ["x"], clipping: true, mergeThreshold: 0.001 },
      array: { count: 2, offset: [1, 0, 0], useRelative: true },
      boolean: { operation: "subtract", targetMeshId: "" },
      bevel: { width: 0.02, segments: 1, limitAngle: 30 },
      solidify: { thickness: 0.05, offset: -1, evenThickness: true, fillRim: true },
      subdivision: { level: 1, uvSmooth: "keep-corners" },
      decimate: { ratio: 0.5 },
      weld: { threshold: 0.001 },
      "weighted-normal": { weight: 50, faceInfluence: true },
      "curve-deform": { curveId: "", axis: "x" },
      lattice: { resolution: [2, 2, 2] },
      shrinkwrap: { targetId: "", offset: 0, mode: "nearest-surface" },
      "simple-deform": { mode: "bend", angle: 45, factor: 1, axis: "z" },
    };
    return defaults[type] as ModifierParams[ModifierType];
  }
}

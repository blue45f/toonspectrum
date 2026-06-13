// VRM 본 부착 소품(아이템) 시스템 — 캐릭터 손/머리/몸에 프로시저럴 three.js 소품을 자유롭게 부착한다.
// 코미Po!의 "소품 배치"를 넘어, 부착 본·오프셋·회전·스케일·색상을 모두 사용자가 제어하고 직렬화한다.
//
// 설계 원칙:
//  - 외부 에셋 URL 0. 모든 소품은 three 프리미티브 조합으로 런타임 생성(빌더는 three 주입형 → 순수 테스트 가능).
//  - 부착 본은 VRM humanoid 표준 본 이름만 사용(StudioVrmPoser의 본 집합과 호환).
//  - 직렬화는 옵셔널·버전 필드 → 기존 스튜디오 문서 하위호환.

export const VRM_PROPS_VERSION = 1 as const;

/** 부착 가능한 humanoid 본(three-vrm humanoid 표준 이름). */
export type PropAttachBone =
  | "rightHand"
  | "leftHand"
  | "head"
  | "chest"
  | "spine"
  | "hips"
  | "neck";

export const PROP_ATTACH_BONES: readonly PropAttachBone[] = [
  "rightHand",
  "leftHand",
  "head",
  "neck",
  "chest",
  "spine",
  "hips",
] as const;

export const PROP_BONE_LABELS: Record<PropAttachBone, string> = {
  rightHand: "오른손",
  leftHand: "왼손",
  head: "머리",
  neck: "목",
  chest: "가슴",
  spine: "허리",
  hips: "골반",
};

export type PropCategory = "hand" | "head" | "body";

export const PROP_CATEGORY_LABELS: Record<PropCategory, string> = {
  hand: "손 소품",
  head: "머리 소품",
  body: "몸 소품",
};

export type Vec3 = readonly [number, number, number];

export interface PropDef {
  id: string;
  label: string;
  category: PropCategory;
  /** 기본 부착 본. */
  defaultBone: PropAttachBone;
  /** 기본 오프셋(부착 본 로컬, 미터). */
  defaultPosition: Vec3;
  /** 기본 회전(오일러, 도). */
  defaultRotationDeg: Vec3;
  /** 기본 스케일(배율). */
  defaultScale: number;
  /** 기본 색상(hex). 색상 변경 비대상 소품은 null. */
  defaultColor: string | null;
  /** 짧은 사용 설명. */
  hint: string;
}

/* ── 소품 카탈로그(18종) ─────────────────────────────────────────────── */

export const VRM_PROPS: readonly PropDef[] = [
  // 손 소품
  { id: "smartphone", label: "스마트폰", category: "hand", defaultBone: "rightHand", defaultPosition: [0.02, 0, 0.03], defaultRotationDeg: [10, 0, 0], defaultScale: 1, defaultColor: "#1c1c22", hint: "셀카·통화 컷에. 회전으로 화면 각도를 잡으세요." },
  { id: "mug", label: "머그컵", category: "hand", defaultBone: "rightHand", defaultPosition: [0.02, 0.01, 0.02], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#e8e2d6", hint: "카페·일상 컷. 손 안쪽으로 당겨 쥐게 보정하세요." },
  { id: "sword", label: "검", category: "hand", defaultBone: "rightHand", defaultPosition: [0.02, 0, 0], defaultRotationDeg: [0, 0, -90], defaultScale: 1, defaultColor: "#c8ccd4", hint: "액션 컷. 회전 Z로 칼끝 방향을 조절하세요." },
  { id: "staff", label: "지팡이", category: "hand", defaultBone: "rightHand", defaultPosition: [0.02, 0, 0], defaultRotationDeg: [0, 0, 5], defaultScale: 1, defaultColor: "#8a6a3c", hint: "판타지·마법사 컷에." },
  { id: "mic", label: "마이크", category: "hand", defaultBone: "rightHand", defaultPosition: [0.02, 0.02, 0.02], defaultRotationDeg: [25, 0, 0], defaultScale: 1, defaultColor: "#26262c", hint: "무대·노래 컷. 입 쪽으로 기울이세요." },
  { id: "book", label: "책", category: "hand", defaultBone: "leftHand", defaultPosition: [0.02, 0.01, 0.04], defaultRotationDeg: [60, 0, 0], defaultScale: 1, defaultColor: "#7a3b3b", hint: "학원물·독서 컷. 두 손에 각각 얹어도 좋아요." },
  { id: "fan", label: "부채", category: "hand", defaultBone: "rightHand", defaultPosition: [0.02, 0.02, 0.01], defaultRotationDeg: [0, 0, 20], defaultScale: 1, defaultColor: "#d8475e", hint: "사극·여름 컷. 펼친 각도를 회전으로." },
  { id: "bouquet", label: "꽃다발", category: "hand", defaultBone: "leftHand", defaultPosition: [0.02, 0.03, 0.02], defaultRotationDeg: [-15, 0, 0], defaultScale: 1, defaultColor: "#e86a9b", hint: "고백·축하 컷. 색상으로 꽃 색을 바꾸세요." },
  // 머리 소품
  { id: "cap", label: "캡모자", category: "head", defaultBone: "head", defaultPosition: [0, 0.08, 0.01], defaultRotationDeg: [-8, 0, 0], defaultScale: 1, defaultColor: "#2b3a55", hint: "캐주얼 컷. 앞뒤로 당겨 깊이를 맞추세요." },
  { id: "beret", label: "베레모", category: "head", defaultBone: "head", defaultPosition: [-0.03, 0.09, 0], defaultRotationDeg: [0, 0, 12], defaultScale: 1, defaultColor: "#7a3b52", hint: "아트·감성 컷. 한쪽으로 비스듬히." },
  { id: "glasses", label: "안경", category: "head", defaultBone: "head", defaultPosition: [0, 0.02, 0.07], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#1c1c22", hint: "지적 캐릭터. 색상으로 뿔테/투명 느낌을." },
  { id: "sunglasses", label: "선글라스", category: "head", defaultBone: "head", defaultPosition: [0, 0.02, 0.07], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#101014", hint: "쿨한 컷. 살짝 내려 콧등에 걸쳐도." },
  { id: "crown", label: "왕관", category: "head", defaultBone: "head", defaultPosition: [0, 0.11, 0], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#e7c14b", hint: "공주·왕자 컷. 색으로 금/은을 선택." },
  { id: "ribbon", label: "머리 리본", category: "head", defaultBone: "head", defaultPosition: [0.05, 0.08, 0], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#e8536e", hint: "소녀 캐릭터. 좌우로 옮겨 사이드 포인트." },
  // 몸 소품
  { id: "backpack", label: "백팩", category: "body", defaultBone: "chest", defaultPosition: [0, -0.05, -0.1], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#3b4a3b", hint: "학생·여행 컷. 등 쪽으로 밀어 자연스럽게." },
  { id: "shoulderbag", label: "숄더백", category: "body", defaultBone: "chest", defaultPosition: [0.08, -0.08, 0.04], defaultRotationDeg: [0, 0, 10], defaultScale: 1, defaultColor: "#5a4632", hint: "데일리 컷. 한쪽 어깨로 사선 배치." },
  { id: "cape", label: "망토", category: "body", defaultBone: "chest", defaultPosition: [0, 0, -0.06], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#3a2b55", hint: "히어로·판타지 컷. 색으로 진영을 표현." },
  { id: "wings", label: "날개", category: "body", defaultBone: "chest", defaultPosition: [0, 0.02, -0.08], defaultRotationDeg: [0, 0, 0], defaultScale: 1, defaultColor: "#f2f2f5", hint: "천사·요정 컷. 스케일을 키워 존재감을." },
] as const;

export function propDefById(id: string): PropDef | undefined {
  return VRM_PROPS.find((p) => p.id === id);
}

export function propsByCategory(category: PropCategory): PropDef[] {
  return VRM_PROPS.filter((p) => p.category === category);
}

/* ── 부착 인스턴스(직렬화 대상) ──────────────────────────────────────── */

export interface PropInstance {
  /** 인스턴스 고유 id(같은 소품 복수 부착 허용). */
  uid: string;
  propId: string;
  bone: PropAttachBone;
  position: Vec3;
  rotationDeg: Vec3;
  scale: number;
  color: string | null;
}

export interface SerializedVrmProps {
  version: typeof VRM_PROPS_VERSION;
  items: PropInstance[];
}

let uidCounter = 0;
/** 결정성 불필요한 UI 인스턴스 키 — 시간+카운터(테스트에서 주입 가능하도록 분리). */
export function nextPropUid(seed?: string): string {
  uidCounter += 1;
  return seed ? `${seed}-${uidCounter}` : `prop-${Date.now().toString(36)}-${uidCounter}`;
}

/** 카탈로그 기본값으로 부착 인스턴스를 생성한다. */
export function createPropInstance(propId: string, uid?: string): PropInstance | null {
  const def = propDefById(propId);
  if (!def) return null;
  return {
    uid: uid ?? nextPropUid(propId),
    propId: def.id,
    bone: def.defaultBone,
    position: def.defaultPosition,
    rotationDeg: def.defaultRotationDeg,
    scale: def.defaultScale,
    color: def.defaultColor,
  };
}

const POS_LIMIT = 1; // ±1m
const ROT_LIMIT = 180; // ±180°
const SCALE_MIN = 0.2;
const SCALE_MAX = 4;

function num(value: unknown, fallback: number, limit: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(limit, Math.max(-limit, n));
}

function vec3(value: unknown, fallback: Vec3, limit: number): Vec3 {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [num(value[0], fallback[0], limit), num(value[1], fallback[1], limit), num(value[2], fallback[2], limit)];
}

function normalizeColor(value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string") return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function isAttachBone(value: unknown): value is PropAttachBone {
  return typeof value === "string" && (PROP_ATTACH_BONES as readonly string[]).includes(value);
}

/** 임의 입력(직렬화 문서)을 안전한 부착 인스턴스 배열로 정규화한다(알 수 없는 propId는 제거). */
export function parseVrmProps(raw: unknown): SerializedVrmProps {
  const empty: SerializedVrmProps = { version: VRM_PROPS_VERSION, items: [] };
  if (!raw || typeof raw !== "object") return empty;
  const itemsRaw = (raw as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) return empty;

  const items: PropInstance[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<Record<keyof PropInstance, unknown>>;
    const def = propDefById(String(e.propId ?? ""));
    if (!def) continue;
    items.push({
      uid: typeof e.uid === "string" && e.uid ? e.uid : nextPropUid(def.id),
      propId: def.id,
      bone: isAttachBone(e.bone) ? e.bone : def.defaultBone,
      position: vec3(e.position, def.defaultPosition, POS_LIMIT),
      rotationDeg: vec3(e.rotationDeg, def.defaultRotationDeg, ROT_LIMIT),
      scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, num(e.scale, def.defaultScale, SCALE_MAX))),
      color: def.defaultColor === null ? null : normalizeColor(e.color, def.defaultColor),
    });
  }
  return { version: VRM_PROPS_VERSION, items };
}

export function serializeVrmProps(items: PropInstance[]): SerializedVrmProps | undefined {
  if (items.length === 0) return undefined; // 빈 경우 문서에 키를 남기지 않음(하위호환)
  return { version: VRM_PROPS_VERSION, items };
}

/* ── three.js 소품 메시 빌더(주입형 — 순수 테스트 가능) ──────────────────
 * StudioVrmPoser가 three를 주입해 호출한다. three에 의존하지 않도록 최소 팩토리 인터페이스만 받는다.
 */

export interface ThreeLike {
  Group: new () => ThreeObject;
  Mesh: new (geometry: unknown, material: unknown) => ThreeObject;
  MeshStandardMaterial: new (params: { color?: unknown; roughness?: number; metalness?: number; side?: unknown }) => unknown;
  BoxGeometry: new (w: number, h: number, d: number) => unknown;
  CylinderGeometry: new (rt: number, rb: number, h: number, seg?: number) => unknown;
  SphereGeometry: new (r: number, ws?: number, hs?: number) => unknown;
  ConeGeometry: new (r: number, h: number, seg?: number) => unknown;
  TorusGeometry: new (r: number, tube: number, rs?: number, ts?: number) => unknown;
  Color: new (hex: string) => unknown;
  DoubleSide: unknown;
}

export interface ThreeObject {
  add(child: ThreeObject): void;
  position: { set(x: number, y: number, z: number): void };
  rotation: { set(x: number, y: number, z: number): void };
  scale: { setScalar(s: number): void };
  name: string;
}

/** 소품 한 종의 메시 그룹을 만든다. 색상은 인스턴스 색을 우선 적용한다. */
export function buildPropObject(three: ThreeLike, def: PropDef, color: string | null): ThreeObject {
  const group = new three.Group();
  group.name = `prop:${def.id}`;
  const hex = color ?? def.defaultColor ?? "#cccccc";
  const mat = (roughness = 0.6, metalness = 0.1, c: string = hex) =>
    new three.MeshStandardMaterial({ color: new three.Color(c), roughness, metalness, side: three.DoubleSide });
  const mesh = (geo: unknown, material: unknown): ThreeObject => new three.Mesh(geo, material);

  switch (def.id) {
    case "smartphone": {
      group.add(mesh(new three.BoxGeometry(0.07, 0.14, 0.008), mat(0.3, 0.4)));
      const screen = mesh(new three.BoxGeometry(0.06, 0.12, 0.001), mat(0.1, 0, "#3a6ea5"));
      screen.position.set(0, 0, 0.006);
      group.add(screen);
      break;
    }
    case "mug": {
      group.add(mesh(new three.CylinderGeometry(0.04, 0.035, 0.08, 20), mat(0.5)));
      const handle = mesh(new three.TorusGeometry(0.025, 0.008, 8, 16), mat(0.5));
      handle.position.set(0.045, 0, 0);
      handle.rotation.set(0, Math.PI / 2, 0);
      group.add(handle);
      break;
    }
    case "sword": {
      group.add(mesh(new three.BoxGeometry(0.025, 0.6, 0.008), mat(0.25, 0.85)));
      const guard = mesh(new three.BoxGeometry(0.12, 0.02, 0.02), mat(0.4, 0.7, "#8a6a3c"));
      guard.position.set(0, -0.3, 0);
      group.add(guard);
      const grip = mesh(new three.CylinderGeometry(0.014, 0.014, 0.12, 12), mat(0.7, 0.1, "#3a2b1c"));
      grip.position.set(0, -0.37, 0);
      group.add(grip);
      break;
    }
    case "staff": {
      group.add(mesh(new three.CylinderGeometry(0.012, 0.012, 0.7, 12), mat(0.7, 0.05)));
      const orb = mesh(new three.SphereGeometry(0.04, 16, 16), mat(0.1, 0.2, "#6ec3e8"));
      orb.position.set(0, 0.37, 0);
      group.add(orb);
      break;
    }
    case "mic": {
      group.add(mesh(new three.CylinderGeometry(0.012, 0.012, 0.12, 12), mat(0.5, 0.3)));
      const head = mesh(new three.SphereGeometry(0.028, 16, 16), mat(0.6, 0.2, "#3a3a40"));
      head.position.set(0, 0.08, 0);
      group.add(head);
      break;
    }
    case "book": {
      group.add(mesh(new three.BoxGeometry(0.14, 0.2, 0.03), mat(0.7)));
      const pages = mesh(new three.BoxGeometry(0.13, 0.19, 0.025), mat(0.8, 0, "#f0ece0"));
      pages.position.set(0.005, 0, 0);
      group.add(pages);
      break;
    }
    case "fan": {
      const blade = mesh(new three.CylinderGeometry(0.12, 0.12, 0.004, 24, 1, false, 0, Math.PI), mat(0.6));
      group.add(blade);
      break;
    }
    case "bouquet": {
      const wrap = mesh(new three.ConeGeometry(0.05, 0.14, 12), mat(0.7, 0, "#cdb89a"));
      group.add(wrap);
      for (let i = 0; i < 5; i += 1) {
        const flower = mesh(new three.SphereGeometry(0.03, 12, 12), mat(0.5));
        const a = (i / 5) * Math.PI * 2;
        flower.position.set(Math.cos(a) * 0.03, 0.09, Math.sin(a) * 0.03);
        group.add(flower);
      }
      break;
    }
    case "cap": {
      group.add(mesh(new three.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0.6)));
      const brim = mesh(new three.BoxGeometry(0.16, 0.01, 0.1), mat(0.6));
      brim.position.set(0, 0, 0.11);
      group.add(brim);
      break;
    }
    case "beret": {
      group.add(mesh(new three.CylinderGeometry(0.11, 0.1, 0.04, 24), mat(0.7)));
      break;
    }
    case "glasses":
    case "sunglasses": {
      const tint = def.id === "sunglasses" ? 0.2 : 0.5;
      const frameMat = mat(0.4, 0.3);
      const lensMat = mat(0.1, def.id === "sunglasses" ? 0.6 : 0.1, def.id === "sunglasses" ? hex : "#cfe6f2");
      const left = mesh(new three.TorusGeometry(0.03, 0.005, 8, 20), frameMat);
      left.position.set(-0.035, 0, 0);
      const right = mesh(new three.TorusGeometry(0.03, 0.005, 8, 20), frameMat);
      right.position.set(0.035, 0, 0);
      const bridge = mesh(new three.BoxGeometry(0.02, 0.004, 0.004), frameMat);
      group.add(left);
      group.add(right);
      group.add(bridge);
      if (def.id === "sunglasses" || tint < 0.3) {
        const ll = mesh(new three.CylinderGeometry(0.028, 0.028, 0.002, 16), lensMat);
        ll.position.set(-0.035, 0, 0);
        ll.rotation.set(Math.PI / 2, 0, 0);
        const rl = mesh(new three.CylinderGeometry(0.028, 0.028, 0.002, 16), lensMat);
        rl.position.set(0.035, 0, 0);
        rl.rotation.set(Math.PI / 2, 0, 0);
        group.add(ll);
        group.add(rl);
      }
      break;
    }
    case "crown": {
      group.add(mesh(new three.CylinderGeometry(0.06, 0.06, 0.04, 20, 1, true), mat(0.2, 0.9)));
      for (let i = 0; i < 6; i += 1) {
        const spike = mesh(new three.ConeGeometry(0.012, 0.04, 8), mat(0.2, 0.9));
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.06, 0.035, Math.sin(a) * 0.06);
        group.add(spike);
      }
      break;
    }
    case "ribbon": {
      const left = mesh(new three.ConeGeometry(0.03, 0.06, 4), mat(0.5));
      left.position.set(-0.03, 0, 0);
      left.rotation.set(0, 0, Math.PI / 2);
      const right = mesh(new three.ConeGeometry(0.03, 0.06, 4), mat(0.5));
      right.position.set(0.03, 0, 0);
      right.rotation.set(0, 0, -Math.PI / 2);
      const knot = mesh(new three.SphereGeometry(0.015, 10, 10), mat(0.5));
      group.add(left);
      group.add(right);
      group.add(knot);
      break;
    }
    case "backpack": {
      group.add(mesh(new three.BoxGeometry(0.18, 0.24, 0.1), mat(0.7)));
      const pocket = mesh(new three.BoxGeometry(0.14, 0.1, 0.04), mat(0.7));
      pocket.position.set(0, -0.05, 0.06);
      group.add(pocket);
      break;
    }
    case "shoulderbag": {
      group.add(mesh(new three.BoxGeometry(0.16, 0.14, 0.05), mat(0.7)));
      const strap = mesh(new three.TorusGeometry(0.14, 0.008, 6, 24, Math.PI), mat(0.7));
      strap.position.set(0, 0.05, 0);
      group.add(strap);
      break;
    }
    case "cape": {
      const cloth = mesh(new three.BoxGeometry(0.4, 0.6, 0.01), mat(0.85));
      cloth.position.set(0, -0.3, 0);
      group.add(cloth);
      break;
    }
    case "wings": {
      for (const side of [-1, 1] as const) {
        const wing = mesh(new three.SphereGeometry(0.22, 12, 8, 0, Math.PI), mat(0.6));
        wing.position.set(side * 0.18, 0, 0);
        wing.rotation.set(0, side > 0 ? 0 : Math.PI, 0);
        wing.scale.setScalar(1);
        group.add(wing);
      }
      break;
    }
    default:
      group.add(mesh(new three.BoxGeometry(0.05, 0.05, 0.05), mat()));
  }
  return group;
}

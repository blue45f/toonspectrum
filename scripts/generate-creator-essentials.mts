/** Deterministic original geometry and comic construction assets; no external downloads. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { Document, NodeIO } from "@gltf-transform/core";
import { BoxGeometry, CylinderGeometry, SphereGeometry, Matrix4, Quaternion, Vector3 } from "three";

type V3 = [number, number, number];
type Q4 = [number, number, number, number];
type Text = { ko: string; en: string };
type Part = { name: string; shape: "box" | "sphere" | "cylinder"; at: V3; size: V3; rotation?: Q4; color?: number };
const output = new URL("../apps/web/public/creator-essentials/", import.meta.url);
const source = new URL("../apps/web/src/domains/creator/studio-shell/creator-essentials/", import.meta.url);
mkdirSync(output, { recursive: true }); mkdirSync(source, { recursive: true });
const assets: { id: string; kind: string; label: Text; tags: string[]; url: string; preview: string; sha256: string; bytes: number; width: number; height: number }[] = [];
const geometry = { box: new BoxGeometry(1, 1, 1), sphere: new SphereGeometry(0.5, 8, 6), cylinder: new CylinderGeometry(0.5, 0.5, 1, 8) };
const palette: [number, number, number, number][] = [[0.28, 0.42, 0.5, 1], [0.84, 0.48, 0.25, 1], [0.54, 0.39, 0.27, 1]];
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function svg(body: string, label: string, width = 480, height = 480): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${xml(label)}</title>${body}</svg>\n`;
}
function register(id: string, kind: string, label: Text, tags: string[], data: string | Uint8Array, preview?: string, width = 480, height = 480) {
  const extension = kind.endsWith("3d") ? "glb" : "svg";
  const filename = `${id}.${extension}`;
  writeFileSync(new URL(filename, output), data);
  if (preview) writeFileSync(new URL(`${id}.preview.svg`, output), preview);
  const bytes = typeof data === "string" ? Buffer.from(data) : data;
  assets.push({ id, kind, label, tags, url: `/creator-essentials/${filename}`, preview: `/creator-essentials/${preview ? `${id}.preview.svg` : filename}`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength, width, height });
}
const part = (name: string, shape: Part["shape"], at: V3, size: V3, color = 0): Part => ({ name, shape, at, size, color });
async function model(parts: Part[], name: string): Promise<Uint8Array> {
  const document = new Document(); const buffer = document.createBuffer("embedded-geometry");
  const scene = document.createScene(name); document.getRoot().setDefaultScene(scene);
  const materials = palette.map((rgba, index) => document.createMaterial(`matte-${index}`).setBaseColorFactor(rgba).setRoughnessFactor(0.9).setMetallicFactor(0));
  const meshes = new Map<string, ReturnType<Document["createMesh"]>>();
  for (const item of parts) {
    const key = `${item.shape}-${item.color ?? 0}`;
    let mesh = meshes.get(key);
    if (!mesh) {
      const g = geometry[item.shape];
      const positions = document.createAccessor().setType("VEC3").setArray(new Float32Array(g.getAttribute("position").array)).setBuffer(buffer);
      const normals = document.createAccessor().setType("VEC3").setArray(new Float32Array(g.getAttribute("normal").array)).setBuffer(buffer);
      const indices = document.createAccessor().setType("SCALAR").setArray(new Uint16Array(g.getIndex()!.array)).setBuffer(buffer);
      const primitive = document.createPrimitive().setAttribute("POSITION", positions).setAttribute("NORMAL", normals).setIndices(indices).setMaterial(materials[item.color ?? 0]!);
      mesh = document.createMesh(key).addPrimitive(primitive); meshes.set(key, mesh);
    }
    const node = document.createNode(item.name).setMesh(mesh).setTranslation(item.at).setScale(item.size);
    if (item.rotation) node.setRotation(item.rotation);
    scene.addChild(node);
  }
  document.getRoot().setExtras({ license: "CC0-1.0", generator: "ToonSpectrum creator essentials v1", units: "meters", upAxis: "Y", rigged: false, purpose: "Editable construction reference, not a skinned character" });
  return new NodeIO().writeBinary(document);
}
function thumbnail(parts: Part[], label: string, azimuth = 0.62, elevation = 0.42): string {
  const view = new Vector3(Math.sin(azimuth), elevation, Math.cos(azimuth)).normalize();
  const right = new Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)); const up = view.clone().cross(right);
  const transformed = parts.map((item) => {
    const matrix = new Matrix4().compose(new Vector3(...item.at), new Quaternion(...(item.rotation ?? [0, 0, 0, 1] as Q4)), new Vector3(...item.size));
    const g = geometry[item.shape], position = g.getAttribute("position");
    return { item, index: g.getIndex()!, points: Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix)) };
  });
  const all = transformed.flatMap(({ points }) => points);
  const xs = all.map((p) => p.dot(right)), ys = all.map((p) => p.dot(up));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(400 / Math.max(0.01, maxX - minX), 390 / Math.max(0.01, maxY - minY));
  const project = (p: Vector3) => `${(240 + (p.dot(right) - (minX + maxX) / 2) * scale).toFixed(1)},${(435 - (p.dot(up) - minY) * scale).toFixed(1)}`;
  const triangles: { depth: number; body: string }[] = [];
  for (const { item, points, index } of transformed) for (let i = 0; i < index.count; i += 3) {
    const a = points[index.getX(i)]!, b = points[index.getX(i + 1)]!, c = points[index.getX(i + 2)]!;
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (normal.dot(view) <= 0) continue;
    const shade = 0.58 + 0.42 * Math.max(0, normal.dot(new Vector3(-0.3, 0.8, 0.5).normalize()));
    const color = palette[item.color ?? 0]!.slice(0, 3).map((v) => Math.round(v * shade * 255)).join(",");
    triangles.push({ depth: (a.dot(view) + b.dot(view) + c.dot(view)) / 3, body: `<polygon points="${project(a)} ${project(b)} ${project(c)}" fill="rgb(${color})" stroke="#243743" stroke-opacity=".17" stroke-width=".4"/>` });
  }
  return svg(`<rect width="480" height="480" fill="#f4f1eb"/><path d="M30 440H450" stroke="#cdc8be"/>${triangles.sort((a, b) => a.depth - b.depth).map((triangle) => triangle.body).join("")}`, label);
}
function bone(name: string, a: V3, b: V3, thickness: number, shape: Part["shape"] = "cylinder"): Part {
  const start = new Vector3(...a), end = new Vector3(...b); const delta = end.clone().sub(start);
  const center = start.clone().add(end).multiplyScalar(0.5);
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.clone().normalize());
  return { name, shape, at: center.toArray() as V3, size: [thickness, delta.length(), thickness], rotation: rotation.toArray() as Q4 };
}
type Joints = Record<string, V3>;
const neutral: Joints = { hip: [0, 0.95, 0], neck: [0, 1.48, 0], head: [0, 1.66, 0], ls: [-0.22,1.4,0], rs: [0.22,1.4,0], le: [-0.32,1.13,0], re: [0.32,1.13,0], lw: [-0.32,0.89,0], rw: [0.32,0.89,0], lh: [-0.11,0.92,0], rh: [0.11,0.92,0], lk: [-0.12,0.48,0], rk: [0.12,0.48,0], la: [-0.13,0.08,0], ra: [0.13,0.08,0] };
const poses: [string, Text, Joints][] = [
  ["neutral", { ko: "기본 서기", en: "Neutral standing" }, {}],
  ["weight-shift", { ko: "한쪽 체중 싣기", en: "Weight shift" }, { hip: [0.06,0.95,0], neck: [-0.05,1.48,0], head: [-0.06,1.66,0], ls: [-0.27,1.4,0], rs: [0.17,1.42,0], lk: [-0.16,0.48,0.1], la: [-0.26,0.08,0.15] }],
  ["walking", { ko: "걷기 키 포즈", en: "Walking key pose" }, { lk: [-0.12,0.5,0.22], la: [-0.12,0.08,0.4], rk: [0.12,0.54,-0.24], ra: [0.12,0.13,-0.36], le: [-0.28,1.2,-0.14], lw: [-0.3,0.98,-0.3], re: [0.28,1.23,0.12], rw: [0.3,1.06,0.25] }],
  ["running", { ko: "달리기 키 포즈", en: "Running key pose" }, { lk: [-0.12,1.08,0.34], la: [-0.12,0.72,0.55], rk: [0.12,0.5,-0.3], ra: [0.12,0.66,-0.65], le: [-0.31,1.15,0.1], lw: [-0.23,1.36,0.38], re: [0.3,1.22,-0.22], rw: [0.25,1.12,-0.46] }],
  ["seated", { ko: "앉기 참고", en: "Seated study" }, { hip: [0,0.61,0], neck: [0,1.13,0], head: [0,1.31,0], ls: [-0.22,1.05,0], rs: [0.22,1.05,0], le: [-0.31,0.8,0.12], re: [0.31,0.8,0.12], lw: [-0.2,0.65,0.36], rw: [0.2,0.65,0.36], lh: [-0.11,0.59,0], rh: [0.11,0.59,0], lk: [-0.12,0.56,0.4], rk: [0.12,0.56,0.4], la: [-0.12,0.1,0.42], ra: [0.12,0.1,0.42] }],
  ["reaching", { ko: "위로 뻗기", en: "Overhead reach" }, { le: [-0.3,1.63,0], re: [0.3,1.63,0], lw: [-0.26,1.92,0.08], rw: [0.26,1.92,0.08] }],
  ["crouching", { ko: "웅크리기 참고", en: "Crouching study" }, { hip: [0,0.5,0], neck: [0,0.95,0.22], head: [0,1.12,0.27], ls: [-0.22,0.89,0.2], rs: [0.22,0.89,0.2], le: [-0.32,0.59,0.25], re: [0.32,0.59,0.25], lw: [-0.2,0.31,0.4], rw: [0.2,0.31,0.4], lh: [-0.11,0.48,0], rh: [0.11,0.48,0], lk: [-0.26,0.37,0.32], rk: [0.26,0.37,0.32], la: [-0.23,0.08,0.02], ra: [0.23,0.08,0.02] }],
  ["arm-extension", { ko: "옆으로 팔 뻗기", en: "Side arm extension" }, { re: [0.53,1.41,0], rw: [0.86,1.48,0.08] }],
];
function mannequin(overrides: Joints): Part[] {
  const j = { ...neutral, ...overrides }; const torso = bone("rib-cage", j.hip!, j.neck!, 0.37, "sphere");
  torso.size[2] = 0.25;
  const pieces: Part[] = [torso, part("pelvis", "sphere", j.hip!, [0.31,0.24,0.23]), part("head", "sphere", j.head!, [0.24,0.31,0.24])];
  const nose = [...j.head!] as V3; nose[2] += 0.125; pieces.push(part("facing-marker", "sphere", nose, [0.05,0.055,0.045], 1));
  for (const [name,a,b,width] of [["left-upper-arm","ls","le",0.09],["left-forearm","le","lw",0.075],["right-upper-arm","rs","re",0.09],["right-forearm","re","rw",0.075],["left-thigh","lh","lk",0.13],["left-shin","lk","la",0.09],["right-thigh","rh","rk",0.13],["right-shin","rk","ra",0.09]] as const) pieces.push(bone(name, j[a]!, j[b]!, width));
  for (const key of ["ls","rs","le","re","lw","rw","lh","rh","lk","rk","la","ra"]) pieces.push(part(`joint-${key}`, "sphere", j[key]!, [0.085,0.085,0.085], 1));
  for (const key of ["la","ra"]) { const at = [...j[key]!] as V3; at[1] -= 0.02; at[2] += 0.055; pieces.push(part(`foot-${key}`,"sphere",at,[0.11,0.09,0.21])); }
  for (const key of ["lw","rw"]) { const at = [...j[key]!] as V3; at[1] -= 0.05; pieces.push(part(`hand-${key}`,"sphere",at,[0.065,0.13,0.06])); }
  return pieces;
}
const box = (name: string, at: V3, size: V3, color = 2) => part(name, "box", at, size, color);
const legs = (x: number, z: number, height: number) => [-1,1].flatMap((sx) => [-1,1].map((sz) => box(`leg-${sx}-${sz}`, [sx*x,height/2,sz*z], [0.065,height,0.065], 0)));
const props: [string,Text,Part[]][] = [
  ["desk", { ko: "작업 책상", en: "Work desk" }, [box("desktop",[0,0.75,0],[1.2,0.07,0.7]),...legs(0.53,0.28,0.72)]],
  ["chair", { ko: "등받이 의자", en: "Slatted chair" }, [box("seat",[0,0.45,0],[0.45,0.06,0.45]),...legs(0.18,0.18,0.43),...[-1,1].map((side) => box(`back-post-${side}`,[side*0.19,0.72,-0.2],[0.05,0.6,0.05])),...[0.7,0.84,0.98].map((y) => box(`back-slat-${y}`,[0,y,-0.2],[0.4,0.07,0.04]))]],
  ["bench", { ko: "공원 벤치", en: "Park bench" }, [box("seat",[0,0.45,0],[1.6,0.06,0.45]),...legs(0.66,0.17,0.43),...[-1,1].map((side) => box(`back-post-${side}`,[side*0.65,0.65,-0.2],[0.06,0.7,0.06],0)),...[0.65,0.78,0.91].map((y) => box(`back-slat-${y}`,[0,y,-0.2],[1.6,0.08,0.045]))]],
  ["bookshelf", { ko: "모듈 책장", en: "Modular bookshelf" }, [...[-1,1].map((side) => box(`side-${side}`,[side*0.52,0.9,0],[0.06,1.8,0.34])),...[0.04,0.48,0.92,1.36,1.8].map((y) => box(`shelf-${y}`,[0,y,0],[1.1,0.05,0.34])),...Array.from({length:12},(_,i) => box(`book-${i}`,[-0.38+(i%4)*0.19,0.225+(i%3)*0.015+Math.floor(i/4)*0.44,0],[0.1,0.29+(i%3)*0.03,0.24],i%3))]],
  ["streetlamp", { ko: "거리 가로등", en: "Street lamp" }, [part("pole","cylinder",[0,1.4,0],[0.09,2.8,0.09]),box("base",[0,0.05,0],[0.3,0.1,0.3],0),bone("arm",[0,2.75,0],[0.45,2.75,0],0.065),box("shade",[0.45,2.68,0],[0.32,0.12,0.24],0),box("lamp",[0.45,2.60,0],[0.23,0.045,0.17],1)]],
  ["window-wall", { ko: "창문이 있는 벽 모듈", en: "Window wall module" }, [box("left-wall",[-1.13,1.2,0],[0.74,2.4,0.15],0),box("right-wall",[1.13,1.2,0],[0.74,2.4,0.15],0),box("lower-wall",[0,0.36,0],[1.52,0.72,0.15],0),box("upper-wall",[0,2.2,0],[1.52,0.4,0.15],0),...[-1,1].map((side) => box(`frame-${side}`,[side*0.73,1.36,0],[0.07,1.3,0.2])),...[0.74,1.99].map((y) => box(`frame-${y}`,[0,y,0],[1.52,0.06,0.2])),box("mullion",[0,1.36,0],[0.045,1.25,0.18]),box("cross-bar",[0,1.36,0],[1.44,0.045,0.18])]],
  ["doorway", { ko: "출입문 틀", en: "Doorway frame" }, [box("left-post",[-0.53,1.1,0],[0.12,2.2,0.24]),box("right-post",[0.53,1.1,0],[0.12,2.2,0.24]),box("lintel",[0,2.18,0],[1.18,0.14,0.24]),box("threshold",[0,0.025,0],[1.18,0.05,0.3],0)]],
  ["stairs", { ko: "6단 계단 모듈", en: "Six-step staircase" }, Array.from({length:6},(_,i) => box(`step-${i+1}`,[0,0.08*(i+1),-0.3*i],[0.9,0.16*(i+1),0.3],0))],
];
const effects: [string,string,string,string][] = [
  ["speech-round","둥근 말풍선","Round speech balloon","dialogue 말풍선 대사"],
  ["speech-rect","둥근 사각 말풍선","Rounded rectangle balloon","dialogue 말풍선 대사"],
  ["thought-cloud","생각 구름","Thought cloud","dialogue 생각 독백"],
  ["shout-burst","외침 말풍선","Shout balloon","dialogue 외침 강조"],
  ["whisper-dashed","속삭임 말풍선","Whisper balloon","dialogue 속삭임 점선"],
  ["narration-paper","내레이션 프레임","Narration frame","frame 독백 설명"],
  ["impact-speed","집중 효과선","Radial impact lines","action 집중 속도선"],
  ["speed-horizontal","수평 속도선","Horizontal speed lines","action 속도 배경"],
  ["speed-diagonal","사선 속도선","Diagonal speed lines","action 속도 사선"],
  ["rain-diagonal","빗줄기","Rain streaks","weather 비 날씨"],
  ["snow-flakes","눈 결정","Snow crystals","weather 눈 겨울"],
  ["sparkle-cross","십자 반짝임","Cross sparkles","effect 빛 반짝임"],
  ["starfield","별 장식","Star field","effect 별 밤"],
  ["heart-scatter","하트 장식","Scattered hearts","effect 하트 감정"],
  ["cherry-petals","흩날리는 꽃잎","Drifting petals","nature 꽃 봄 벚꽃"],
  ["cloud-bank","구름 테두리","Cloud bank","weather 구름 하늘"],
  ["lightning","갈라진 번개","Forked lightning","weather 번개 긴장"],
  ["smoke-ribbons","연기 곡선","Smoke ribbons","effect 연기 곡선"],
  ["tone-light","옅은 망점","Light screentone","texture 망점 톤"],
  ["tone-gradient","그라데이션 망점","Gradient screentone","texture 망점 음영"],
  ["crosshatch","교차 해칭","Crosshatch field","texture 해칭 음영"],
  ["wave-pattern","겹물결 무늬","Overlapping wave pattern","texture 물결 패턴"],
  ["panel-four","4컷 프레임","Four-panel frame","frame 4컷 컷툰"],
  ["panel-vertical","세로 3컷 프레임","Vertical three-panel frame","frame 웹툰 세로"],
];
const marks = (count: number, draw: (i: number) => string) => Array.from({ length: count }, (_, i) => draw(i)).join("");
const location = (i: number) => `${24 + (i * 137 % 420)} ${24 + (i * 191 % 420)}`;
const polar = (x: number, y: number, radius: number, angle: number) => `${(x + radius * Math.cos(angle)).toFixed(1)} ${(y + radius * Math.sin(angle)).toFixed(1)}`;
function star(x: number, y: number, outer: number, inner: number, rays: number): string {
  return `<polygon points="${marks(rays * 2, (i) => `${polar(x,y,i%2 ? inner : outer,i*Math.PI/rays-Math.PI/2)} `)}"/>`;
}
function effectDrawing(id: string): string {
  switch (id) {
    case "speech-round": return '<path d="M165 320C45 306 40 122 182 96C390 42 462 290 308 328L220 330L158 389L181 326Z" fill="white"/>';
    case "speech-rect": return '<path d="M82 90H398Q428 90 428 120V305Q428 335 398 335H234L172 393L186 335H82Q52 335 52 305V120Q52 90 82 90Z" fill="white"/>';
    case "thought-cloud": return '<path d="M105 291C24 284 34 173 98 169C57 96 149 51 199 95C233 23 340 52 341 111C437 80 477 201 414 238C457 309 339 365 290 319C230 380 141 351 145 308C125 313 115 305 105 291Z" fill="white"/><circle cx="113" cy="367" r="20" fill="white"/><circle cx="84" cy="409" r="10" fill="white"/>';
    case "shout-burst": return `<g fill="white">${star(240,235,193,145,15)}</g>`;
    case "whisper-dashed": return '<g stroke-dasharray="10 7" fill="white"><ellipse cx="240" cy="218" rx="180" ry="135"/><path d="M160 345L136 389L206 348"/></g>';
    case "narration-paper": return '<path d="M55 110H385L425 150V345H55Z" fill="white"/><path d="M385 110V150H425" fill="#e7e2d9"/>';
    case "impact-speed": return marks(36, (i) => `<path d="M${polar(240,240,150+(i%5)*8,i*Math.PI/18)}L${polar(240,240,340,i*Math.PI/18)}" stroke-width="${1+i%5}"/>`);
    case "speed-horizontal": return marks(30, (i) => `<path d="M${16+i*29%170} ${24+i*14}H${360+i*17%110}" stroke-width="${1+i%3}"/>`);
    case "speed-diagonal": return `<g transform="rotate(-28 240 240)">${effectDrawing("speed-horizontal")}</g>`;
    case "rain-diagonal": return marks(56, (i) => `<path transform="translate(${location(i)})" d="M0 0l-12 32" stroke-width="${1+i%2}" opacity=".65"/>`);
    case "snow-flakes": return marks(17, (i) => `<g transform="translate(${location(i)}) scale(${0.5+i%3*0.2})">${marks(3,(n) => `<path transform="rotate(${n*60})" d="M0-22V22M0-13L-6-18M0-13L6-18M0 13L-6 18M0 13L6 18" stroke-width="2"/>`)}</g>`);
    case "sparkle-cross": return marks(16, (i) => `<g transform="translate(${location(i)})" fill="#243743">${star(0,0,13+i%4*5,3,4)}</g>`);
    case "starfield": return marks(19, (i) => `<g transform="translate(${location(i)}) rotate(${i*17})" fill="white">${star(0,0,12+i%3*5,5+i%3*2,5)}</g>`);
    case "heart-scatter": return marks(15, (i) => `<path transform="translate(${location(i)}) scale(${0.5+i%3*0.2})" d="M0 18C-49-12-15-40 0-18C15-40 49-12 0 18Z" fill="#f0b7bd" stroke-width="2"/>`);
    case "cherry-petals": return marks(26, (i) => `<path transform="translate(${location(i)}) rotate(${i*47})" d="M0 18C-23-4-13-23-3-18L0-13L3-18C13-23 23-4 0 18Z" fill="#f2ccd7" stroke-width="1.5"/>`);
    case "cloud-bank": return '<path d="M0 372C22 300 106 303 115 346C125 263 244 258 266 338C310 264 416 297 401 354C445 322 476 345 480 382V480H0Z" fill="white"/>';
    case "lightning": return '<g fill="#f1d266"><path d="M283 28L135 246L231 225L158 452L360 175L260 191Z"/><path d="M177 180L49 256L137 248L97 357L203 230Z"/></g>';
    case "smoke-ribbons": return marks(5, (i) => `<path d="M${130+i*40} 450C${40+i*60} 330 ${330-i*30} 330 ${220+i*19} 226S${70+i*40} 101 ${228+i*27} 25" stroke-width="${8-i}" opacity="${0.2+i*0.1}"/>`);
    case "tone-light": return marks(256, (i) => `<circle cx="${15+i%16*30}" cy="${15+Math.floor(i/16)*30}" r="3" fill="#243743" stroke="none"/>`);
    case "tone-gradient": return marks(256, (i) => `<circle cx="${15+i%16*30}" cy="${15+Math.floor(i/16)*30}" r="${(1+Math.floor(i/16)*0.6).toFixed(1)}" fill="#243743" stroke="none"/>`);
    case "crosshatch": return marks(33,(i) => `<path d="M${-480+i*30} 0l480 480M${i*30} 0l-480 480" stroke-width="1.5"/>`);
    case "wave-pattern": return marks(64,(i) => `<g transform="translate(${i%8*72+(Math.floor(i/8)%2)*36-48} ${Math.floor(i/8)*56+20})">${marks(4,(n) => `<path d="M${-(n+1)*9} 0a${(n+1)*9} ${(n+1)*9} 0 0 1 ${(n+1)*18} 0" stroke-width="2"/>`)}</g>`);
    case "panel-four": return marks(4,(i) => `<rect x="${24+i%2*228}" y="${24+Math.floor(i/2)*228}" width="204" height="204" rx="4" fill="white"/>`);
    case "panel-vertical": return marks(3,(i) => `<rect x="65" y="${24+i*151}" width="350" height="129" rx="3" fill="white"/>`);
    default: throw new Error(`Unknown original effect: ${id}`);
  }
}
for (const [id,ko,en,tags] of effects) register(id,"effect-2d",{ko,en},tags.split(" "),svg(`<g fill="none" stroke="#243743" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${effectDrawing(id)}</g>`,ko));
for (const [id,label,overrides] of poses) {
  const parts = mannequin(overrides); const poster = thumbnail(parts,label.ko);
  register(`pose-${id}-3d`,"pose-3d",label,["character","pose","mannequin","캐릭터","포즈","데생"],await model(parts,label.en),poster);
  const views = [0,Math.PI/2,0.62].map((angle,index) => thumbnail(parts,label.ko,angle,index<2 ? 0 : 0.25).replace("<svg ",`<svg x="${index*480}" y="36" `)).join("");
  const captions = ["FRONT","SIDE","THREE-QUARTER"].map((caption,index) => `<text x="${240+index*480}" y="536" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#243743">${caption}</text>`).join("");
  const sheet = svg(`<rect width="1440" height="550" fill="#f4f1eb"/><text x="24" y="25" font-family="sans-serif" font-size="18" fill="#243743">${xml(label.ko)} · ${xml(label.en)}</text>${views}${captions}`,label.ko,1440,550);
  register(`pose-${id}-2d`,"pose-2d",label,["character","pose","turnaround","캐릭터","포즈","3면도"],sheet,poster,1440,550);
}
for (const [id,label,parts] of props) register(`prop-${id}`,"prop-3d",label,["background","prop","model","배경","소품","모델"],await model(parts,label.en),thumbnail(parts,label.ko));
const manifest = { version: 1, license: "CC0-1.0", generator: "scripts/generate-creator-essentials.mts", purpose: "Original construction references; no rigging, animation or automated image reconstruction", assets };
const json = `${JSON.stringify(manifest,null,2)}\n`;
writeFileSync(new URL("manifest.json",output),json);
writeFileSync(new URL("creator-essentials.generated.json",source),json);
writeFileSync(new URL("LICENSE.txt",output),"SPDX-License-Identifier: CC0-1.0\n\nTo the extent possible under law, the authors of these original generated construction assets waive copyright and related rights under CC0 1.0 Universal.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n\nThis dedication applies only to the generated SVG and GLB assets in this folder, not to the generator, application code, dependencies, or any third-party content. No external artwork or character designs were used.\n\nModels are construction references with named mesh components, not rigged/skinned characters, medical anatomy, automatic reconstruction, or safety-certified environments.\n");
for (const g of Object.values(geometry)) g.dispose();
console.log(JSON.stringify({ assets: assets.length, svg: assets.filter((a)=>a.url.endsWith(".svg")).length, glb: assets.filter((a)=>a.url.endsWith(".glb")).length, totalAssetBytes: assets.reduce((sum,a)=>sum+a.bytes,0) }));

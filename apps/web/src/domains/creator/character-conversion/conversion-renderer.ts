import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "../bg3d/studio-bg3d-glb-validation";
import { sha256HexPortable } from "../studio-sha256";
import { checkConversionAbort, pngBytes, rasterCanvas } from "./conversion-browser";
import { CHARACTER_VIEWS, type CharacterRender, type CharacterView } from "./conversion-contract";
import { deriveCharacterPasses } from "./conversion-raster";

export interface CharacterCameraOptions { yaw: number; pitch: number; animationTime: number }
export function characterCameraPosition(view: CharacterView, radius: number, yaw = 0, pitch = 0): THREE.Vector3 {
  if (!CHARACTER_VIEWS.includes(view) || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(yaw) || Math.abs(yaw) > 180 || !Number.isFinite(pitch) || Math.abs(pitch) > 60) throw new Error("카메라 설정이 올바르지 않습니다.");
  const angle = (({ front: 0, left: -90, back: 180, right: 90 }[view]) + yaw) * Math.PI / 180;
  const tilt = pitch * Math.PI / 180;
  return new THREE.Vector3(Math.sin(angle) * Math.cos(tilt), Math.sin(tilt), Math.cos(angle) * Math.cos(tilt)).multiplyScalar(radius * 3);
}
function materialList(mesh: THREE.Mesh): THREE.Material[] { return Array.isArray(mesh.material) ? mesh.material : [mesh.material]; }
function passMaterial(original: THREE.Material, kind: "normal" | "depth"): THREE.Material {
  const input = original as THREE.MeshStandardMaterial;
  const coverage = { map: input.map ?? null, alphaMap: input.alphaMap ?? null, alphaTest: input.alphaTest, side: input.side, opacity: input.opacity, transparent: input.transparent, vertexColors: input.vertexColors, depthWrite: input.depthWrite, depthTest: input.depthTest };
  if (kind === "depth") return new THREE.MeshDepthMaterial({ ...coverage, depthPacking: THREE.BasicDepthPacking });
  const material = new THREE.MeshStandardMaterial({ ...coverage, normalMap: input.normalMap ?? null, normalScale: input.normalScale?.clone() ?? new THREE.Vector2(1, 1), flatShading: input.flatShading ?? false });
  material.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight = normalize(normal) * 0.5 + 0.5;\n#include <opaque_fragment>"); };
  material.customProgramCacheKey = () => "character-camera-normal-v1";
  return material;
}
export async function renderCharacterGlb(file: File, size: number, views: readonly CharacterView[], options: CharacterCameraOptions, signal: AbortSignal, onProgress: (view: CharacterView) => void): Promise<{ renders: CharacterRender[]; sha256: string }> {
  if (file.size < 20 || file.size > 64 * 1024 * 1024 || ![512, 768, 1024].includes(size) || views.length < 1 || views.length > 4 || new Set(views).size !== views.length) throw new Error("64MiB 이하 GLB와 최대 4개 시점을 사용해 주세요.");
  if (!Number.isFinite(options.animationTime) || options.animationTime < 0 || options.animationTime > 60) throw new Error("애니메이션 시간은 0~60초여야 합니다.");
  for (const view of views) characterCameraPosition(view, 1, options.yaw, options.pitch);
  checkConversionAbort(signal);
  const bytes = new Uint8Array(await file.arrayBuffer()); const sha256 = sha256HexPortable(bytes);
  const validated = await validateStudioBg3dGlb(bytes, { declared: { byteSize: bytes.length, sha256 }, cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 }, profile: "mobile", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, supportedRequiredExtensions: ["KHR_materials_unlit", "KHR_texture_transform", "KHR_mesh_quantization", "KHR_materials_emissive_strength"] });
  if (!validated.ok) throw new Error(validated.message);
  if (validated.metrics.estimatedDecodedImageBytes > 128 * 1024 * 1024 || validated.usesBasisTextures) throw new Error("텍스처를 PNG·JPEG로 내보내고, 디코딩 후 총 128MiB 이하로 줄여 주세요.");
  checkConversionAbort(signal);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => { if (!url.startsWith("blob:")) throw new Error("외부 3D 리소스는 불러오지 않습니다."); return url; });
  const gltf = await new GLTFLoader(manager).parseAsync(new Uint8Array(validated.verifiedBytes).buffer, "");
  const root = gltf.scene; const allocated = new Set<THREE.Material>();
  const meshes: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; depth: THREE.Material[]; normal: THREE.Material[] }[] = [];
  let renderer: THREE.WebGLRenderer | undefined; let mixer: THREE.AnimationMixer | undefined;
  try {
    checkConversionAbort(signal);
    root.traverse((object) => {
      if (object instanceof THREE.Light) object.visible = false;
      if (!(object instanceof THREE.Mesh)) return;
      const depth = materialList(object).map((material) => passMaterial(material, "depth"));
      const normal = materialList(object).map((material) => passMaterial(material, "normal"));
      [...depth, ...normal].forEach((material) => allocated.add(material));
      meshes.push({ mesh: object, original: object.material, depth, normal });
    });
    if (!meshes.length) throw new Error("렌더링할 메시가 없는 GLB입니다.");
    if (gltf.animations[0] && options.animationTime > 0) {
      mixer = new THREE.AnimationMixer(root); mixer.clipAction(gltf.animations[0]).play(); mixer.setTime(options.animationTime);
    }
    root.updateMatrixWorld(true);
    root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) object.skeleton.update(); });
    const sphere = new THREE.Box3().setFromObject(root, true).getBoundingSphere(new THREE.Sphere());
    const radius = sphere.radius;
    if (!Number.isFinite(radius) || radius <= 0 || !sphere.center.toArray().every(Number.isFinite)) throw new Error("유효한 3D 모델 크기를 확인하지 못했습니다.");
    const pivot = new THREE.Group(); pivot.position.copy(sphere.center).negate(); pivot.add(root);
    const scene = new THREE.Scene(); scene.add(pivot, new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-3, 1, -2); scene.add(fill);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    const extent = radius / 0.82;
    const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, radius * 1.8, radius * 4.2);
    const results: CharacterRender[] = [];
    for (const view of views) {
      checkConversionAbort(signal); onProgress(view);
      camera.position.copy(characterCameraPosition(view, radius, options.yaw, options.pitch)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const captures: Uint8ClampedArray[] = [];
      for (const pass of ["beauty", "depth", "normal"] as const) {
        for (const item of meshes) item.mesh.material = pass === "beauty" ? item.original : Array.isArray(item.original) ? item[pass] : item[pass][0];
        renderer.outputColorSpace = pass === "beauty" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        renderer.render(scene, camera);
        const raster = rasterCanvas(size, size);
        raster.context.drawImage(renderer.domElement, 0, 0);
        captures.push(raster.context.getImageData(0, 0, size, size).data); raster.canvas.width = 0;
      }
      const [beauty, depth, normal] = captures;
      for (let at = 0; at < beauty.length; at += 4) { depth[at + 3] = 255; normal[at + 3] = beauty[at + 3]; }
      const derived = deriveCharacterPasses(beauty, depth, normal, size, size);
      const passes = {} as CharacterRender["passes"];
      for (const [name, pixels] of Object.entries({ beauty, depth, normal, ...derived })) {
        checkConversionAbort(signal);
        const raster = rasterCanvas(size, size, pixels);
        try { passes[name as keyof typeof passes] = await pngBytes(raster.canvas); } finally { raster.canvas.width = 0; }
      }
      results.push({ view, passes });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    checkConversionAbort(signal); return { renders: results, sha256 };
  } finally {
    meshes.forEach((item) => { item.mesh.material = item.original; });
    mixer?.stopAllAction(); mixer?.uncacheRoot(root);
    const textures = new Set<THREE.Texture>(); const geometries = new Set<THREE.BufferGeometry>(); const skeletons = new Set<THREE.Skeleton>();
    for (const scene of gltf.scenes) scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry); materialList(object).forEach((material) => allocated.add(material));
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    });
    for (const material of allocated) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); }
    for (const texture of textures) { const image: unknown = texture.source.data; if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close(); texture.dispose(); }
    geometries.forEach((geometry) => geometry.dispose()); skeletons.forEach((skeleton) => skeleton.dispose());
    renderer?.dispose(); renderer?.forceContextLoss();
  }
}

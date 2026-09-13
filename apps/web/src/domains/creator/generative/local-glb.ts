import { Box3, LoadingManager, Mesh, Vector3, type Object3D, type Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
/** Only self-contained GLB. Imported artwork never causes outbound texture/buffer requests. */
export function validateLocalGlb(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 28 || buffer.byteLength > 30 * 1024 * 1024) throw new Error("GLB는 30MB 이하여야 해요.");
  const view = new DataView(buffer);
  if (view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== buffer.byteLength || view.getUint32(16,true) !== 0x4e4f534a) throw new Error("올바른 GLB 2.0 파일이 아니에요.");
  const length = view.getUint32(12,true); if (length > 4 * 1024 * 1024 || length + 20 > buffer.byteLength) throw new Error("GLB 메타데이터가 너무 크거나 손상됐어요.");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  if (!json || !Array.isArray(json.meshes) || json.meshes.length > 256) throw new Error("지원하지 않는 GLB 구조예요.");
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (item.uri !== undefined && (typeof item.uri !== "string" || !/^data:(?:application\/octet-stream|image\/(?:png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/u.test(item.uri))) throw new Error("외부 파일이나 SVG를 참조하는 GLB는 사용할 수 없어요. 텍스처를 포함한 GLB로 내보내 주세요.");
  }
  if ((json.accessors ?? []).some((accessor: { count?: unknown }) => typeof accessor.count !== "number" || accessor.count > 3_000_000)) throw new Error("모델의 정점 데이터가 너무 커요.");
  if ((json.extensionsRequired ?? []).some((value: string) => ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"].includes(value))) throw new Error("이 화면에서는 별도 디코더가 없는 비압축 GLB를 사용해 주세요.");
}
export function disposeModel(model: Object3D): void {
  const textures = new Set<Texture>();
  model.traverse(object => { if (!(object instanceof Mesh)) return; object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
      material.dispose();
    }
  });
  textures.forEach(texture => texture.dispose());
}
export async function loadLocalGlb(buffer: ArrayBuffer, signal: AbortSignal): Promise<Object3D> {
  validateLocalGlb(buffer); signal.throwIfAborted();
  const manager = new LoadingManager();
  manager.setURLModifier(url => { if (!url.startsWith("data:") && !url.startsWith("blob:")) throw new Error("External model resource blocked"); return url; });
  const result = await new GLTFLoader(manager).parseAsync(buffer, "");
  if (signal.aborted) { disposeModel(result.scene); signal.throwIfAborted(); }
  const box = new Box3().setFromObject(result.scene); const size = box.getSize(new Vector3());
  const span = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(span) || span <= 0 || span > 1e8) { disposeModel(result.scene); throw new Error("모델의 크기를 확인하지 못했어요."); }
  const center = box.getCenter(new Vector3()); result.scene.position.sub(center); result.scene.scale.setScalar(2 / span); result.scene.position.multiplyScalar(2/span);
  return result.scene;
}

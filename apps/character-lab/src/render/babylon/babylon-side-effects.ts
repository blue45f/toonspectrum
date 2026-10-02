/**
 * Babylon side-effect import 단일 지점. 이 파일 밖에서는 `import "…"` 형태의 side-effect import를 쓰지 않는다.
 * 각 항목은 "왜 필요한지"를 적는다(없으면 런타임에서 메서드 부재·셰이더 include 누락 오류가 난다).
 */
// ---- 엔진 확장(WebGL2 Engine): RTT 생성·readPixels·raw/cube 텍스처·알파 블렌딩·타이머 쿼리·MRT
import "@babylonjs/core/Engines/Extensions/engine.alpha.js";
import "@babylonjs/core/Engines/Extensions/engine.cubeTexture.js";
import "@babylonjs/core/Engines/Extensions/engine.multiRender.js";
import "@babylonjs/core/Engines/Extensions/engine.query.js";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture.js";
import "@babylonjs/core/Engines/Extensions/engine.readTexture.js";
import "@babylonjs/core/Engines/Extensions/engine.renderTarget.js";
import "@babylonjs/core/Engines/Extensions/engine.renderTargetCube.js";
// ---- 엔진 확장(WebGPUEngine): 동일 기능 + compute(IBL 프리필터·향후 compute 커널)
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.alpha.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.cubeTexture.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.query.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.readTexture.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.renderTarget.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.renderTargetCube.js";
// ---- 장면 컴포넌트: PrePass(SSS)·GBuffer·DepthRenderer(F32 깊이 패스)·SubSurface·Outline/Edges·그림자·후처리 파이프라인 매니저
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import "@babylonjs/core/Rendering/edgesRenderer.js";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent.js";
import "@babylonjs/core/Rendering/subSurfaceSceneComponent.js";
// ---- 메시·재질·텍스처: instancedMesh(glTF 로더 요구)·RTT·PBR(+데칼 페인트: mesh.decalMap 프로퍼티 + 재질 플러그인)·Standard·HDR 프리필터·환경맵 SH
import "@babylonjs/core/Materials/PBR/pbrMaterial.decalMap.js";
import "@babylonjs/core/Meshes/abstractMesh.decalMap.js";
import "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import "@babylonjs/core/Materials/standardMaterial.js";
import "@babylonjs/core/Materials/Textures/baseTexture.polynomial.js";
import "@babylonjs/core/Materials/Textures/Filtering/hdrFiltering.js";
import "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
// ---- 피킹·애니메이션: createPickingRay/pickWithRay·glTF 애니메이션 그룹 처리
import "@babylonjs/core/Animations/animatable.js";
import "@babylonjs/core/Collisions/pickingInfo.js";
import "@babylonjs/core/Culling/ray.js";
// ---- 커스텀 ShaderMaterial include(GLSL): 스키닝·morph·instances
import "@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration.js";
import "@babylonjs/core/Shaders/ShadersInclude/bonesVertex.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js";
import "@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertex.js";
import "@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexDeclaration.js";
import "@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobal.js";
import "@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobalDeclaration.js";
// ---- 커스텀 ShaderMaterial include(WGSL): 같은 집합 + Scene/Mesh UBO
import "@babylonjs/core/ShadersWGSL/ShadersInclude/bonesDeclaration.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/bonesVertex.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/instancesDeclaration.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/instancesVertex.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/meshUboDeclaration.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/morphTargetsVertex.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/morphTargetsVertexDeclaration.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/morphTargetsVertexGlobal.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/morphTargetsVertexGlobalDeclaration.js";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/sceneUboDeclaration.js";
// ---- glTF 2.0 로더 등록(.glb SceneLoader 플러그인 + GLTF2 로더 팩토리). KHR 확장은 package-loader가 명시 등록한다.
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";

/** side-effect 모듈이 적용됐음을 다른 모듈이 import 바인딩으로 보장받기 위한 표식 */
export const BABYLON_SIDE_EFFECTS_LOADED = true as const;

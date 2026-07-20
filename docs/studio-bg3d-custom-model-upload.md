# 3D 배경 커스텀 모델 업로드 — 통합 설계 문서 (후속 배선 패스용)

> 현재 상태: 후속 배선과 다중 형식 정규화가 반영되었다. UI는 GLB/glTF/OBJ/FBX/DAE/STL/PLY/3DS와
> glTF의 BIN/텍스처, OBJ의 MTL/텍스처를 함께 선택해 자체 포함 GLB로 변환한다. 아래의 v1 설계
> 절차는 구현 배경을 보존하되, 형식 지원 현황은 이 현재 상태와 §14를 기준으로 읽는다.

이번 패스는 **순수 로직 + 저장소 레이어만** 새 파일로 구현했다(기존 파일은 한 글자도 건드리지
않음). `StudioBackground3D.tsx`에 실제로 배선(wiring)하는 작업은 별도 통합 패스가 담당한다.
이 문서는 그 통합 패스가 그대로 따라 할 수 있는 지점별 지시서다.

## 0. 이번 패스에서 만든 것

| 파일 | 역할 |
| --- | --- |
| `src/domains/creator/bg3d-model-library.ts` | 업로드된 3D 배경 모델의 IndexedDB CRUD. `vrm-library.ts`와 구조 동일(스토어 2개: `models`/`thumbnails`), DB명만 `toonspectrum-studio-bg3d-model-library`로 분리. |
| `src/domains/creator/studio-background-3d-model.ts` | `BgCustomModelInstance` 타입 + 스폰/복제/클론 헬퍼 + 오토핏 스케일 계산 + blob 로더(`loadBg3dCustomModelFromBlob`) + 씬 해시 직렬화 확장(`encodeBg3dSceneWithModelsHash`/`parseBg3dSceneWithModelsFromDataUrl`). `studio-background-3d-primitives.ts`는 무변경. |
| `*.test.ts` (위 두 파일) | 순수 함수만 유닛 테스트(이 레포의 `vitest.config.ts`가 `environment: "node"`라 `indexedDB`/DOM이 없다 — `vrm-library.test.ts`와 동일한 스코프 제약). blob 로더 자체(`loadBg3dCustomModelFromBlob`)는 `URL.createObjectURL`+three.js 로더의 실제 네트워크/파싱 경로라 여기서 테스트하지 않는다 — 통합 패스에서 브라우저로 수동 검증(`/verify` 스킬 등) 필요. |

`StudioPage.tsx`와 `studio-background-3d-primitives.ts`는 **변경 불필요**(§13 참고).

## 1. 왜 `BgPrimitive`의 새 `kind`가 아니라 별도 타입인가

`BgPrimitive`는 `color`(셰이딩 미리보기용 hex)와 `kind`(어떤 지오메트리를 `makeGeometry`로 만들지)
를 갖는다 — 둘 다 커스텀 업로드 모델에는 의미가 없다(모델은 자체 머티리얼/텍스처를 가져오고,
MTL이 없는 레거시 단일-Blob `.obj`만 무광 중립색 폴백을 사용한다 — §14 참고). 대신 `BgCustomModelInstance`는
`modelId`(`bg3d-model-library.ts` IndexedDB 레코드 참조)만 갖고 `position`/`rotation`/`scale`은
`BgPrimitive`와 동일 계약(Euler XYZ 라디안)을 따른다. 씬 상태는 이제 두 개의 배열
(`primitives: BgPrimitive[]`, `customModels: BgCustomModelInstance[]`)로 구성된다.

## 2. `StudioBackground3D.tsx` — import 추가

기존 import 블록(현재 1~56행, `studio-background-3d-composites`/`studio-background-3d-primitives`/
`studio-background-3d-sky`를 가져오는 곳) 바로 아래에 추가:

```ts
import {
  deleteStoredBg3dModel,
  getStoredBg3dModel,
  listBg3dModelLibraryEntries,
  saveUploadedBg3dModel,
  type Bg3dModelLibraryEntry,
} from "./bg3d-model-library";
import {
  applyBg3dFallbackMaterial,
  cloneBgCustomModelInstances,
  computeAutoFitScale,
  createBgCustomModelInstance,
  duplicateBgCustomModelInstance,
  encodeBg3dSceneWithModelsHash,
  loadBg3dCustomModelFromBlob,
  measureBg3dObjectSize,
  parseBg3dSceneWithModelsFromDataUrl,
  type BgCustomModelInstance,
} from "./studio-background-3d-model";
```

`lucide-react` import 목록(4~33행)에 업로드 버튼용 아이콘 하나 추가 — 예: `Upload`
(다른 패널의 "가져오기" 버튼들이 쓰는 아이콘과 통일하려면 `StudioBrushLibraryPanel.tsx`의
import 확인). 탭 아이콘은 `Package`나 `Boxes`계열 대신 구분되는 것(`PackageOpen` 등)을 권장.

## 3. 타입/탭 확장

```ts
type BgPanelTab = "shapes" | "layers" | "view" | "models"; // 66행, "models" 추가
```

`BG_PANEL_TABS`(80~84행) 배열 끝에:

```ts
{ id: "models", label: "모델", icon: PackageOpen, hint: "업로드 · 배치 · 삭제" },
```

## 4. 상태 추가

기존 `useState` 뭉치(320~334행) 옆에:

```ts
const [customModels, setCustomModels] = useState<BgCustomModelInstance[]>([]);
const [modelLibrary, setModelLibrary] = useState<Bg3dModelLibraryEntry[]>([]);
const [modelLibraryStatus, setModelLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
const [isUploadingModel, setIsUploadingModel] = useState(false);
const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
```

`useRef` 뭉치(336~340행) 옆에:

```ts
// modelId -> 로드+오토핏 스케일까지 끝난 원본 루트(clone()의 소스). 같은 모델을 두 번째
// 배치할 때부터는 blob을 다시 파싱하지 않고 이 캐시에서 clone()만 한다.
const modelRootCacheRef = useRef<Map<string, THREE.Object3D>>(new Map());
const fileInputRef = useRef<HTMLInputElement>(null);
```

`primitiveObjectsRef`(338행, `Map<string, THREE.Group>`)는 **그대로 재사용**한다 — 별도의
"customModelObjectsRef"를 새로 만들지 않는다. `createPrimitive`/`createBgCustomModelInstance`가
만드는 id는 각각 `bg3d-.../bg3dmodel-...` 접두사라 같은 Map에 섞여도 충돌하지 않고, `selectedId`
(`string | null`, 321행)도 그대로 공유한다. 이 덕분에 §6의 `TransformControls` JSX(593~610행)는
**한 글자도 안 바꿔도 된다** — `primitiveObjectsRef.current.get(selectedId)`가 선택된 것이
도형이든 커스텀 모델 인스턴스든 항상 올바른 three.js 오브젝트를 반환하기 때문이다.

## 5. 라이브러리 로딩 + 씬 복원 effect

라이브러리 목록은 모달이 열릴 때 한 번 읽어온다(VRM 포저의 `listVrmLibraryEntries()` 패턴과 동일).
새 effect 추가:

```ts
useEffect(() => {
  if (!open) return;
  setModelLibraryStatus("loading");
  listBg3dModelLibraryEntries()
    .then((entries) => {
      setModelLibrary(entries);
      setModelLibraryStatus("ready");
    })
    .catch(() => setModelLibraryStatus("error"));
}, [open]);
```

기존 씬 복원 effect(347~353행, `parseBg3dSceneFromDataUrl` 사용)를 **교체**:

```ts
useEffect(() => {
  if (!open) return;
  const parsed = parseBg3dSceneWithModelsFromDataUrl(initialDataUrl);
  if (parsed && (parsed.primitives.length > 0 || parsed.customModels.length > 0)) {
    setPrimitives(parsed.primitives);
    setCustomModels(parsed.customModels);
  }
}, [open, initialDataUrl]);
```

`parseBg3dSceneWithModelsFromDataUrl`은 `customModels` 필드가 없는 레거시 해시(도형만 있던
과거 캡처)도 `customModels: []`로 파싱하므로 하위 호환은 자동으로 유지된다. 다만 복원된
`customModels`의 각 `modelId`가 가리키는 레코드가 IndexedDB에 아직 있는지는 보장되지 않는다
(사용자가 그 사이 라이브러리에서 삭제했을 수 있음) — §6의 `addCustomModelToScene`과 동일한
"모델을 못 찾으면 조용히 스킵 + `error` 배너" 처리를 복원 시점에도 적용해야 한다(예: 복원 직후
`customModels`를 순회하며 `getStoredBg3dModel`이 `null`을 반환하는 항목은 걸러내는 별도
effect, 또는 §6 헬퍼를 재사용하는 `hydrateCustomModelCaches(parsed.customModels)`).

## 6. 모델 추가/업로드/삭제 핸들러

```ts
async function ensureModelRootCached(modelId: string): Promise<THREE.Object3D | null> {
  const cached = modelRootCacheRef.current.get(modelId);
  if (cached) return cached;

  const record = await getStoredBg3dModel(modelId);
  if (!record) return null;

  const root = await loadBg3dCustomModelFromBlob(record.blob, record.format);
  const autoFit = computeAutoFitScale(measureBg3dObjectSize(root));
  root.scale.setScalar(autoFit); // 캐시에 이미 오토핏이 반영된 "기준 크기"로 저장
  modelRootCacheRef.current.set(modelId, root);
  return root;
}

async function addCustomModelToScene(modelId: string) {
  try {
    const root = await ensureModelRootCached(modelId);
    if (!root) {
      setError("저장된 3D 모델을 찾지 못했습니다.");
      return;
    }
    // root.scale에 이미 오토핏이 반영돼 있으므로 인스턴스 자체의 scale은 [1,1,1]에서 시작한다
    // (오토핏 배율을 인스턴스 scale에 다시 곱하면 이중 적용된다 — 인스턴스 scale은 "오토핏 위에
    // 사용자가 추가로 조정한 배율"만 의미하게 한다).
    const next = createBgCustomModelInstance(modelId, customModels.length);
    setCustomModels((prev) => [...prev, next]);
    setSelectedId(next.id);
  } catch (caughtError: unknown) {
    setError(caughtError instanceof Error ? caughtError.message : "3D 모델을 불러오지 못했습니다.");
  }
}

async function handleUploadModelFiles(event: ChangeEvent<HTMLInputElement>) {
  const files = Array.from(event.currentTarget.files ?? []);
  event.currentTarget.value = ""; // StudioVrmPoser.tsx handleFileChange와 동일 — 같은 파일 재선택 허용
  if (files.length === 0) return;

  setIsUploadingModel(true);
  setError(null);
  try {
    const saved = await Promise.all(files.map((file) => saveUploadedBg3dModel(file)));
    setModelLibrary(await listBg3dModelLibraryEntries());
    if (saved[0]) await addCustomModelToScene(saved[0].id);
  } catch (caughtError: unknown) {
    setError(caughtError instanceof Error ? caughtError.message : "3D 모델을 저장하지 못했습니다.");
  } finally {
    setIsUploadingModel(false);
  }
}

async function handleDeleteModelFromLibrary(id: string) {
  // 씬에 이 모델의 인스턴스가 남아있으면 참조가 끊긴다(라운드트립 시 modelId가 404) — 삭제 전
  // 사용자에게 알리거나(window.confirm 등), 최소한 씬에서도 함께 제거한다. 후자를 권장:
  const inUse = customModels.some((inst) => inst.modelId === id);
  if (inUse) {
    setCustomModels((prev) => prev.filter((inst) => inst.modelId !== id));
  }
  setDeletingModelId(id);
  try {
    await deleteStoredBg3dModel(id);
    setModelLibrary(await listBg3dModelLibraryEntries());
  } catch (caughtError: unknown) {
    setError(caughtError instanceof Error ? caughtError.message : "3D 모델을 삭제하지 못했습니다.");
  } finally {
    setDeletingModelId(null);
  }
}
```

## 7. `BgCustomModelMesh` 컴포넌트 + Canvas JSX 배선

`BgPrimitiveMesh`(219~276행) 바로 아래에 병렬 컴포넌트를 추가한다. **`.clone()`의 three.js
정확성 함정**(컴포넌트 안 주석 참고)을 지키는 것이 핵심이다:

```ts
interface BgCustomModelMeshProps {
  instance: BgCustomModelInstance;
  cachedRoot: THREE.Object3D | undefined;
  onSelect: (id: string) => void;
  registerRef: (id: string, obj: THREE.Group | null) => void;
}

function BgCustomModelMesh({ instance, cachedRoot, onSelect, registerRef }: BgCustomModelMeshProps) {
  // cachedRoot(모델 하나당 1개, modelRootCacheRef가 소유)를 인스턴스마다 clone()한다. clone()은
  // 씬그래프(트랜스폼 계층)는 깊은 복제하지만 geometry/material은 얕게(참조로) 공유한다 — 즉
  // 같은 모델을 3개 배치하면 3개의 Object3D가 생기되 그 안의 BufferGeometry/Material 인스턴스는
  // 단 1세트를 공유한다. 따라서 이 컴포넌트의 언마운트(unmount)에서 geometry/material을
  // dispose()하면 안 된다 — 그 순간 씬에 남아있는 다른 두 인스턴스가 참조하는 GPU 리소스까지
  // 함께 파괴돼 렌더링이 깨진다(BgPrimitiveMesh의 useEffect cleanup 패턴을 그대로 복붙하면 안
  // 되는 지점). 공유 리소스의 dispose는 오직 §8(모달 닫힘)에서 캐시 전체를 한 번에 처리한다.
  const cloned = useMemo(() => cachedRoot?.clone(), [cachedRoot]);

  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    registerRef(instance.id, groupRef.current);
    return () => registerRef(instance.id, null);
  }, [instance.id, registerRef]);

  if (!cloned) return null;

  return (
    <group
      ref={groupRef}
      position={instance.position}
      rotation={instance.rotation}
      scale={instance.scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(instance.id);
      }}
    >
      <primitive object={cloned} />
    </group>
  );
}
```

Canvas JSX(584~592행, `{primitives.map(...)}` 바로 아래)에 추가:

```tsx
{customModels.map((inst) => (
  <BgCustomModelMesh
    key={inst.id}
    instance={inst}
    cachedRoot={modelRootCacheRef.current.get(inst.modelId)}
    onSelect={setSelectedId}
    registerRef={registerPrimitiveRef}
  />
))}
```

`registerPrimitiveRef`(436~440행)와 `TransformControls` JSX(593~610행)는 **그대로 재사용**
(§4에서 이미 설명한 대로 `primitiveObjectsRef`/`selectedId`를 공유하기 때문).

## 8. 선택 상태 분기 — `updateTransform`/삭제/복제/레이어 탭

`updateTransform`(428~430행)은 `primitives`만 매핑한다. `TransformControls`의
`onObjectChange`(600~608행)와 도형탭의 `Vec3Field onCommit` 콜백들이 도형/모델 어느 쪽을
움직이고 있는지 구분해야 한다. 가장 단순한 방법은 "선택된 것이 primitives에 있으면 도형,
아니면(그리고 customModels에 있으면) 모델"로 분기하는 것:

```ts
const selectedPrimitive = primitives.find((p) => p.id === selectedId) ?? null;
const selectedCustomModel = customModels.find((m) => m.id === selectedId) ?? null;

function updateCustomModelTransform(id: string, patch: Partial<Pick<BgCustomModelInstance, "position" | "rotation" | "scale">>) {
  setCustomModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
}
```

`onObjectChange`(600~608행) 안의 `updateTransform(selectedId, {...})` 호출을:

```ts
if (selectedPrimitive) updateTransform(selectedId, { position, rotation, scale });
else if (selectedCustomModel) updateCustomModelTransform(selectedId, { position, rotation, scale });
```

로 분기. `deleteSelected`(409~417행)/`duplicateSelected`(419~426행), 그리고 "선택한 도형" 패널
(852~929행, 도형탭 안)의 색상 필드는 **커스텀 모델일 때 렌더링하지 않고**(모델은 `color`가
없음), 대신 `selectedCustomModel`이 있을 때 같은 위치/회전/크기 `Vec3Field` 3개(색상 없이)를
보여주는 형제 블록을 추가한다. 복제는 `duplicateBgCustomModelInstance` + `setCustomModels`,
삭제는 `setCustomModels((prev) => prev.filter(...))`로 각각 분기.

레이어 탭(933~993행)의 목록도 `primitives`와 `customModels`를 합쳐 렌더링하도록 확장 필요
(각 행에 "도형"/모델 이름 + 복제/삭제 버튼, 클릭 시 `setSelectedId`) — 정렬 순서(추가된 순서
그대로 보여줄지, 두 배열을 인터리빙할지)는 통합 패스에서 UX상 자연스러운 쪽으로 결정.

## 9. undo/redo 히스토리 — 튜플화

기존 히스토리 effect(356~374행)는 `primitives` 스냅샷 하나만 적재한다. `customModels`도 같은
타임라인에 얹어야 "실행 취소 한 번 = 도형이든 모델이든 씬 전체가 한 스텝 되돌아간다"는 사용자
기대와 맞는다(두 개의 독립된 undo 스택을 만들면 안 됨). `historyRef`의 원소 타입을 튜플/객체로
바꾼다:

```ts
const historyRef = useRef<{ primitives: BgPrimitive[]; customModels: BgCustomModelInstance[] }[]>([]);
```

effect의 디바운스 스냅샷(361~372행)을 `{ primitives: clonePrimitives(primitives), customModels: cloneBgCustomModelInstances(customModels) }`로, 의존성 배열을 `[primitives, customModels]`로 확장. `doUndo`/`doRedo`(376~391행)는 복원 시
`setPrimitives(...)`와 `setCustomModels(...)`를 함께 호출.

## 10. `handleInsert` — 인코딩 함수 교체

`handleInsert`(511~533행)의 `encodeBg3dSceneHash(primitives)` 호출을
`encodeBg3dSceneWithModelsHash(primitives, customModels)`로 교체. `roundExportSize`/캡처 로직
자체는 무변경(§13의 "primitives.ts 변경 없음"과 동일 이유 — 캡처는 항상 흰 배경 선화 PNG일 뿐,
씬 그래프 직렬화만 확장되는 것).

## 11. 모달 닫힘 — 캐시 일괄 dispose

`modelRootCacheRef`가 소유한 로드된 루트들의 geometry/material은 §7에서 설명한 대로 인스턴스별
`BgCustomModelMesh`가 아니라 **모달이 완전히 닫힐 때 한 번에** 해제한다:

```ts
useEffect(() => {
  if (open) return;
  const cache = modelRootCacheRef.current;
  for (const root of cache.values()) {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        mat.dispose();
      }
    });
  }
  cache.clear();
}, [open]);
```

(`applyBg3dFallbackMaterial`이 이미 `.obj` 경로의 원본 머티리얼을 로드 시점에 dispose하므로,
여기서는 로드 완료 후 실제로 씬에 쓰인 최종 geometry/material만 대상이 된다 — 이중 dispose
아님.)

## 12. `disarmAllPixelTools()` — 변경 불필요

`StudioPage.tsx`의 `disarmAllPixelTools()`(4855~4867행경, 11개 armed 상태 토글)는 VRM 포저
모달도 포함하지 않는다 — VRM 포저(`<StudioVrmPoser open .../>`, 14746행경)와 3D 배경 모달
(`<StudioBackground3D open .../>`, 14777행경) 둘 다 `fixed inset-0 z-[80]` 전체 오버레이라
메인 Konva 캔버스 제스처를 가로챌 일이 없기 때문이다(그래서 애초에 그 11개 목록에 없음). "모델"
탭 추가는 같은 모달 내부의 새 탭일 뿐이므로 이 함수에 아무것도 추가할 필요가 없다 — VRM 포저
선례와 대조해 이미 확인됨.

## 13. `StudioPage.tsx` / `studio-background-3d-primitives.ts` — 변경 불필요 확인

- **`StudioPage.tsx`**: `<StudioBackground3D open .../>`(14777행경)는 `open`/`initialDataUrl`/
  `onClose`/`onInsert` 4개 prop만 받는 현재 인터페이스를 그대로 유지한다 — 모델 라이브러리/
  커스텀 인스턴스 상태는 전부 `StudioBackground3D.tsx` 내부에 캡슐화되고, 캡처 결과물은
  지금과 동일하게 "PNG data URL(+ `#`-해시)"이라는 단일 문자열로만 부모에 전달되기 때문에
  `StudioPage.tsx` 쪽 시그니처/저장 스키마가 바뀔 이유가 없다.
- **`studio-background-3d-primitives.ts`**: `BgPrimitive`/`makeGeometry`/
  `encodeBg3dSceneHash`/`parseBg3dSceneFromDataUrl` 등 기존 export는 지금 이대로도 완전하고,
  이번 기능은 그 파일이 다루는 개념(도형 프리미티브) 자체를 확장하는 게 아니라 완전히 다른
  종류의 씬 원소(외부 모델)를 나란히 추가하는 것이므로 그 파일을 열 이유가 없다(§1).

## 14. 현재 형식 지원과 남은 범위

- **SketchUp `.skp` 자체는 파싱하지 않는다.** `.skp`는 비공개 바이너리 포맷이라 브라우저에서
  직접 열 수 없다 — 대신 SketchUp에서 GLB/glTF/OBJ 등 현재 지원하는 표준 형식으로 내보낸다
  (사용자가 SketchUp에서 "내보내기"로 만든 파일을 업로드하는 흐름). "스케치업 대응"이라는
  이 스튜디오의 3D 배경 도구 취지(도형 블록아웃)와 일관된 범위 설정.
- **멀티파일 glTF와 OBJ/MTL은 지원한다.** 업로드 UI에서 기본 모델과 BIN·MTL·PNG·JPEG·WebP
  연결 파일을 함께 선택하면, 안전한 로컬 상대 경로만 해석하고 외부 네트워크 참조는 거부한 뒤
  canonical self-contained GLB로 변환·검증해 라이브러리에 저장한다.
- **공개 포맷도 검증 GLB 경계를 우회하지 않는다.** 변환 원본은 파일당 32MiB, 인라인 `data:`는
  개별 8MiB·합계 32MiB로 제한하고, OBJ/glTF는 파싱 전에 노드·메시·정점·삼각형 선언을 검사한다.
  모든 변환 포맷은 파싱 직후 다시 노드 2,048개, 메시 1,024개, 유효 정점 400만 개, 삼각형
  200만 개, 디코딩 지오메트리 256MiB 상한을 통과해야 GLB exporter가 실행된다. `..` 경로,
  외부 URL, 선택하지 않은 MTL/BIN/텍스처와 과대 인라인 이미지 치수는 fail-closed다.
- **JSON glTF의 임의 디코더 경계는 의도적으로 좁다.** 선택한 BIN/PNG/JPEG/WebP와 제한된
  `data:` URI는 지원하지만 bufferView 이미지와 Draco/Basis/Meshopt 압축 JSON은 파서 전에
  거부한다. 그런 모델은 제작 도구에서 자체 포함 GLB로 다시 내보내면 기존 Worker 검증 경로에서
  Meshopt/KTX2 지원 여부와 디코딩 후 메모리까지 검사할 수 있다.
- **Clip Studio 전용 `.cs3c/.cs3o/.cs3s`와 `.clip`은 직접 파싱하지 않는다.** 공개된 호환
  명세가 없는 전용 컨테이너를 추측해 읽지 않고, Clip Studio나 원 제작 도구에서 GLB/glTF/OBJ로
  내보낸 결과를 가져오는 것을 호환 경계로 삼는다. FBX/DAE/STL/PLY/3DS 변환은 생성형 회귀
  fixture로 검사하지만, 공급자별 확장이 많은 외부 파일 전체에 대한 완전 호환을 보증하지 않는다.
- **번들 샘플 모델 없음** — `SAMPLE_BG3D_MODELS`가 빈 배열인 이유는 이미 복합 오브젝트
  프리셋(`studio-background-3d-composites.ts`, 건물/자연/차량/소품 카테고리)이 "미리 준비된
  배경 소재"라는 같은 역할을 코드로(라이선스 리스크 없이) 채우고 있기 때문. 라이선스 검증된
  `.glb` 배경 에셋을 나중에 조달하면 `SAMPLE_BG3D_MODELS`에 항목만 추가하면 되고
  (`withDefaultBg3dModelEntry` 등 나머지 로직은 이미 이 케이스를 처리하도록 짜여 있다),
  다만 "sample" 소스는 blob이 아니라 URL 기반이라 `loadBg3dCustomModelFromBlob`과 별개로
  URL 기반 로더 분기가 하나 더 필요해진다(VRM의 `loadVrmAsset(url)`처럼).
- **라이브러리 썸네일 없음(v1)** — 그리드에는 아이콘 폴백만 표시한다(포맷 뱃지 정도는 가능:
  `glb`/`gltf`/`obj` 텍스트). VRM 라이브러리의 캡처-기반 썸네일 파이프라인을 재사용하려면
  로드 직후 오프스크린 렌더 1프레임을 캡처해 `saveBg3dModelThumbnail`에 저장하는 별도 작업이
  필요 — 이번 패스 범위 밖.
- **MTL이 없는 레거시 단일-Blob OBJ는 중립색으로 폴백한다.** 현행 다중 파일 가져오기의
  OBJ/MTL/텍스처 재질은 보존되지만, 과거 저장 형식의 OBJ blob은 연결 파일을 회복할 수 없어
  `applyBg3dFallbackMaterial`이 무광 중립색을 적용한다.
- **선택 객체 원점·바닥 정렬 지원(로컬 피벗 비파괴)** — 도형이나 가져온 모델을 하나 선택해
  `원점 · 바닥 정렬`을 실행하면 현재 회전·크기·부모 계층이 반영된 실제 렌더 지오메트리의 정밀
  `THREE.Box3` 경계를 측정한다. 그 경계의 XZ 중심은 월드 원점에, 최저점은 Y=0에 오도록 결과를
  부모 로컬 위치로 역변환해 인스턴스 transform에 적용하며, 명령 직후 동일한 장면 히스토리에
  기록되므로 한 단계 undo/redo가 가능하다. 여러 객체가 원점에 겹치는 것을 막기 위해 단일 선택만
  허용하고 잠긴 객체·아직 로딩 중이거나 경계가 비어 있는 모델은 변경하지 않는다. 원본 파일의
  버텍스나 로컬 피벗 자체를 다시 쓰지는 않으므로 에셋 데이터와 리그 계층은 그대로 보존된다.

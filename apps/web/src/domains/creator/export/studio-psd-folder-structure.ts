import type { Layer } from "ag-psd";
import type { LayerGroup } from "../studio-layers";

/** 원본 폴더의 신원·계층. Studio의 평면 폴더 UI와 별도로 왕복 교환에 보존한다. */
export interface StudioPsdFolder {
  readonly id: string;
  readonly name: string;
}

export interface StudioPsdFolderElement {
  readonly groupId?: string;
  readonly psdGroupId?: string;
  readonly psdFolderPath?: readonly StudioPsdFolder[];
}

/** 편집 중 폴더를 옮기거나 해제했으면 오래된 원본 계층을 다시 적용하지 않는다. */
export function psdExportFolderPath(element: StudioPsdFolderElement, groups: readonly LayerGroup[] = []): readonly StudioPsdFolder[] {
  const path = element.psdFolderPath;
  const name = groups.find((group) => group.id === element.groupId)?.name;
  if (path?.length && element.groupId === element.psdGroupId) {
    return name && name !== path.map((folder) => folder.name).join(" / ")
      ? path.map((folder, index) => index === path.length - 1 ? { ...folder, name } : folder)
      : path;
  }
  return element.groupId ? [{ id: element.groupId, name: name ?? "레이어 폴더" }] : [];
}

/** 입력 레이어 순서를 그대로 유지하며 연속한 공통 조상만 묶는다. */
export function groupPsdExportLayers(
  layers: readonly Layer[],
  elements: readonly StudioPsdFolderElement[],
  groups: readonly LayerGroup[] = [],
): Layer[] {
  const output: Layer[] = [];
  let previous: readonly StudioPsdFolder[] = [];
  let containers: Layer[][] = [output];
  layers.forEach((layer, index) => {
    const element = elements[index];
    const path = element ? psdExportFolderPath(element, groups) : [];
    let common = 0;
    while (common < path.length && previous[common]?.id === path[common]?.id && previous[common]?.name === path[common]?.name) common += 1;
    containers = containers.slice(0, common + 1);
    for (const folder of path.slice(common)) {
      const children: Layer[] = [];
      containers.at(-1)?.push({ name: folder.name, children, blendMode: "pass through", opacity: 1 });
      containers.push(children);
    }
    containers.at(-1)?.push(layer);
    previous = path;
  });
  return output;
}

/** 평면 UI에서도 중첩 경로를 읽고 접을 수 있도록 가장 안쪽 폴더를 경로명으로 표시한다. */
export function studioGroupsFromPsdElements(elements: readonly StudioPsdFolderElement[]): LayerGroup[] {
  const groups = new Map<string, LayerGroup>();
  for (const element of elements) {
    if (!element.groupId || !element.psdFolderPath?.length) continue;
    groups.set(element.groupId, {
      id: element.groupId,
      name: element.psdFolderPath.map((folder) => folder.name).join(" / "),
    });
  }
  return [...groups.values()];
}

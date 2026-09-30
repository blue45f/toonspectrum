import type { MaterialKind, MaterialProvider } from "../material-atlas/model";
import { MATERIAL_KINDS, MATERIAL_PROVIDERS } from "../material-atlas/model";
import "./material-discovery.css";

interface Props {
  provider: MaterialProvider | "all";
  kind: MaterialKind | "all";
  counts: { provider: Record<string, number>; kind: Record<string, number> };
  onProvider: (value: MaterialProvider | "all") => void;
  onKind: (value: MaterialKind | "all") => void;
}

/** 원클릭 필터 칩. 기존 select와 동일한 값을 URL 파라미터로 유지한다. */
export function MaterialFilterChips({ provider, kind, counts, onProvider, onKind }: Props) {
  const providerOptions: Array<{ value: MaterialProvider | "all"; label: string }> = [
    { value: "all", label: "모든 제공처" },
    ...(Object.keys(MATERIAL_PROVIDERS) as MaterialProvider[]).map((id) => ({ value: id as MaterialProvider | "all", label: MATERIAL_PROVIDERS[id].name })),
  ];
  const kindOptions: Array<{ value: MaterialKind | "all"; label: string }> = [
    { value: "all", label: "모든 종류" },
    ...(Object.keys(MATERIAL_KINDS) as MaterialKind[]).map((id) => ({ value: id as MaterialKind | "all", label: MATERIAL_KINDS[id] })),
  ];
  return <div className="grid gap-3">
    <div>
      <p id="md-provider-label" className="text-sm font-semibold">제공처</p>
      <div className="md-chips mt-2" role="group" aria-labelledby="md-provider-label">
        {providerOptions.map((option) => <button type="button" key={option.value} className="md-chip" aria-pressed={provider === option.value}
          onClick={() => onProvider(option.value)}>{option.label}
          {option.value !== "all" && counts.provider[option.value] !== undefined && <small>{counts.provider[option.value]}</small>}</button>)}
      </div>
    </div>
    <div>
      <p id="md-kind-label" className="text-sm font-semibold">소재 종류</p>
      <div className="md-chips mt-2" role="group" aria-labelledby="md-kind-label">
        {kindOptions.map((option) => <button type="button" key={option.value} className="md-chip" aria-pressed={kind === option.value}
          onClick={() => onKind(option.value)}>{option.label}
          {option.value !== "all" && counts.kind[option.value] !== undefined && <small>{counts.kind[option.value]}</small>}</button>)}
      </div>
    </div>
  </div>;
}

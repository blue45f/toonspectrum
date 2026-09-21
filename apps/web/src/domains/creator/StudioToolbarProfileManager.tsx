import { useLayoutEffect, useRef, useState } from "react";
import type { StudioToolbarPreferences } from "./studio-app-settings";

const action = "min-h-11 rounded-lg border border-line px-3 text-xs text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-45";

/** Profile changes are drafts; the customizer owns persistence. */
export function StudioToolbarProfileManager({ value, onChange }: {
  readonly value: StudioToolbarPreferences;
  readonly onChange: (next: StudioToolbarPreferences) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { if (editing) nameInput.current?.focus(); }, [editing]);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const profiles = value.profiles ?? [];
  const returnFocus = (id: string) => requestAnimationFrame(() => (buttons.current.get(id) ?? heading.current)?.focus());
  const rename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 48) { setError("구성 이름을 1~48자로 입력하세요."); return; }
    if (profiles.some((profile) => profile.id !== editing && profile.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError("같은 이름의 구성이 있습니다. 다른 이름을 입력하세요."); return;
    }
    if (!profiles.some((profile) => profile.id === editing)) return;
    onChange({ ...value, profiles: profiles.map((profile) => profile.id === editing ? { ...profile, name: trimmed } : profile) });
    setMessage("구성 이름을 변경했습니다. 구성 적용을 누르면 저장됩니다.");
    if (editing) returnFocus(editing);
    setEditing(null); setError("");
  };
  return <section aria-label="저장한 도구 구성" className="mt-3 space-y-2">
    <h4 ref={heading} tabIndex={-1} className="text-xs font-semibold">내 구성 {profiles.length}/12</h4>
    {profiles.length === 12 ? <p className="text-xs text-fg-2">저장 한도에 도달했습니다. 사용하지 않는 구성을 삭제하면 새 구성을 저장할 수 있습니다.</p> : null}
    <ul className="space-y-2">
      {profiles.map((profile) => <li key={profile.id} className="space-y-2 rounded-lg border border-line p-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${action} min-w-0 break-words`} aria-pressed={value.activeProfileId === profile.id}
            ref={(node) => { if (node) buttons.current.set(profile.id, node); else buttons.current.delete(profile.id); }}
            onClick={() => onChange({ ...value, visibleIds: [...profile.visibleIds], view: profile.view, activeProfileId: profile.id })}>{profile.name}</button>
          <button type="button" className={action} aria-label={`${profile.name} 구성 이름 변경`}
            onClick={() => { setEditing(profile.id); setDeleting(null); setName(profile.name); setError(""); }}>이름 변경</button>
          <button type="button" className={action} aria-label={`${profile.name} 구성 삭제`}
            onClick={() => { setDeleting(profile.id); setEditing(null); setError(""); }}>삭제</button>
        </div>
        {editing === profile.id ? <div className="space-y-2">
          <label className="block text-xs">새 구성 이름
            <input ref={nameInput} aria-label={`${profile.name} 구성 새 이름`} value={name} maxLength={48}
              onChange={(event) => { setName(event.currentTarget.value); setError(""); }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); rename(); }
                if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(null); returnFocus(profile.id); }
              }} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm" />
          </label>
          <button type="button" className={action} onClick={rename}>이름 변경 확인</button>
          <button type="button" className={`${action} ml-2`} onClick={() => { setEditing(null); returnFocus(profile.id); }}>이름 변경 취소</button>
          {error ? <p role="alert" className="text-xs text-warn">{error}</p> : null}
        </div> : null}
        {deleting === profile.id ? <div className="space-y-2" role="group" aria-label={`${profile.name} 구성 삭제 확인`}>
          <p className="text-xs text-fg-2">이 구성을 삭제할까요? 현재 도구 배치는 유지되며 구성 적용 전에는 저장되지 않습니다.</p>
          <button type="button" className={action} aria-label={`${profile.name} 구성 삭제 확인`}
            onClick={() => {
              onChange({ ...value, profiles: profiles.filter((item) => item.id !== profile.id),
                activeProfileId: value.activeProfileId === profile.id ? null : value.activeProfileId });
              setDeleting(null); setMessage("구성을 삭제했습니다. 구성 적용을 누르면 저장됩니다."); returnFocus(profile.id);
            }}>삭제 확인</button>
          <button type="button" className={`${action} ml-2`} onClick={() => { setDeleting(null); returnFocus(profile.id); }}>삭제 취소</button>
        </div> : null}
      </li>)}
    </ul>
    {!profiles.length ? <p className="text-xs text-fg-2">아래에서 현재 배치를 이름 있는 구성으로 저장할 수 있습니다.</p> : null}
    {message ? <p role="status" className="text-xs text-fg-2">{message}</p> : null}
  </section>;
}

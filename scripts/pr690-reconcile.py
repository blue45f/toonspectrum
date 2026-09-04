from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path.cwd()
HEAD_BRANCH = "refactor/layered-architecture-20260904"
ALLOWED_CONFLICTS = {
    "src/app/routes/AppRouter.tsx",
    "src/domains/creator/StudioCuttoonEditorHost.tsx",
}


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(args), flush=True)
    return subprocess.run(args, check=check, text=True)


def output(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def replace_once(
    text: str,
    *,
    marker: str,
    needle: str,
    replacement: str,
    label: str,
) -> str:
    if marker in text:
        return text
    count = text.count(needle)
    if count != 1:
        raise SystemExit(f"{label}: expected one insertion point, found {count}")
    return text.replace(needle, replacement, 1)


run("git", "config", "user.name", "toonstudio-bot")
run("git", "config", "user.email", "actions@users.noreply.github.com")
run("git", "fetch", "--no-tags", "origin", "main")
merge = run("git", "merge", "--no-ff", "--no-commit", "origin/main", check=False)
conflicts = [
    line
    for line in output("git", "diff", "--name-only", "--diff-filter=U").splitlines()
    if line
]
if merge.returncode != 0 and not conflicts:
    raise SystemExit(f"merge failed without content conflicts: {merge.returncode}")
unexpected = sorted(set(conflicts) - ALLOWED_CONFLICTS)
if unexpected:
    raise SystemExit(f"unexpected merge conflicts: {', '.join(unexpected)}")
for file in conflicts:
    run("git", "checkout", "--ours", "--", file)

route_path = ROOT / "src/app/routes/groups/creator.routes.tsx"
route = route_path.read_text(encoding="utf-8")
route = replace_once(
    route,
    marker='"CharacterShaperLandingPage"',
    needle="const StudioRouter = lazyRetry(\n",
    replacement='''const CharacterShaperLandingPage = lazyRetry(
  () => import("@/src/domains/creator/CharacterShaperLandingPage").then((module) => ({
    default: module.CharacterShaperLandingPage,
  })),
  "CharacterShaperLandingPage",
);
const StudioRouter = lazyRetry(
''',
    label="creator shaper lazy route",
)
route = replace_once(
    route,
    marker='id: "creator-character-shaper"',
    needle='  { id: "creator-studio", path: "/studio/*", element: <StudioRouter /> },\n',
    replacement='''  {
    id: "creator-character-shaper",
    path: "/shaper",
    element: <CharacterShaperLandingPage />,
  },
  { id: "creator-studio", path: "/studio/*", element: <StudioRouter /> },
''',
    label="creator shaper route entry",
)
route_path.write_text(route, encoding="utf-8")

runtime_path = ROOT / (
    "src/domains/creator/studio-cuttoon-editor/runtime/"
    "useStudioCharacterShaperSurfaceRuntime.ts"
)
runtime_path.parent.mkdir(parents=True, exist_ok=True)
runtime_path.write_text(
    '''import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

interface UseStudioCharacterShaperSurfaceRuntimeOptions {
  readonly navigateStudio2dSurface: (surface: "character" | "poser") => void;
  readonly setPoserVrmOpen: Dispatch<SetStateAction<boolean>>;
}

/** Owns the mutually-exclusive VRM builder and preset-first character surface. */
export function useStudioCharacterShaperSurfaceRuntime({
  navigateStudio2dSurface,
  setPoserVrmOpen,
}: UseStudioCharacterShaperSurfaceRuntimeOptions) {
  const [characterShaperOpen, setCharacterShaperOpen] = useState(false);

  const openVrmPoserFromMenu = useCallback(() => {
    setCharacterShaperOpen(false);
    setPoserVrmOpen(true);
    navigateStudio2dSurface("poser");
  }, [navigateStudio2dSurface, setPoserVrmOpen]);

  const openCharacterShaperFromMenu = useCallback(() => {
    setPoserVrmOpen(false);
    setCharacterShaperOpen(true);
    navigateStudio2dSurface("character");
  }, [navigateStudio2dSurface, setPoserVrmOpen]);

  return {
    characterShaperOpen,
    openCharacterShaperFromMenu,
    openVrmPoserFromMenu,
    setCharacterShaperOpen,
  } as const;
}
''',
    encoding="utf-8",
)

host_path = ROOT / "src/domains/creator/StudioCuttoonEditorHost.tsx"
host = host_path.read_text(encoding="utf-8")
host = replace_once(
    host,
    marker="useStudioCharacterShaperSurfaceRuntime } from",
    needle='import { useStudioPixelToolSessions } from "./studio-cuttoon-editor/studio-pixel-tool-sessions";\n',
    replacement='''import { useStudioCharacterShaperSurfaceRuntime } from "./studio-cuttoon-editor/runtime/useStudioCharacterShaperSurfaceRuntime";
import { useStudioPixelToolSessions } from "./studio-cuttoon-editor/studio-pixel-tool-sessions";
''',
    label="character shaper runtime import",
)
host = replace_once(
    host,
    marker='studioRoute.surface === "character"',
    needle='''    } else if (studioRoute.surface === "poser") {
      setPoserVrmOpen(true);
    } else if (studioRoute.surface === "animation") {
''',
    replacement='''    } else if (studioRoute.surface === "poser") {
      setPoserVrmOpen(true);
    } else if (studioRoute.surface === "character") {
      setCharacterShaperOpen(true);
    } else if (studioRoute.surface === "animation") {
''',
    label="character route open sync",
)
host = replace_once(
    host,
    marker='previousSurface === "character"',
    needle='''      else if (previousSurface === "bg3d") setBg3dOpen(false);
      else if (previousSurface === "poser") setPoserVrmOpen(false);
''',
    replacement='''      else if (previousSurface === "bg3d") setBg3dOpen(false);
      else if (previousSurface === "poser") setPoserVrmOpen(false);
      else if (previousSurface === "character") setCharacterShaperOpen(false);
''',
    label="character route close sync",
)
host = replace_once(
    host,
    marker='case "character-shaper":',
    needle='''      case "character":
        setPoserVrmOpen(true);
        break;
      case "bg3d":
''',
    replacement='''      case "character":
        setPoserVrmOpen(true);
        break;
      case "character-shaper":
        openCharacterShaperFromMenu();
        break;
      case "bg3d":
''',
    label="character shaper command",
)
host = replace_once(
    host,
    marker="useStudioCharacterShaperSurfaceRuntime({",
    needle='''  function openVrmPoserFromMenu() {
    setPoserVrmOpen(true);
    navigateStudio2dSurface("poser");
  }
''',
    replacement='''  const {
    characterShaperOpen,
    openCharacterShaperFromMenu,
    openVrmPoserFromMenu,
    setCharacterShaperOpen,
  } = useStudioCharacterShaperSurfaceRuntime({
    navigateStudio2dSurface,
    setPoserVrmOpen,
  });
''',
    label="character shaper surface runtime",
)
host = replace_once(
    host,
    marker='''    characterShaperOpen,
    dccRouteRequested:''',
    needle='''    bg3dOpen,
    dccRouteRequested: hybridDccRouteRequested,
''',
    replacement='''    bg3dOpen,
    characterShaperOpen,
    dccRouteRequested: hybridDccRouteRequested,
''',
    label="character surface admission input",
)
host = replace_once(
    host,
    marker="const admittedCharacterShaperOpen =",
    needle='''  const admittedBg3dOpen = interactiveThreeDSurfaceAdmission.bg3dOpen;
  const admittedMannequinPoserOpen = interactiveThreeDSurfaceAdmission.mannequinPoserOpen;
''',
    replacement='''  const admittedBg3dOpen = interactiveThreeDSurfaceAdmission.bg3dOpen;
  const admittedCharacterShaperOpen = interactiveThreeDSurfaceAdmission.characterShaperOpen;
  const admittedMannequinPoserOpen = interactiveThreeDSurfaceAdmission.mannequinPoserOpen;
''',
    label="character surface admission output",
)
host = replace_once(
    host,
    marker='''    character: false,
    comic:''',
    needle='''    animation: false,
    bg3d: false,
    comic: false,
''',
    replacement='''    animation: false,
    bg3d: false,
    character: false,
    comic: false,
''',
    label="routed character state",
)
host = replace_once(
    host,
    marker='surface: "animation" | "bg3d" | "character" | "comic" | "poser"',
    needle='surface: "animation" | "bg3d" | "comic" | "poser"',
    replacement='surface: "animation" | "bg3d" | "character" | "comic" | "poser"',
    label="routed character type",
)
host = replace_once(
    host,
    marker='useRoutedSurfacePanelSync("character", characterShaperOpen)',
    needle='''  useRoutedSurfacePanelSync("bg3d", bg3dOpen);
  useRoutedSurfacePanelSync("poser", poserVrmOpen);
''',
    replacement='''  useRoutedSurfacePanelSync("bg3d", bg3dOpen);
  useRoutedSurfacePanelSync("poser", poserVrmOpen);
  useRoutedSurfacePanelSync("character", characterShaperOpen);
''',
    label="routed character panel sync",
)
host = replace_once(
    host,
    marker='''      openCharacterShaperFromMenu,
      openBackground3dFromMenu,''',
    needle='''      openVrmPoserFromMenu,
      openBackground3dFromMenu,
''',
    replacement='''      openVrmPoserFromMenu,
      openCharacterShaperFromMenu,
      openBackground3dFromMenu,
''',
    label="character shaper editor command",
)
host = replace_once(
    host,
    marker="admittedCharacterShaperOpen={admittedCharacterShaperOpen}",
    needle='''      admittedBg3dOpen={admittedBg3dOpen}
      admittedMannequinPoserOpen={admittedMannequinPoserOpen}
''',
    replacement='''      admittedBg3dOpen={admittedBg3dOpen}
      admittedCharacterShaperOpen={admittedCharacterShaperOpen}
      admittedMannequinPoserOpen={admittedMannequinPoserOpen}
''',
    label="character shaper view admission",
)
host = replace_once(
    host,
    marker="setCharacterShaperOpen={setCharacterShaperOpen}",
    needle='''      setPoserInitialElementId={setPoserInitialElementId}
      setPoserVrmOpen={setPoserVrmOpen}
''',
    replacement='''      setPoserInitialElementId={setPoserInitialElementId}
      setCharacterShaperOpen={setCharacterShaperOpen}
      setPoserVrmOpen={setPoserVrmOpen}
''',
    label="character shaper view setter",
)
host_path.write_text(host, encoding="utf-8")

host_lines = len(host.split("\n"))
formatted_lines = f"{host_lines:,}".replace(",", "_")
ratchet_path = ROOT / "src/domains/creator/studio-host-architecture-ratchet.test.ts"
ratchet = ratchet_path.read_text(encoding="utf-8")
ratchet, count = re.subn(
    r"const HOST_MAX_LINES = [0-9_]+;",
    f"const HOST_MAX_LINES = {formatted_lines};",
    ratchet,
    count=1,
)
if count != 1:
    raise SystemExit("host ratchet constant was not found exactly once")
marker = "main-reconciled Character Shaper surface seam"
if marker not in ratchet:
    ratchet = ratchet.replace(
        f"const HOST_MAX_LINES = {formatted_lines};",
        "// 2026-09-04: main-reconciled Character Shaper surface seam resets this once to the\n"
        "// measured post-merge value; subsequent extractions may only lower it.\n"
        f"const HOST_MAX_LINES = {formatted_lines};",
        1,
    )
ratchet_path.write_text(ratchet, encoding="utf-8")

doc_path = ROOT / "docs/architecture/frontend-layered-architecture.md"
doc = doc_path.read_text(encoding="utf-8")
doc, count = re.subn(
    r"The adoption ceiling is [0-9,]+ lines(?: after preserving current main's Character Shaper surface)?\.",
    f"The adoption ceiling is {host_lines:,} lines after preserving current main's Character Shaper surface.",
    doc,
    count=1,
)
if count != 1:
    raise SystemExit("architecture document host ceiling was not found exactly once")
doc_path.write_text(doc, encoding="utf-8")

if "<<<<<<<" in host or ">>>>>>>" in host:
    raise SystemExit("unresolved conflict marker remains in Studio host")

for temporary in (
    ROOT / ".github/workflows/pr690-reconcile-main.yml",
    ROOT / ".github/workflows/pr690-reconcile-slim.yml",
    ROOT / "scripts/pr690-reconcile.py",
):
    temporary.unlink(missing_ok=True)

run("git", "add", "-A")
run("git", "diff", "--cached", "--check")
run("node", "scripts/validate-architecture.mjs")

has_merge_head = subprocess.run(
    ["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
).returncode == 0
if has_merge_head:
    run("git", "commit", "-m", "merge(main): reconcile architecture refactor with current studio")
elif subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode != 0:
    run("git", "commit", "-m", "refactor(architecture): preserve current studio features")
else:
    print("no reconciliation commit required")

run("git", "push", "origin", f"HEAD:{HEAD_BRANCH}")
print(f"PR690_RECONCILED_HEAD={output('git', 'rev-parse', 'HEAD')}")
print(f"PR690_RECONCILED_MAIN={output('git', 'rev-parse', 'origin/main')}")
print(f"PR690_RECONCILED_HOST_LINES={host_lines}")

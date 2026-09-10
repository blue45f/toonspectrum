from __future__ import annotations

import base64
import json
import os
from typing import Any, Callable
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

TOKEN = os.environ["GH_TOKEN"]
BRANCH = os.environ["TARGET_BRANCH"]
REPOSITORY = os.environ["TARGET_REPOSITORY"]
API_ROOT = "https://api.github.com"


def request(method: str, endpoint: str, payload: dict[str, Any] | None = None) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = Request(
        f"{API_ROOT}{endpoint}",
        data=body,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "toonspectrum-codeql-remediation",
        },
    )
    try:
        with urlopen(req, timeout=60) as response:
            raw = response.read()
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"GitHub API {method} {endpoint} failed: {error.code} {detail}"
        ) from error
    return json.loads(raw) if raw else None


def endpoint(path: str, *, include_ref: bool = False) -> str:
    value = f"/repos/{REPOSITORY}/contents/{quote(path, safe='/')}"
    if include_ref:
        value += f"?ref={quote(BRANCH, safe='')}"
    return value


def fetch_text(path: str) -> tuple[str, str]:
    data = request("GET", endpoint(path, include_ref=True))
    if not isinstance(data, dict) or not isinstance(data.get("content"), str):
        raise RuntimeError(f"Unexpected contents response for {path}")
    return base64.b64decode(data["content"]).decode("utf-8"), str(data["sha"])


def update_text(path: str, transform: Callable[[str], str], message: str) -> None:
    current, sha = fetch_text(path)
    updated = transform(current)
    if updated == current:
        print(f"No update needed: {path}")
        return
    request(
        "PUT",
        endpoint(path),
        {
            "message": message,
            "content": base64.b64encode(updated.encode("utf-8")).decode("ascii"),
            "sha": sha,
            "branch": BRANCH,
        },
    )
    print(f"Updated: {path}")


def replace_once(text: str, old: str, new: str, path: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    return text.replace(old, new, 1)


SESSION_PATH = "apps/web/src/domains/creator/ai/studio-ai-comic-director-session.ts"
ROUTE_PATH = "apps/web/src/domains/creator/studio-router/routes/StudioAiComicDirectorRoute.tsx"
PANEL_PATH = "apps/web/src/domains/creator/ai/StudioAiComicDirectorPanel.tsx"
TEST_PATH = "apps/web/src/domains/creator/ai/studio-ai-comic-director-session.test.ts"


def patch_session(text: str) -> str:
    old_helper = """function id(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `comic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}"""
    new_helper = """export interface StudioAiComicDirectorCrypto {
  readonly randomUUID?: () => string;
  readonly getRandomValues?: (
    array: Uint8Array<ArrayBuffer>,
  ) => Uint8Array<ArrayBuffer>;
}

export function createStudioAiComicDirectorId(
  prefix = "comic",
  cryptoApi: StudioAiComicDirectorCrypto | null | undefined =
    globalThis.crypto as StudioAiComicDirectorCrypto | undefined,
): string {
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("안전한 AI 코믹 디렉터 식별자를 생성할 수 없습니다.");
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  const entropy = Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}-${entropy}`;
}"""
    if old_helper in text:
        text = replace_once(text, old_helper, new_helper, SESSION_PATH)
    elif "export function createStudioAiComicDirectorId(" not in text:
        raise RuntimeError(f"Unrecognized ID helper in {SESSION_PATH}")

    old_call = "    id: input.id ?? id(),"
    new_call = "    id: input.id ?? createStudioAiComicDirectorId(),"
    if old_call in text:
        text = replace_once(text, old_call, new_call, SESSION_PATH)
    elif new_call not in text:
        raise RuntimeError(f"Unrecognized session ID call in {SESSION_PATH}")

    if "Math.random" in text:
        raise RuntimeError(f"Insecure randomness remains in {SESSION_PATH}")
    return text


def patch_route(text: str) -> str:
    secure_import = "  createStudioAiComicDirectorId,\n"
    if secure_import not in text:
        text = replace_once(
            text,
            "  createStudioAiComicDirectorSession,\n",
            secure_import + "  createStudioAiComicDirectorSession,\n",
            ROUTE_PATH,
        )

    old_helper = """function uid(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `comic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

"""
    if old_helper in text:
        text = replace_once(text, old_helper, "", ROUTE_PATH)

    if "uid()" in text:
        count = text.count("uid()")
        if count != 2:
            raise RuntimeError(f"Expected two uid() calls in {ROUTE_PATH}, found {count}")
        text = text.replace("uid()", "createStudioAiComicDirectorId()")

    if "Math.random" in text or "function uid" in text:
        raise RuntimeError(f"Insecure local ID helper remains in {ROUTE_PATH}")
    if text.count("createStudioAiComicDirectorId()") != 2:
        raise RuntimeError(f"Secure route ID calls are incomplete in {ROUTE_PATH}")
    return text


def patch_panel(text: str) -> str:
    secure_import = "  createStudioAiComicDirectorId,\n"
    if secure_import not in text:
        text = replace_once(
            text,
            "  createStudioAiComicDirectorSession,\n",
            secure_import + "  createStudioAiComicDirectorSession,\n",
            PANEL_PATH,
        )

    old_helper = """function uid(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}"""
    new_helper = """function uid(prefix: string): string {
  return createStudioAiComicDirectorId(prefix);
}"""
    if old_helper in text:
        text = replace_once(text, old_helper, new_helper, PANEL_PATH)
    elif new_helper not in text:
        raise RuntimeError(f"Unrecognized panel ID helper in {PANEL_PATH}")

    if "Math.random" in text:
        raise RuntimeError(f"Insecure randomness remains in {PANEL_PATH}")
    return text


def patch_test(text: str) -> str:
    if "  createStudioAiComicDirectorId,\n" not in text:
        text = replace_once(
            text,
            "  createStudioAiComicApplyDiff,\n  createStudioAiComicDirectorSession,\n",
            "  createStudioAiComicApplyDiff,\n  createStudioAiComicDirectorId,\n  createStudioAiComicDirectorSession,\n",
            TEST_PATH,
        )

    if 'it("uses Web Crypto entropy when randomUUID is unavailable"' not in text:
        marker = 'describe("AI Comic Director session", () => {\n'
        tests = """describe("AI Comic Director session", () => {
  it("uses Web Crypto entropy when randomUUID is unavailable", () => {
    const generated = createStudioAiComicDirectorId("comic", {
      getRandomValues(array) {
        array.set(Array.from({ length: 16 }, (_, index) => index));
        return array;
      },
    });

    expect(generated).toBe("comic-000102030405060708090a0b0c0d0e0f");
  });

  it("fails closed when secure entropy is unavailable", () => {
    expect(() => createStudioAiComicDirectorId("comic", null)).toThrow(
      "안전한 AI 코믹 디렉터 식별자를 생성할 수 없습니다.",
    );
  });

"""
        text = replace_once(text, marker, tests, TEST_PATH)
    return text


update_text(SESSION_PATH, patch_session, "fix(security): centralize secure comic director IDs")
update_text(ROUTE_PATH, patch_route, "fix(security): remove route Math.random ID fallback")
update_text(PANEL_PATH, patch_panel, "fix(security): secure panel operation IDs")
update_text(TEST_PATH, patch_test, "test(security): cover secure comic director IDs")

for cleanup_path in (
    ".github/workflows/apply-code-scanning-fixes-once.yml",
    ".github/workflows/apply-code-scanning-fixes-slim-once.yml",
    ".github/codeql-remediate-once.py",
):
    try:
        _, cleanup_sha = fetch_text(cleanup_path)
    except RuntimeError as error:
        if "404" in str(error):
            continue
        raise
    request(
        "DELETE",
        endpoint(cleanup_path),
        {
            "message": f"ci(security): remove completed {cleanup_path.rsplit('/', 1)[-1]}",
            "sha": cleanup_sha,
            "branch": BRANCH,
        },
    )
    print(f"Removed: {cleanup_path}")

print("CodeQL remediation completed.")

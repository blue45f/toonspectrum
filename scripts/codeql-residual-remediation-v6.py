#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Any
import urllib.request

ROOT = Path.cwd().resolve()
ENDPOINTS = (
    "https://models.github.ai/inference/chat/completions",
    "https://models.inference.ai.azure.com/chat/completions",
)
MODELS = ("openai/gpt-5-mini", "openai/gpt-4.1", "openai/gpt-4o")


def findings_from(root: Path) -> list[dict[str, Any]]:
    paths = sorted(root.rglob("*.sarif"))
    if not paths:
        raise RuntimeError(f"No SARIF under {root}")
    result: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for path in paths:
        sarif = json.loads(path.read_text(encoding="utf-8"))
        for run in sarif.get("runs", []):
            driver = ((run.get("tool") or {}).get("driver") or {})
            rules = {r.get("id"): r for r in driver.get("rules", [])}
            for item in run.get("results", []):
                rule_id = item.get("ruleId")
                rule = rules.get(rule_id) or {}
                props = rule.get("properties") or {}
                tags = [str(tag) for tag in props.get("tags", [])]
                if props.get("security-severity") is None and not any(
                    tag.startswith("security/") or tag.startswith("external/cwe/")
                    for tag in tags
                ):
                    continue
                locations = item.get("locations") or []
                physical = ((locations[0].get("physicalLocation") if locations else None) or {})
                artifact = physical.get("artifactLocation") or {}
                region = physical.get("region") or {}
                file_path = artifact.get("uri")
                if not file_path:
                    continue
                message = ((item.get("message") or {}).get("text"))
                finding = {
                    "rule": rule_id,
                    "name": rule.get("name"),
                    "description": ((rule.get("shortDescription") or {}).get("text")),
                    "securitySeverity": props.get("security-severity"),
                    "precision": props.get("precision"),
                    "tags": tags,
                    "path": file_path,
                    "startLine": region.get("startLine"),
                    "endLine": region.get("endLine") or region.get("startLine"),
                    "message": message,
                }
                key = (rule_id, file_path, finding["startLine"], message)
                if key not in seen:
                    seen.add(key)
                    result.append(finding)
    return result


def context_for(path: Path, items: list[dict[str, Any]]) -> str:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if len(text) <= 140_000:
        return "\n".join(f"{n}: {line}" for n, line in enumerate(lines, 1))
    spans: list[tuple[int, int]] = []
    for item in items:
        center = int(item.get("startLine") or 1)
        spans.append((max(1, center - 180), min(len(lines), center + 180)))
    spans.sort()
    merged: list[list[int]] = []
    for start, end in spans:
        if merged and start <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    output: list[str] = []
    for start, end in merged:
        output.append(f"--- lines {start}-{end} ---")
        output.extend(f"{n}: {lines[n - 1]}" for n in range(start, end + 1))
    return "\n".join(output)


def json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("No JSON object in model response")
    value = json.loads(text[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("Model response must be an object")
    return value


def ask(prompt: str, token: str) -> tuple[dict[str, Any], str]:
    errors: list[str] = []
    for endpoint in ENDPOINTS:
        for model in MODELS:
            for structured in (True, False):
                payload: dict[str, Any] = {
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior application-security engineer. "
                                "Return only strict JSON line edits. Fix the actual CodeQL data flow, "
                                "keep the code compiling, and never suppress the finding."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0,
                    "max_tokens": 16000,
                }
                if structured:
                    payload["response_format"] = {"type": "json_object"}
                request = urllib.request.Request(
                    endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Accept": "application/json",
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "User-Agent": "toonspectrum-final-codeql-remediation",
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(request, timeout=300) as response:
                        body = json.load(response)
                    return json_object(body["choices"][0]["message"]["content"]), model
                except Exception as error:  # bounded provider/model fallback
                    errors.append(f"{endpoint} {model} structured={structured}: {error}")
                    time.sleep(1)
    raise RuntimeError("GitHub Models failed: " + " | ".join(errors[-10:]))


def apply(path: Path, response: dict[str, Any]) -> int:
    edits = response.get("edits")
    if not isinstance(edits, list) or not edits:
        raise ValueError("No edits returned")
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    normalized: list[tuple[int, int, str]] = []
    for edit in edits:
        start, end = int(edit["startLine"]), int(edit["endLine"])
        replacement = edit["replacement"]
        if not isinstance(replacement, str):
            raise ValueError("replacement must be a string")
        if start < 1 or end < start or end > len(lines):
            raise ValueError(f"Bad line range {start}-{end} for {len(lines)} lines")
        normalized.append((start, end, replacement))
    normalized.sort()
    for previous, current in zip(normalized, normalized[1:]):
        if current[0] <= previous[1]:
            raise ValueError(f"Overlapping edits {previous[:2]} and {current[:2]}")
    updated = list(lines)
    for start, end, replacement in reversed(normalized):
        replacement_lines = replacement.splitlines(keepends=True)
        if replacement and not replacement.endswith(("\n", "\r")) and end < len(lines):
            if replacement_lines:
                replacement_lines[-1] += "\n"
        updated[start - 1 : end] = replacement_lines
    candidate = "".join(updated)
    if candidate == original:
        raise ValueError("Edits made no change")
    path.write_text(candidate, encoding="utf-8")
    return len(normalized)


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def repair(items: list[dict[str, Any]], token: str) -> list[str]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        grouped.setdefault(str(item["path"]), []).append(item)
    changed: list[str] = []
    for relative, file_items in sorted(grouped.items()):
        target = (ROOT / relative).resolve()
        if target != ROOT and ROOT not in target.parents:
            raise RuntimeError(f"Unsafe path {relative}")
        if not target.is_file():
            raise RuntimeError(f"Missing source file {relative}")
        prompt = f"""Fix every CodeQL security finding listed below in this single file.

File: {relative}
Findings:
{json.dumps(file_items, ensure_ascii=False, indent=2)}

Current source with 1-based line numbers:
{context_for(target, file_items)}

Return only:
{{
  "edits": [
    {{"startLine": 1, "endLine": 1, "replacement": "complete replacement for the inclusive range"}}
  ],
  "summary": "brief rationale"
}}

Constraints:
- Use minimal, non-overlapping, 1-based inclusive line edits.
- Do not suppress CodeQL, exclude queries, label false positives, add unsafe casts, or weaken behavior.
- Preserve interfaces when practical and keep all callers compatible.
- URL/SSRF/redirect: parse exactly once, reject credentials/control characters/ambiguous hosts, allow explicit protocols, use exact or dot-boundary host matching, and revalidate redirects.
- Randomness: use a cryptographically secure API.
- Escaping: use one-pass encoding or structured serialization, never chained replacement.
- ReDoS: replace the vulnerable expression with deterministic or explicitly bounded parsing.
- Password/token storage: use an established password KDF, random salt and constant-time verification; preserve safe migration compatibility.
- Browser storage: never persist raw authentication secrets.
- Return JSON only.
"""
        error_text: str | None = None
        for attempt in range(1, 4):
            try:
                suffix = f"\nPrevious validation error: {error_text}" if error_text else ""
                response, model = ask(prompt + suffix, token)
                count = apply(target, response)
                run("git", "diff", "--check", "--", relative)
                print(json.dumps({"path": relative, "model": model, "edits": count, "summary": response.get("summary")}, ensure_ascii=False))
                changed.append(relative)
                break
            except Exception as error:
                run("git", "checkout", "--", relative)
                error_text = str(error)
                if attempt == 3:
                    raise
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sarif-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fix", action="store_true")
    args = parser.parse_args()
    items = findings_from(args.sarif_root)
    args.output.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"CODEQL_SECURITY_FINDINGS={len(items)}")
    if not items:
        return 0
    if not args.fix:
        return 2
    token = os.environ.get("GITHUB_MODELS_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        raise RuntimeError("Missing GitHub Models token")
    changed = repair(items, token)
    if not changed:
        raise RuntimeError("Findings existed but no files changed")
    print("CHANGED_FILES=" + json.dumps(changed, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Temporary, branch-local helper for residual CodeQL remediation.

The workflow removes this file before opening the final pull request.
"""

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
import urllib.error
import urllib.request


REPO_ROOT = Path.cwd().resolve()
SECURITY_TAG_PREFIXES = ("security/", "external/cwe/")
MODEL_ENDPOINTS = (
    "https://models.github.ai/inference/chat/completions",
    "https://models.inference.ai.azure.com/chat/completions",
)
MODEL_NAMES = (
    "openai/gpt-5-mini",
    "openai/gpt-4.1",
    "openai/gpt-4o",
)


def extract_findings(sarif_root: Path) -> list[dict[str, Any]]:
    sarif_paths = sorted(sarif_root.rglob("*.sarif"))
    if not sarif_paths:
        raise RuntimeError(f"No SARIF files found below {sarif_root}")

    findings: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for sarif_path in sarif_paths:
        sarif = json.loads(sarif_path.read_text(encoding="utf-8"))
        for run in sarif.get("runs", []):
            driver = ((run.get("tool") or {}).get("driver") or {})
            rules = {rule.get("id"): rule for rule in driver.get("rules", [])}
            for result in run.get("results", []):
                rule_id = result.get("ruleId")
                rule = rules.get(rule_id) or {}
                properties = rule.get("properties") or {}
                tags = [str(tag) for tag in properties.get("tags", [])]
                security_severity = properties.get("security-severity")
                if security_severity is None and not any(
                    tag.startswith(SECURITY_TAG_PREFIXES) for tag in tags
                ):
                    continue

                locations = result.get("locations") or []
                physical = (
                    (locations[0].get("physicalLocation") if locations else None) or {}
                )
                artifact = physical.get("artifactLocation") or {}
                region = physical.get("region") or {}
                relative_path = artifact.get("uri")
                if not relative_path:
                    continue
                message = ((result.get("message") or {}).get("text"))
                finding = {
                    "rule": rule_id,
                    "name": rule.get("name"),
                    "description": ((rule.get("shortDescription") or {}).get("text")),
                    "securitySeverity": security_severity,
                    "precision": properties.get("precision"),
                    "tags": tags,
                    "path": relative_path,
                    "startLine": region.get("startLine"),
                    "endLine": region.get("endLine") or region.get("startLine"),
                    "message": message,
                }
                key = (rule_id, relative_path, finding["startLine"], message)
                if key not in seen:
                    seen.add(key)
                    findings.append(finding)
    return findings


def source_context(path: Path, findings: list[dict[str, Any]]) -> str:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if len(text) <= 120_000:
        return "\n".join(f"{index}: {line}" for index, line in enumerate(lines, 1))

    ranges: list[tuple[int, int]] = []
    for finding in findings:
        center = int(finding.get("startLine") or 1)
        ranges.append((max(1, center - 160), min(len(lines), center + 160)))
    ranges.sort()
    merged: list[list[int]] = []
    for start, end in ranges:
        if merged and start <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])

    chunks: list[str] = []
    for start, end in merged:
        chunks.append(f"--- lines {start}-{end} ---")
        chunks.extend(f"{index}: {lines[index - 1]}" for index in range(start, end + 1))
    return "\n".join(chunks)


def parse_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("The model response did not contain a JSON object")
    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("The model response was not a JSON object")
    return parsed


def invoke_model(prompt: str, token: str) -> tuple[dict[str, Any], str, str]:
    errors: list[str] = []
    for endpoint in MODEL_ENDPOINTS:
        for model in MODEL_NAMES:
            payload_variants = (
                {
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior application-security engineer. "
                                "Return only strict JSON containing minimal, compiling source edits. "
                                "Eliminate the supplied CodeQL data flow rather than suppressing it."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0,
                    "max_tokens": 16000,
                    "response_format": {"type": "json_object"},
                },
                {
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior application-security engineer. "
                                "Return only strict JSON containing minimal source edits."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0,
                    "max_tokens": 16000,
                },
            )
            for payload in payload_variants:
                request = urllib.request.Request(
                    endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Accept": "application/json",
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "User-Agent": "toonspectrum-codeql-residual-remediation",
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(request, timeout=300) as response:
                        body = json.load(response)
                    content = body["choices"][0]["message"]["content"]
                    return parse_json_object(content), model, endpoint
                except Exception as error:  # noqa: BLE001 - preserve provider fallbacks
                    errors.append(f"{endpoint} {model}: {error}")
                    time.sleep(1)
    raise RuntimeError("All GitHub Models requests failed: " + " | ".join(errors[-10:]))


def apply_line_edits(path: Path, response: dict[str, Any]) -> int:
    edits = response.get("edits")
    if not isinstance(edits, list) or not edits:
        raise ValueError("The model returned no edits")

    original = path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    normalized: list[tuple[int, int, str]] = []
    for edit in edits:
        if not isinstance(edit, dict):
            raise ValueError("Each edit must be an object")
        start = int(edit["startLine"])
        end = int(edit["endLine"])
        replacement = edit["replacement"]
        if not isinstance(replacement, str):
            raise ValueError("Edit replacement must be a string")
        if start < 1 or end < start or end > len(lines):
            raise ValueError(f"Invalid edit range {start}-{end} for {len(lines)} lines")
        normalized.append((start, end, replacement))
    normalized.sort(key=lambda item: (item[0], item[1]))
    for previous, current in zip(normalized, normalized[1:]):
        if current[0] <= previous[1]:
            raise ValueError(f"Overlapping edits: {previous[:2]} and {current[:2]}")

    updated = list(lines)
    for start, end, replacement in reversed(normalized):
        replacement_lines = replacement.splitlines(keepends=True)
        if replacement and not replacement.endswith(("\n", "\r")) and end < len(lines):
            if replacement_lines:
                replacement_lines[-1] += "\n"
        updated[start - 1 : end] = replacement_lines
    candidate = "".join(updated)
    if candidate == original:
        raise ValueError("The edits did not change the file")
    path.write_text(candidate, encoding="utf-8")
    return len(normalized)


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def fix(findings: list[dict[str, Any]], token: str) -> list[str]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for finding in findings:
        grouped.setdefault(str(finding["path"]), []).append(finding)

    changed: list[str] = []
    for relative_path, file_findings in sorted(grouped.items()):
        target = (REPO_ROOT / relative_path).resolve()
        if target != REPO_ROOT and REPO_ROOT not in target.parents:
            raise RuntimeError(f"Unsafe CodeQL path: {relative_path}")
        if not target.is_file():
            raise RuntimeError(f"CodeQL path is not a file: {relative_path}")

        context = source_context(target, file_findings)
        prompt = f"""Fix every listed CodeQL security finding in this single repository file.

Repository file: {relative_path}
Findings:
{json.dumps(file_findings, ensure_ascii=False, indent=2)}

Exact current source context with 1-based line numbers:
{context}

Return strict JSON with exactly this shape:
{{
  "edits": [
    {{"startLine": 1, "endLine": 1, "replacement": "complete replacement text for this inclusive line range"}}
  ],
  "summary": "brief security rationale"
}}

Requirements:
- Line numbers are 1-based and inclusive; edits may not overlap.
- Make the smallest robust, compiling change that removes every listed flow in this file.
- Do not add CodeQL suppressions, query exclusions, false-positive comments, blanket exception handling, or behavior-degrading shortcuts.
- Preserve public interfaces when practical. When a public return type must change, keep compatibility or update all callers visible in this file.
- For randomness, use a cryptographically secure API.
- For URL/SSRF/redirect findings, parse once; allow only http/https as appropriate; reject credentials, control characters, protocol-relative URLs and ambiguous hosts; use exact host or dot-boundary suffix matching; revalidate redirect targets.
- For escaping, use a one-pass encoder, structured serializer, or character callback, not chained replacements.
- For regular-expression denial of service, replace the expression with deterministic parsing or explicitly bounded processing.
- For password or token storage, use a standard memory-hard/password KDF with a random salt and constant-time verification; retain safe migration compatibility where existing persisted hashes may exist.
- For client storage, do not persist raw authentication secrets or credentials.
- Return JSON only.
"""

        last_error: str | None = None
        for attempt in range(1, 4):
            try:
                extra = f"\nPrevious edit validation error: {last_error}" if last_error else ""
                response, model, endpoint = invoke_model(prompt + extra, token)
                edit_count = apply_line_edits(target, response)
                run(["git", "diff", "--check", "--", relative_path])
                print(
                    json.dumps(
                        {
                            "path": relative_path,
                            "model": model,
                            "endpoint": endpoint,
                            "edits": edit_count,
                            "summary": response.get("summary"),
                        },
                        ensure_ascii=False,
                    )
                )
                changed.append(relative_path)
                break
            except Exception as error:  # noqa: BLE001 - retry bounded model output
                run(["git", "checkout", "--", relative_path])
                last_error = str(error)
                if attempt == 3:
                    raise
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sarif-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fix", action="store_true")
    args = parser.parse_args()

    findings = extract_findings(args.sarif_root)
    args.output.write_text(json.dumps(findings, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"CODEQL_SECURITY_FINDINGS={len(findings)}")
    if not args.fix or not findings:
        return 0 if not findings else 2

    token = os.environ.get("GITHUB_MODELS_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_MODELS_TOKEN or GH_TOKEN is required")
    changed = fix(findings, token)
    if not changed:
        raise RuntimeError("Residual findings existed but no files were changed")
    print("CHANGED_FILES=" + json.dumps(changed, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

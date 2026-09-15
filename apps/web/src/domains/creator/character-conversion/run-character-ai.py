#!/usr/bin/env python3
"""Reviewed local-only adapters; no installer, paid API, arbitrary workflow nodes or global interrupt."""
import argparse
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

MAX_FILE = 16 * 1024 * 1024
VIEWS = {"front", "left", "back", "right"}
PROFILES = {"draft": (128, 8, 1024), "balanced": (256, 12, 1024), "detail": (384, 20, 2048)}
NODES = {"CheckpointLoaderSimple", "LoadImage", "VAEEncode", "CLIPTextEncode", "KSampler", "VAEDecode", "SaveImage", "ControlNetLoader", "ControlNetApplyAdvanced"}

def bounded_read(path, maximum=MAX_FILE):
    with path.open("rb") as handle:
        value = handle.read(maximum + 1)
    if len(value) > maximum:
        raise ValueError("File exceeds its size budget: " + path.name)
    return value

def read_kit(folder):
    root = Path(folder).resolve()
    manifest_path = root / "manifest.json"
    if manifest_path.is_symlink():
        raise ValueError("Manifest symlinks are not accepted")
    plan = json.loads(bounded_read(manifest_path, 128 * 1024))
    if not isinstance(plan, dict) or plan.get("schema") != "toonstudio-character-kit" or plan.get("version") != 1:
        raise ValueError("Unsupported kit schema")
    kind, engine, views = plan.get("kind"), plan.get("engine"), plan.get("views")
    if not isinstance(views, list) or not 1 <= len(views) <= 4 or any(not isinstance(v, str) or v not in VIEWS for v in views) or len(set(views)) != len(views):
        raise ValueError("Invalid or duplicate views")
    if kind == "shape":
        if engine not in {"triposr", "trellis"} or views[0] != "front" or (engine == "triposr" and len(views) != 1):
            raise ValueError("Invalid shape engine/reference set")
    elif kind != "image" or engine != "comfy-sdxl":
        raise ValueError("Unsupported inference route")
    checksums = plan.get("checksums")
    if not isinstance(checksums, dict) or not 1 <= len(checksums) <= 64:
        raise ValueError("Invalid file manifest")
    files, total = {}, 0
    for name, digest in checksums.items():
        if not re.fullmatch(r"(?:input|depth|passes|workflow)/[a-z0-9-]+\.(?:png|json)", name) or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("Unsafe file manifest entry")
        path = root / name
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError("File escapes the kit folder")
        content = bounded_read(path)
        total += len(content)
        if total > 96 * 1024 * 1024 or hashlib.sha256(content).hexdigest() != digest:
            raise ValueError("Kit exceeds its budget or a file was modified: " + name)
        files[name] = content
    settings = plan.get("settings")
    if not isinstance(settings, dict) or settings.get("quality") not in PROFILES:
        raise ValueError("Invalid quality profile")
    for name, low, high in [("seed", 0, 2147483647), ("strength", .15, .75), ("controlStrength", 0, 1.5)]:
        value = settings.get(name)
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high or (name == "seed" and type(value) is not int):
            raise ValueError("Invalid setting: " + name)
    for view in views:
        image = files.get("input/" + view + ".png", b"")
        if len(image) < 24 or image[:8] != b"\x89PNG\r\n\x1a\n" or not all(1 <= int.from_bytes(image[i:i+4], "big") <= 1024 for i in (16, 20)):
            raise ValueError("Expected a bounded PNG input")
    if kind == "shape" and len({checksums["input/" + v + ".png"] for v in views}) != len(views):
        raise ValueError("Duplicate images are not multiple viewpoints")
    return root, plan, files

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise ValueError("Inference server redirects are not allowed")

class Comfy:
    def __init__(self, server):
        url = urllib.parse.urlsplit(server)
        if url.scheme != "http" or url.hostname not in {"127.0.0.1", "::1"} or url.username or url.password or url.path not in {"", "/"} or url.query or url.fragment:
            raise ValueError("Use an explicit HTTP loopback ComfyUI server; remote/paid services are not accepted")
        _ = url.port
        self.server = server.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path, data=None, content_type="application/json", maximum=8*1024*1024):
        body = json.dumps(data).encode() if isinstance(data, dict) else data
        request = urllib.request.Request(self.server + path, data=body, headers={"Content-Type": content_type})
        with self.opener.open(request, timeout=30) as response:
            result = response.read(maximum + 1)
        if len(result) > maximum:
            raise ValueError("Inference response exceeded its budget")
        return result

    def json(self, path, data=None):
        return json.loads(self.request(path, data))

    def upload(self, content, name):
        boundary = "toonstudio" + uuid.uuid4().hex
        header = ('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="' + name + '"\r\nContent-Type: image/png\r\n\r\n').encode()
        body = header + content + ('\r\n--' + boundary + '--\r\n').encode()
        result = json.loads(self.request("/upload/image", body, "multipart/form-data; boundary=" + boundary))
        if result.get("name") != name or result.get("subfolder", "") != "" or result.get("type", "input") != "input":
            raise ValueError("Unexpected upload identity")
        return name

def validate_graph(graph, info, files):
    if not isinstance(graph, dict) or not 1 <= len(graph) <= 12 or not isinstance(info, dict):
        raise ValueError("Invalid graph or ComfyUI node registry")
    for identity, node in graph.items():
        if not re.fullmatch(r"[0-9]+", identity) or not isinstance(node, dict) or node.get("class_type") not in NODES or not isinstance(node.get("inputs"), dict):
            raise ValueError("Only reviewed native nodes are accepted")
        kind, inputs = node["class_type"], node["inputs"]
        schema = info.get(kind)
        if not isinstance(schema, dict):
            raise ValueError("Missing ComfyUI node: " + kind)
        fields = schema.get("input", {})
        required, optional = fields.get("required", {}), fields.get("optional", {})
        if any(key not in inputs for key in required) or any(key not in required and key not in optional for key in inputs):
            raise ValueError("ComfyUI input schema changed: " + kind)
        for key, value in inputs.items():
            if kind == "LoadImage" and key == "image":
                if value not in files or not re.fullmatch(r"(?:input|depth)/(?:front|left|back|right)\.png", value):
                    raise ValueError("Image must belong to this kit")
                continue
            spec = (required.get(key) or optional.get(key))[0]
            if isinstance(value, list):
                if len(value) != 2 or value[0] not in graph or type(value[1]) is not int or value[1] < 0:
                    raise ValueError("Invalid node connection")
                upstream = info.get(graph[value[0]].get("class_type"), {}).get("output", [])
                if value[1] >= len(upstream) or upstream[value[1]] != spec:
                    raise ValueError("Incompatible node connection")
            elif isinstance(spec, list):
                if value not in spec:
                    raise ValueError("Missing installed model or unsupported option: " + kind + "." + key)
            elif spec == "STRING":
                if not isinstance(value, str) or len(value) > 2000:
                    raise ValueError("Invalid text input")
            elif spec in {"INT", "FLOAT"}:
                if type(value) not in (int, float) or not math.isfinite(value) or (spec == "INT" and type(value) is not int):
                    raise ValueError("Invalid numeric input")
                definition = required.get(key) or optional.get(key)
                limits = definition[1] if len(definition) > 1 and isinstance(definition[1], dict) else {}
                if not limits.get("min", -math.inf) <= value <= limits.get("max", math.inf):
                    raise ValueError("Numeric input is outside the node budget")
            else:
                raise ValueError("Unexpected literal node input")
        if kind == "KSampler" and not (1 <= inputs["steps"] <= 50 and 1 <= inputs["cfg"] <= 10 and .15 <= inputs["denoise"] <= .75 and 0 <= inputs["seed"] <= 2147483647):
            raise ValueError("Sampler exceeds the character conversion budget")
        if kind == "ControlNetApplyAdvanced" and not (0 <= inputs["strength"] <= 1.5 and 0 <= inputs["start_percent"] <= inputs["end_percent"] <= 1):
            raise ValueError("Invalid depth control interval")
    if graph.get("8", {}).get("class_type") != "SaveImage" or sum(n["class_type"] == "SaveImage" for n in graph.values()) != 1:
        raise ValueError("Expected one reviewed image output")
    seen, active = set(), set()
    def visit(identity):
        if identity in active:
            raise ValueError("Cyclic workflow")
        if identity in seen:
            return
        active.add(identity)
        for value in graph[identity]["inputs"].values():
            if isinstance(value, list):
                visit(value[0])
        active.remove(identity)
        seen.add(identity)
    for identity in graph:
        visit(identity)

def write_receipt(output, receipt):
    target = output / "receipt.json"
    temporary = output / "receipt.pending.json"
    temporary.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(target)

def run_comfy(plan, files, args, output):
    client = Comfy(args.server)
    info = client.json("/object_info")
    graphs = {view: json.loads(files.get("workflow/" + view + ".json", b"null")) for view in plan["views"]}
    for graph in graphs.values():
        validate_graph(graph, info, files)
    if args.check:
        print("PREFLIGHT PASSED: native nodes and named models exist. No upload or inference was performed.")
        return
    run_id = str(uuid.uuid4())
    receipt = {"status": "preparing", "plan": plan, "runId": run_id, "jobs": {}}
    uploaded, prompt_id = {}, None
    try:
        for view, graph in graphs.items():
            for node in graph.values():
                if node["class_type"] == "LoadImage":
                    name = node["inputs"]["image"]
                    if name not in uploaded:
                        uploaded[name] = client.upload(files[name], "toon-character-" + run_id + "-" + name.replace("/", "-"))
                    node["inputs"]["image"] = uploaded[name]
            graph["8"]["inputs"]["filename_prefix"] = "toonstudio-character/" + run_id + "/" + view
            receipt["status"] = "submitting"
            receipt["jobs"][view] = {"status": "submitting", "graph": graph}
            write_receipt(output, receipt)
            # Never retry a submission automatically: response loss may mean the GPU job exists.
            queued = client.json("/prompt", {"prompt": graph, "client_id": run_id})
            prompt_id = queued.get("prompt_id")
            if not isinstance(prompt_id, str) or not re.fullmatch(r"[a-fA-F0-9-]{36}", prompt_id) or queued.get("node_errors"):
                raise ValueError("ComfyUI did not accept the workflow")
            receipt["jobs"][view].update(status="running", prompt_id=prompt_id)
            receipt["status"] = "running"
            write_receipt(output, receipt)
            deadline = time.monotonic() + 1800
            while True:
                history = client.json("/history/" + prompt_id).get(prompt_id, {})
                status = history.get("status", {})
                if status.get("status_str") == "error":
                    raise RuntimeError("GPU inference failed; inspect this prompt_id in ComfyUI")
                images = history.get("outputs", {}).get("8", {}).get("images", [])
                if images:
                    if len(images) != 1:
                        raise ValueError("Unexpected output image count")
                    image = images[0]
                    if image.get("type") != "output" or image.get("subfolder", "").replace("\\", "/") != "toonstudio-character/" + run_id or not re.fullmatch(view + r"_[A-Za-z0-9_.-]+\.png", image.get("filename", "")):
                        raise ValueError("Output does not belong to this job")
                    query = urllib.parse.urlencode({key: image[key] for key in ("filename", "subfolder", "type")})
                    png = client.request("/view?" + query, maximum=MAX_FILE)
                    if not png.startswith(b"\x89PNG\r\n\x1a\n"):
                        raise ValueError("Expected PNG inference output")
                    with (output / (view + ".png")).open("xb") as handle:
                        handle.write(png)
                    receipt["jobs"][view].update(status="completed", sha256=hashlib.sha256(png).hexdigest(), output=view + ".png")
                    write_receipt(output, receipt)
                    prompt_id = None
                    break
                if status.get("completed") or time.monotonic() > deadline:
                    raise TimeoutError("No image output. A running GPU job may continue; inspect receipt.json before retrying.")
                time.sleep(2)
        receipt["status"] = "completed"
        write_receipt(output, receipt)
    except BaseException:
        receipt["status"] = "interrupted-or-failed"
        write_receipt(output, receipt)
        if prompt_id:
            try:
                client.json("/queue", {"delete": [prompt_id]})
            except Exception:
                pass  # Never escalate to /interrupt: that could stop somebody else's job.
        raise

def run_shape(plan, files, args, output):
    engine = plan["engine"]
    packages = ["torch", "PIL", "tsr" if engine == "triposr" else "trellis"]
    missing = [name for name in packages if importlib.util.find_spec(name) is None]
    if missing:
        raise RuntimeError("Install the engine's official environment first. Missing: " + ", ".join(missing))
    if not args.model_dir and not args.allow_model_download:
        raise ValueError("Provide --model-dir or explicitly permit model downloads")
    if args.model_dir and not Path(args.model_dir).is_dir():
        raise ValueError("The model directory does not exist")
    if engine == "trellis" and (args.device != "cuda" or not args.allow_model_download):
        raise ValueError("TRELLIS needs CUDA and explicit --allow-model-download for auxiliary model initialization")
    if args.check:
        print("PREFLIGHT PASSED: Python packages and model path found. Weights/GPU inference not tested.")
        return
    if not args.allow_model_download:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch
    from PIL import Image
    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; no automatic CPU or paid-provider fallback")
    torch.manual_seed(plan["settings"]["seed"])
    resolution, steps, texture_size = PROFILES[plan["settings"]["quality"]]
    images = [Image.open(io.BytesIO(files["input/" + view + ".png"])).convert("RGBA") for view in plan["views"]]
    receipt = {"status": "running", "plan": plan, "engine": engine, "device": args.device, "torchVersion": torch.__version__}
    write_receipt(output, receipt)
    try:
        if engine == "triposr":
            from tsr.system import TSR
            model = TSR.from_pretrained(args.model_dir or "stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
            model.renderer.set_chunk_size(1024 if args.device == "cpu" else 8192)
            model.to(args.device)
            image = Image.alpha_composite(Image.new("RGBA", images[0].size, (128, 128, 128, 255)), images[0]).convert("RGB")
            with torch.inference_mode():
                codes = model([image], device=args.device)
                mesh = model.extract_mesh(codes, True, resolution=resolution)[0]
            mesh.export(str(output / "character.glb"), file_type="glb")
        else:
            from trellis.pipelines import TrellisImageTo3DPipeline
            from trellis.utils import postprocessing_utils
            pipeline = TrellisImageTo3DPipeline.from_pretrained(args.model_dir or "microsoft/TRELLIS-image-large")
            pipeline.cuda()
            params = {"seed": plan["settings"]["seed"], "sparse_structure_sampler_params": {"steps": steps, "cfg_strength": 7.5}, "slat_sampler_params": {"steps": steps, "cfg_strength": 3}}
            outputs = pipeline.run_multi_image(images, **params) if len(images) > 1 else pipeline.run(images[0], **params)
            glb = postprocessing_utils.to_glb(outputs["gaussian"][0], outputs["mesh"][0], simplify=.95, texture_size=texture_size)
            glb.export(str(output / "character.glb"))
        result = bounded_read(output / "character.glb", 64 * 1024 * 1024)
        if len(result) < 20 or result[:4] != b"glTF" or int.from_bytes(result[4:8], "little") != 2 or int.from_bytes(result[8:12], "little") != len(result):
            raise ValueError("The engine did not produce a valid GLB 2 container")
        receipt.update(status="completed", output="character.glb", sha256=hashlib.sha256(result).hexdigest())
        write_receipt(output, receipt)
    except BaseException:
        receipt["status"] = "interrupted-or-failed"
        write_receipt(output, receipt)
        raise
    finally:
        for image in images:
            image.close()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", nargs="?", default=".")
    parser.add_argument("--check", action="store_true", help="Check prerequisites without uploading images or running inference")
    parser.add_argument("--server", default="http://127.0.0.1:8188")
    parser.add_argument("--model-dir")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--allow-model-download", action="store_true")
    args = parser.parse_args()
    root, plan, files = read_kit(args.folder)
    output = None if args.check else root / ("output-" + uuid.uuid4().hex)
    if output is not None:
        output.mkdir(exist_ok=False)
    (run_shape if plan["kind"] == "shape" else run_comfy)(plan, files, args, output)
    if output is not None:
        print("Inference completed; verified output and receipt: " + str(output))

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Cancelled. A running GPU job may continue; check receipt.json before resubmitting.", file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        print("Conversion stopped: " + str(error) + "\nA lost submission response is not retried. Check any receipt.json before resubmitting.", file=sys.stderr)
        sys.exit(1)

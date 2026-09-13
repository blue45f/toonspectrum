"""Local protocol/security tests, not neural-model quality or GPU inference tests."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "apps/web/src/domains/creator/character-conversion/run-character-ai.py"
spec = importlib.util.spec_from_file_location("character_runner", SOURCE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
PNG = b"\x89PNG\r\n\x1a\n" + bytes(8) + (512).to_bytes(4, "big") * 2

def kit(root):
    (root / "input").mkdir()
    (root / "input/front.png").write_bytes(PNG)
    manifest = {"schema": "toonstudio-character-kit", "version": 1, "kind": "shape", "engine": "triposr", "views": ["front"], "settings": {"quality": "draft", "seed": 73, "strength": .35, "controlStrength": .8}, "checksums": {"input/front.png": hashlib.sha256(PNG).hexdigest()}}
    (root / "manifest.json").write_text(json.dumps(manifest))
    return manifest

def graph_and_schema():
    graph = {"2": {"class_type": "LoadImage", "inputs": {"image": "input/front.png"}}, "8": {"class_type": "SaveImage", "inputs": {"images": ["2", 0], "filename_prefix": "toonstudio-character/front"}}}
    schema = {"LoadImage": {"input": {"required": {"image": [["some-other-existing-image.png"]]}}, "output": ["IMAGE", "MASK"]}, "SaveImage": {"input": {"required": {"images": ["IMAGE"], "filename_prefix": ["STRING"]}}, "output": []}}
    return graph, schema

class KitBoundaryTests(unittest.TestCase):
    def test_valid_bounded_kit(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); kit(root)
            _, plan, files = runner.read_kit(root)
            self.assertEqual(plan["views"], ["front"])
            self.assertEqual(files["input/front.png"], PNG)

    def test_changed_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); kit(root); (root / "input/front.png").write_bytes(PNG + b"changed")
            with self.assertRaises(ValueError): runner.read_kit(root)

    def test_path_escape_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); manifest = kit(root)
            manifest["checksums"]["../private.png"] = "a" * 64
            (root / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaises(ValueError): runner.read_kit(root)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); kit(root); (root / "input/front.png").unlink()
            (root / "input/front.png").symlink_to(root / "manifest.json")
            with self.assertRaises(ValueError): runner.read_kit(root)

    def test_bad_settings_are_rejected(self):
        for value in [float("nan"), float("inf"), -1, 1.5, 2147483648, True]:
            with self.subTest(seed=value), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); manifest = kit(root); manifest["settings"]["seed"] = value
                (root / "manifest.json").write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): runner.read_kit(root)

class LocalExecutionTests(unittest.TestCase):
    def test_remote_and_ambiguous_servers_are_rejected(self):
        for server in ["https://127.0.0.1:8188", "http://localhost:8188", "http://evil.test", "http://127.0.0.1/a", "http://user@127.0.0.1", "http://127.0.0.1?x=1"]:
            with self.subTest(server=server), self.assertRaises(ValueError): runner.Comfy(server)
        self.assertEqual(runner.Comfy("http://127.0.0.1:8188").server, "http://127.0.0.1:8188")

    def test_preflight_accepts_input_before_upload(self):
        graph, schema = graph_and_schema()
        runner.validate_graph(graph, schema, {"input/front.png": PNG})

    def test_unknown_nodes_and_missing_inputs_fail_closed(self):
        graph, schema = graph_and_schema(); graph["2"]["class_type"] = "PartnerPaidApi"
        with self.assertRaises(ValueError): runner.validate_graph(graph, schema, {"input/front.png": PNG})
        graph, schema = graph_and_schema(); graph["2"]["inputs"]["image"] = "../private.png"
        with self.assertRaises(ValueError): runner.validate_graph(graph, schema, {})

    def test_incompatible_socket_is_rejected(self):
        graph, schema = graph_and_schema(); graph["8"]["inputs"]["images"] = ["2", 1]
        with self.assertRaises(ValueError): runner.validate_graph(graph, schema, {"input/front.png": PNG})

    def test_cycle_is_rejected(self):
        graph, schema = graph_and_schema(); schema["SaveImage"]["output"] = ["IMAGE"]
        graph["8"]["inputs"]["images"] = ["8", 0]
        with self.assertRaises(ValueError): runner.validate_graph(graph, schema, {"input/front.png": PNG})

    def test_check_performs_no_upload_or_submission(self):
        graph, schema = graph_and_schema()
        class CheckClient:
            def json(self, path):
                if path != "/object_info": raise AssertionError("Unexpected side effect")
                return schema
            def upload(self, *_): raise AssertionError("Upload must not run")
        with patch.object(runner, "Comfy", return_value=CheckClient()):
            runner.run_comfy({"views": ["front"]}, {"input/front.png": PNG, "workflow/front.json": json.dumps(graph).encode()}, argparse.Namespace(server="http://127.0.0.1:8188", check=True), None)

    def test_submission_failure_is_not_retried(self):
        graph, schema = graph_and_schema(); calls = []
        class FailClient:
            def json(self, path, data=None):
                calls.append(path)
                if path == "/object_info": return schema
                if path == "/prompt": raise TimeoutError("Submission response lost")
                raise AssertionError("Unexpected retry or global interrupt")
            def upload(self, content, name): return name
        with tempfile.TemporaryDirectory() as folder, patch.object(runner, "Comfy", return_value=FailClient()):
            output = Path(folder)
            with self.assertRaises(TimeoutError):
                runner.run_comfy({"views": ["front"]}, {"input/front.png": PNG, "workflow/front.json": json.dumps(graph).encode()}, argparse.Namespace(server="http://127.0.0.1:8188", check=False), output)
            receipt = json.loads((output / "receipt.json").read_text())
            self.assertEqual(receipt["status"], "interrupted-or-failed")
            self.assertEqual(calls.count("/prompt"), 1)

if __name__ == "__main__":
    unittest.main()

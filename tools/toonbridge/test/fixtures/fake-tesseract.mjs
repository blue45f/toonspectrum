#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("tesseract 99.0.0-toonbridge-test\n");
  process.exit(0);
}
const [input, outputBase] = args;
if (!input || !outputBase) {
  process.stderr.write("missing input or output base\n");
  process.exit(2);
}
const format = args.includes("tsv") ? "tsv" : args.includes("hocr") ? "hocr" : args.includes("pdf") ? "pdf" : "txt";
const output = `${outputBase}.${format}`;
mkdirSync(dirname(output), { recursive: true });
const source = readFileSync(input);
const text = source.toString("utf8");
const content = format === "tsv"
  ? `level\tpage_num\ttext\n1\t1\t${text}\n`
  : format === "hocr"
    ? `<html><body><span class="ocr_line">${text}</span></body></html>`
    : format === "pdf"
      ? Buffer.concat([Buffer.from("%PDF-1.4\n% ToonBridge test\n"), source])
      : `OCR:${text}`;
writeFileSync(output, content);
if (process.env.TOONBRIDGE_JOB_DIR) {
  writeFileSync(
    join(process.env.TOONBRIDGE_JOB_DIR, "logs", "test-environment.json"),
    JSON.stringify({
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_STATE_HOME: process.env.XDG_STATE_HOME,
      BLENDER_USER_CONFIG: process.env.BLENDER_USER_CONFIG,
      BLENDER_USER_SCRIPTS: process.env.BLENDER_USER_SCRIPTS,
      BLENDER_USER_DATAFILES: process.env.BLENDER_USER_DATAFILES,
      QGIS_CUSTOM_CONFIG_PATH: process.env.QGIS_CUSTOM_CONFIG_PATH,
      INKSCAPE_PROFILE_DIR: process.env.INKSCAPE_PROFILE_DIR,
    }),
  );
}

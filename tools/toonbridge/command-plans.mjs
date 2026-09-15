import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { operationById, resolvedToolBinary, toolById } from "./catalog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function boundedNumber(value, fallback, min, max, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}`);
  }
  return number;
}

function safeToken(value, fallback, pattern, label) {
  const token = value === undefined ? fallback : String(value);
  if (!pattern.test(token)) throw new TypeError(`${label} is invalid`);
  return token;
}

function firstInput(job) {
  const input = job.inputs.find((entry) => entry.uploaded && entry.localPath);
  if (!input) throw new Error("JOB_INPUT_MISSING");
  return input.localPath;
}

function output(jobDirectory, id, name, mime) {
  return Object.freeze({ id, name, mime, localPath: join(jobDirectory, "outputs", name) });
}

function plan(binary, args, outputs, timeoutMs = 60 * 60 * 1_000) {
  return Object.freeze({
    binary,
    args: Object.freeze(args.map(String)),
    outputs: Object.freeze(outputs),
    timeoutMs,
  });
}

function imageOutput(jobDirectory, name = "result.png") {
  return output(jobDirectory, "result", name, "image/png");
}

function gmicPlan(binary, job, jobDirectory) {
  const input = firstInput(job);
  const result = imageOutput(jobDirectory);
  const commands = {
    denoise: ["-denoise", "10,10,7,5,3,1,1"],
    halftone: ["-fx_halftone", "2,0,0,0,0,0,0,0"],
    "line-art": ["-fx_sketchbw", "2,45,180,30,1,0.5,0,0,0,24,0,0,1,4,0"],
  };
  const command = commands[job.operationId];
  if (!command) throw new Error("ADAPTER_NOT_IMPLEMENTED");
  return plan(binary, [input, ...command, "-o", result.localPath], [result]);
}

function geglPlan(binary, job, jobDirectory) {
  const input = firstInput(job);
  const result = imageOutput(jobDirectory);
  const allowed = new Set(["gegl:gaussian-blur", "gegl:shadows-highlights", "gegl:unsharp-mask"]);
  const operation = safeToken(job.options.operation, "gegl:gaussian-blur", /^[a-z0-9:-]+$/u, "GEGL operation");
  if (!allowed.has(operation)) throw new Error("GEGL_OPERATION_NOT_ALLOWED");
  const radius = boundedNumber(job.options.radius, 3, 0, 100, "GEGL radius");
  const args = operation === "gegl:gaussian-blur"
    ? [input, "--", operation, `std-dev-x=${radius}`, `std-dev-y=${radius}`, "-o", result.localPath]
    : [input, "--", operation, "-o", result.localPath];
  return plan(binary, args, [result]);
}

function tesseractPlan(binary, job, jobDirectory) {
  const input = firstInput(job);
  const language = safeToken(job.options.language, "kor+eng", /^[A-Za-z0-9_+.-]{1,80}$/u, "OCR language");
  const psm = Math.trunc(boundedNumber(job.options.pageSegmentation, 3, 0, 13, "OCR page segmentation"));
  const base = join(jobDirectory, "outputs", "ocr");
  const formats = {
    "ocr-text": { suffix: ".txt", mime: "text/plain", extra: [] },
    "ocr-tsv": { suffix: ".tsv", mime: "text/tab-separated-values", extra: ["tsv"] },
    "ocr-hocr": { suffix: ".hocr", mime: "text/html", extra: ["hocr"] },
    "ocr-pdf": { suffix: ".pdf", mime: "application/pdf", extra: ["pdf"] },
  };
  const format = formats[job.operationId];
  if (!format) throw new Error("ADAPTER_NOT_IMPLEMENTED");
  const result = output(jobDirectory, "result", `ocr${format.suffix}`, format.mime);
  return plan(binary, [input, base, "-l", language, "--psm", psm, ...format.extra], [result]);
}

function vectorPlan(toolId, binary, job, jobDirectory) {
  const input = firstInput(job);
  if (toolId === "potrace") {
    const result = output(jobDirectory, "result", "vectorized.svg", "image/svg+xml");
    const tolerance = boundedNumber(job.options.tolerance, 0.2, 0, 1, "Potrace tolerance");
    return plan(binary, [input, "-s", "-O", tolerance, "-o", result.localPath], [result]);
  }
  const extension = job.operationId === "export-pdf" ? "pdf" : job.operationId === "export-png" ? "png" : "svg";
  const mime = extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : "image/svg+xml";
  const result = output(jobDirectory, "result", `inkscape.${extension}`, mime);
  const args = [input, `--export-filename=${result.localPath}`];
  if (extension === "svg") args.push("--export-plain-svg");
  return plan(binary, args, [result]);
}

function animationPlan(toolId, binary, job, jobDirectory) {
  const input = firstInput(job);
  if (toolId === "natron") {
    const result = output(jobDirectory, "result", "natron.%04d.png", "image/png");
    return plan(binary, ["-b", input, "-o", result.localPath], [result]);
  }
  if (toolId === "opentoonz") {
    const result = output(jobDirectory, "result", "opentoonz.%04d.png", "image/png");
    return plan(binary, [input, "-o", result.localPath], [result]);
  }
  if (toolId === "synfig") {
    const result = output(jobDirectory, "result", "synfig.mp4", "video/mp4");
    const fps = boundedNumber(job.options.fps, 24, 1, 120, "Synfig fps");
    return plan(binary, [input, "-o", result.localPath, "--fps", fps], [result]);
  }
  throw new Error("ADAPTER_NOT_IMPLEMENTED");
}

function ffmpegPlan(binary, job, jobDirectory) {
  const input = firstInput(job);
  const common = ["-hide_banner", "-nostdin", "-y", "-i", input];
  if (job.operationId === "encode-mp4") {
    const result = output(jobDirectory, "result", "output.mp4", "video/mp4");
    return plan(binary, [...common, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", result.localPath], [result]);
  }
  if (job.operationId === "encode-webm") {
    const result = output(jobDirectory, "result", "output.webm", "video/webm");
    return plan(binary, [...common, "-c:v", "libvpx-vp9", "-c:a", "libopus", result.localPath], [result]);
  }
  if (job.operationId === "encode-gif") {
    const result = output(jobDirectory, "result", "output.gif", "image/gif");
    const fps = boundedNumber(job.options.fps, 12, 1, 30, "GIF fps");
    return plan(binary, [...common, "-vf", `fps=${fps},scale=1280:-1:flags=lanczos`, result.localPath], [result]);
  }
  if (job.operationId === "proxy-video") {
    const result = output(jobDirectory, "result", "proxy.mp4", "video/mp4");
    const width = Math.trunc(boundedNumber(job.options.width, 1280, 320, 3840, "Proxy width"));
    return plan(binary, [...common, "-vf", `scale=${width}:-2`, "-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-c:a", "aac", result.localPath], [result]);
  }
  if (job.operationId === "extract-frame") {
    const result = imageOutput(jobDirectory, "frame.png");
    const seconds = boundedNumber(job.options.seconds, 0, 0, 86_400, "Frame time");
    return plan(binary, ["-hide_banner", "-nostdin", "-y", "-ss", seconds, "-i", input, "-frames:v", "1", result.localPath], [result]);
  }
  throw new Error("ADAPTER_NOT_IMPLEMENTED");
}

function blenderPlan(binary, job, jobDirectory) {
  const input = firstInput(job);
  if (job.operationId === "render-scene") {
    const result = imageOutput(jobDirectory, "blender0001.png");
    return plan(binary, ["--background", input, "--render-output", join(jobDirectory, "outputs", "blender####"), "--render-format", "PNG", "--render-frame", "1"], [result]);
  }
  if (job.operationId === "line-art") {
    const result = imageOutput(jobDirectory, "line-art.png");
    const script = join(HERE, "adapters", "blender-line-art.py");
    return plan(binary, ["--background", input, "--python", script, "--", result.localPath], [result]);
  }
  if (job.operationId === "export-glb") {
    const result = output(jobDirectory, "result", "scene.glb", "model/gltf-binary");
    const script = join(HERE, "adapters", "blender-export-glb.py");
    return plan(binary, ["--background", input, "--python", script, "--", result.localPath], [result]);
  }
  throw new Error("ADAPTER_NOT_IMPLEMENTED");
}

function modelPlan(toolId, binary, job, jobDirectory) {
  const input = firstInput(job);
  if (toolId === "openscad") {
    const extension = job.operationId === "export-3mf" ? "3mf" : job.operationId === "export-svg" ? "svg" : "stl";
    const mime = extension === "svg" ? "image/svg+xml" : extension === "3mf" ? "model/3mf" : "model/stl";
    const result = output(jobDirectory, "result", `model.${extension}`, mime);
    return plan(binary, ["-o", result.localPath, input], [result]);
  }
  if (toolId === "qgis") {
    const result = output(jobDirectory, "result", "qgis-output.gpkg", "application/geopackage+sqlite3");
    const algorithm = safeToken(job.options.algorithm, "native:package", /^[a-z0-9:_-]{1,120}$/u, "QGIS algorithm");
    return plan(binary, ["run", algorithm, "--", `INPUT=${input}`, `OUTPUT=${result.localPath}`], [result]);
  }
  throw new Error("ADAPTER_NOT_IMPLEMENTED");
}

function ghostscriptPlan(binary, job, jobDirectory) {
  const input = firstInput(job);
  const result = output(jobDirectory, "result", "document.pdf", "application/pdf");
  const args = ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", `-sOutputFile=${result.localPath}`];
  if (job.operationId === "optimize-pdf") {
    args.push("-dPDFSETTINGS=/ebook");
  } else if (job.operationId === "nup-pdf") {
    throw new Error("ADAPTER_NOT_IMPLEMENTED");
  } else if (job.operationId !== "normalize-pdf") {
    throw new Error("ADAPTER_NOT_IMPLEMENTED");
  }
  args.push(input);
  return plan(binary, args, [result]);
}

function darktablePlan(binary, job, jobDirectory) {
  const input = firstInput(job);
  const result = imageOutput(jobDirectory, "developed.png");
  return plan(binary, [input, result.localPath, "--core", "--conf", "plugins/lighttable/export/icctype=3"], [result]);
}

function audioPlan(toolId, binary, job, jobDirectory) {
  const input = firstInput(job);
  if (toolId === "espeak-ng") {
    if (job.operationId === "phonemes") {
      const result = output(jobDirectory, "result", "phonemes.txt", "text/plain");
      return plan(binary, ["-q", "--pho", "-f", input, "--stdout"], [{ ...result, captureStdout: true }]);
    }
    const result = output(jobDirectory, "result", "speech.wav", "audio/wav");
    const voice = safeToken(job.options.voice, "ko", /^[A-Za-z0-9_+.-]{1,80}$/u, "Voice");
    const speed = Math.trunc(boundedNumber(job.options.speed, 175, 80, 450, "Speech speed"));
    return plan(binary, ["-v", voice, "-s", speed, "-f", input, "-w", result.localPath], [result]);
  }
  if (toolId === "rubberband") {
    const result = output(jobDirectory, "result", "audio.wav", "audio/wav");
    if (job.operationId === "time-stretch") {
      const ratio = boundedNumber(job.options.ratio, 1, 0.25, 4, "Time ratio");
      return plan(binary, ["--time", ratio, input, result.localPath], [result]);
    }
    if (job.operationId === "pitch-shift") {
      const semitones = boundedNumber(job.options.semitones, 0, -24, 24, "Pitch semitones");
      return plan(binary, ["--pitch", semitones, input, result.localPath], [result]);
    }
  }
  throw new Error("ADAPTER_NOT_IMPLEMENTED");
}

export function buildCommandPlan(job, jobDirectory, environment = process.env) {
  const tool = toolById(job.toolId);
  const operation = operationById(job.toolId, job.operationId);
  if (!tool || !operation) throw new Error("UNKNOWN_TOOL_OR_OPERATION");
  if (tool.deployment !== "local-toonbridge" || !operation.executable) {
    throw new Error("TOOL_NOT_EXECUTABLE");
  }
  if (["manual-adapter", "research-only"].includes(tool.maturity)) {
    throw new Error("TOOL_NOT_EXECUTABLE");
  }
  const binary = resolvedToolBinary(tool, environment);
  if (job.toolId === "gmic") return gmicPlan(binary, job, jobDirectory);
  if (job.toolId === "gegl") return geglPlan(binary, job, jobDirectory);
  if (job.toolId === "tesseract") return tesseractPlan(binary, job, jobDirectory);
  if (["potrace", "inkscape"].includes(job.toolId)) return vectorPlan(job.toolId, binary, job, jobDirectory);
  if (["natron", "opentoonz", "synfig"].includes(job.toolId)) return animationPlan(job.toolId, binary, job, jobDirectory);
  if (job.toolId === "ffmpeg") return ffmpegPlan(binary, job, jobDirectory);
  if (job.toolId === "blender") return blenderPlan(binary, job, jobDirectory);
  if (["openscad", "qgis"].includes(job.toolId)) return modelPlan(job.toolId, binary, job, jobDirectory);
  if (job.toolId === "ghostscript") return ghostscriptPlan(binary, job, jobDirectory);
  if (job.toolId === "darktable") return darktablePlan(binary, job, jobDirectory);
  if (["espeak-ng", "rubberband"].includes(job.toolId)) return audioPlan(job.toolId, binary, job, jobDirectory);
  throw new Error("ADAPTER_NOT_IMPLEMENTED");
}

export function outputDownloadName(outputEntry) {
  return basename(outputEntry.localPath);
}

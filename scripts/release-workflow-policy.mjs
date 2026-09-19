import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { parse } from "yaml";

// Inspect executable shell words, not YAML prose, comments, or heredoc examples.
// This is a static command scanner, not a shell evaluator: nothing is executed.
function shellCommands(source) {
  const commands = [];
  let words = [];
  let word = "";
  let quote = "";
  let heredoc = false;
  const delimiters = [];
  const flushWord = () => {
    if (!word) return;
    if (heredoc) {
      delimiters.push(word);
      heredoc = false;
    }
    words.push(word);
    word = "";
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "\\" && quote !== "'") {
      if (source[i + 1] !== "\n") word += source[i + 1] ?? "";
      i += 1;
    } else if (quote) {
      if (char === quote) quote = "";
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (source.startsWith("${{", i)) {
      const end = source.indexOf("}}", i + 3);
      if (end === -1) { word += source.slice(i); break; }
      word += source.slice(i, end + 2);
      i = end + 1;
    } else if (char === "#" && !word) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end - 1;
    } else if (source.startsWith("<<", i) && source[i + 2] !== "<") {
      flushWord();
      heredoc = true;
      i += source[i + 2] === "-" ? 2 : 1;
    } else if (/[\s;&|()]/u.test(char)) {
      flushWord();
      if (/[\n;&|()]/u.test(char) && words.length) {
        commands.push(words);
        words = [];
      }
      if (char === "\n") {
        for (const delimiter of delimiters.splice(0)) {
          while (i < source.length) {
            const end = source.indexOf("\n", i + 1);
            const stop = end === -1 ? source.length : end;
            const line = source.slice(i + 1, stop).replace(/^\t+/u, "");
            i = stop;
            if (line === delimiter) break;
          }
        }
      }
    } else {
      word += char;
    }
  }
  flushWord();
  if (words.length) commands.push(words);
  return commands;
}

function expand(word, environment) {
  return word.replace(/\$\{\{\s*env\.([\w]+)\s*\}\}|\$\{(\w+)\}|\$(\w+)/gu,
    (original, a, b, c) => typeof environment[a ?? b ?? c] === "string"
      ? environment[a ?? b ?? c] : original);
}

function dryRun(args) {
  // A flag in another command, a filename, or --dry-run=false is not a dry run.
  let dry = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--dry-run=")) dry = args[i] === "--dry-run=true";
    if (args[i] === "--dry-run") dry = args[i + 1] !== "false";
    if (args[i] === "--no-dry-run") dry = false;
  }
  return dry;
}

function commandPositionals(args, valueOptions) {
  const positionals = [...args];
  while (positionals[0]?.startsWith("-")) {
    const option = positionals.shift();
    if (valueOptions.includes(option)) positionals.shift();
  }
  return positionals;
}

function renderRequest(name, args) {
  if (!["curl", "wget", "http", "https", "Invoke-WebRequest", "Invoke-RestMethod"].includes(name)) return false;
  const hook = args.some((arg) => /^https:\/\/api\.render\.com\/deploy\//iu.test(arg)
    || /^\$(?:\{\{\s*(?:secrets|env)\.)?\{?\w*(?:RENDER\w*HOOK|DEPLOY\w*HOOK)\w*(?:\}|\s)*$/u.test(arg));
  if (hook) return true;
  let method = ["http", "https"].includes(name) && /^(?:POST|PUT|PATCH)$/iu.test(args[0] ?? "") ? args[0] : "GET";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (["-X", "--request", "-Method"].includes(arg)) method = args[++i] ?? "";
    else if (/^(?:-X.|--request=)/u.test(arg)) method = arg.replace(/^(?:-X|--request=)/u, "");
    else if (/^(?:-d(?:[^-]|$)|--(?:data(?:-raw|-binary|-urlencode)?|json|post-data|post-file)(?:=|$))/u.test(arg)) {
      if (method === "GET") method = "POST";
    }
  }
  return /^(?:POST|PUT|PATCH)$/iu.test(method)
    && args.some((arg) => /^https:\/\/api\.render\.com\/v1\/services\/[^/\s]+\/deploys(?:[/?]|$)/iu
      .test(arg.replace(/\$\{\{[^}]*\}\}/gu, "workflow-expression")));
}

function providerCommand(words) {
  const [executable, ...args] = words;
  const name = basename(executable ?? "").replace(/@[^@/]+$/u, "");
  if (["wrangler", "vercel", "vc", "render"].includes(name)
    && (args.includes("--help") || args.includes("-h"))) return null;
  if (name === "wrangler") {
    const positionals = commandPositionals(args, ["--config", "-c", "--cwd", "--env", "-e"]);
    const publishes = ["deploy", "publish", "rollback"].includes(positionals[0])
      || positionals[0] === "pages" && positionals[1] === "deploy"
      || positionals[0] === "versions" && ["deploy", "upload"].includes(positionals[1]);
    if (publishes && !dryRun(args)) return "Cloudflare";
  }
  if (name === "vercel" || name === "vc") {
    const [command] = commandPositionals(args, ["--token", "-t", "--scope", "-S", "--cwd", "--local-config", "--global-config"]);
    if (!command || ["deploy", "promote", "redeploy", "rollback", "alias"].includes(command)
      || command.startsWith(".") || command.startsWith("/")
      || command !== "build" && args.some((arg) => arg === "--prod" || arg === "--target=production")) {
      return "Vercel";
    }
  }
  if (name === "render") {
    const [command, subcommand] = commandPositionals(args, ["--output", "-o"]);
    if ((["deploy", "trigger"].includes(command) || command === "deploys" && subcommand === "create")
      && !dryRun(args)) return "Render";
  }
  const script = ["node", "nodejs", "tsx"].includes(name)
    ? args.find((arg) => /\.(?:mjs|mts)$/u.test(arg)) : executable;
  if (["deploy-cloudflare-static.mjs", "sync-cloudflare-r2-assets.mts"].includes(basename(script ?? ""))
    && args.includes("--production")) return "Cloudflare";
  if (renderRequest(name, args)) return "Render";
  return null;
}

function publishers(source, context, seen = new Set()) {
  const found = new Set();
  const environment = { ...context.environment };
  for (let words of shellCommands(source)) {
    while (["if", "then", "elif", "do", "!", "command", "exec", "sudo", "env"].includes(words[0])) words.shift();
    if (words[0] === "export") words.shift();
    while (/^[A-Za-z_]\w*=/u.test(words[0] ?? "")) {
      const assignment = words.shift();
      const equal = assignment.indexOf("=");
      environment[assignment.slice(0, equal)] = expand(assignment.slice(equal + 1), environment);
    }
    words = words.map((word) => expand(word, environment));
    if (!words.length) continue;
    const name = basename(words[0]);
    if (["bash", "sh", "zsh"].includes(name) && words.some((word) => /^-[a-z]*c[a-z]*$/u.test(word))) {
      const index = words.findIndex((word) => /^-[a-z]*c[a-z]*$/u.test(word));
      for (const provider of publishers(words[index + 1] ?? "", { ...context, environment }, seen)) found.add(provider);
      continue;
    }
    if (["pnpm", "npm", "npx"].includes(name)) {
      const args = words.slice(1);
      let directory = context.directory;
      while (args[0]?.startsWith("-")) {
        const option = args.shift();
        if (["-C", "--dir", "--prefix"].includes(option)) directory = resolve(directory, args.shift() ?? ".");
        else if (["--filter", "-F", "--workspace"].includes(option)) args.shift();
        else if (["-w", "--workspace-root"].includes(option)) directory = context.root;
        else if (/^(?:--dir|--prefix)=/u.test(option)) directory = resolve(directory, option.split("=")[1]);
      }
      if (["exec", "dlx"].includes(args[0]) || name === "npx") {
        if (name !== "npx") args.shift();
        if (args[0] === "--") args.shift();
        words = args;
      } else {
        if (args[0] === "run" || args[0] === "run-script") args.shift();
        while (args[0]?.startsWith("--")) args.shift();
        const scriptName = args.shift();
        const manifest = resolve(directory, "package.json");
        const key = `${manifest}:${scriptName}`;
        if (!relative(context.root, manifest).startsWith("..") && existsSync(manifest) && !seen.has(key)) {
          const script = JSON.parse(readFileSync(manifest, "utf8")).scripts?.[scriptName];
          if (typeof script === "string") {
            // Append literal arguments as shell words, preserving quoting and command boundaries.
            const forwarded = args.filter((arg, index) => index !== 0 || arg !== "--")
              .map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
            for (const provider of publishers(`${script} ${forwarded}`, { ...context, directory, environment }, new Set([...seen, key]))) found.add(provider);
          }
        }
        continue;
      }
    }
    // Only actual executable positions are classified; echo/printf/grep arguments are prose.
    if (["echo", "printf", "grep", "cat"].includes(basename(words[0] ?? ""))) continue;
    const provider = providerCommand(words);
    if (provider) found.add(provider);
  }
  return found;
}

export function validateReleaseWorkflows(root) {
  const issues = [];
  const directory = resolve(root, ".github/workflows");
  if (!existsSync(directory)) return issues;
  for (const file of readdirSync(directory).filter((name) => /\.ya?ml$/iu.test(name))) {
    const path = `.github/workflows/${file}`;
    try {
      const workflow = parse(readFileSync(resolve(directory, file), "utf8"));
      // No trigger, approval variable, environment, or manual dispatch exempts a CI publisher.
      for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          const context = {
            root,
            directory: resolve(root, step["working-directory"] ?? job.defaults?.run?.["working-directory"] ?? workflow.defaults?.run?.["working-directory"] ?? "."),
            environment: { ...workflow.env, ...job.env, ...step.env },
          };
          const found = publishers(typeof step.run === "string" ? step.run : "", context);
          const action = (step.uses ?? "").split("@")[0].toLowerCase();
          if (action === "cloudflare/wrangler-action") {
            for (const command of (step.with?.command ?? "deploy").split("\n")) {
              for (const provider of publishers(`wrangler ${command}`, context)) found.add(provider);
            }
          } else if (action === "cloudflare/pages-action") found.add("Cloudflare");
          else if (/(?:^|\/)vercel-action$/u.test(action)) found.add("Vercel");
          else if (/(?:^|\/)(?:deploy-to-render|render-deploy|render-deploy-action)$/u.test(action)) found.add("Render");
          for (const provider of found) issues.push(`${path} jobs.${jobName}.steps[${index}]: CI production publisher is forbidden (${provider})`);
        }
      }
    } catch (error) {
      issues.push(`${path}: cannot inspect release policy: ${error.message}`);
    }
  }
  return issues;
}

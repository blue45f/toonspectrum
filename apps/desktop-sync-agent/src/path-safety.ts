import path from "node:path";

export function safeBindingRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  if (resolved === path.parse(resolved).root) {
    throw new Error("desktop sync binding cannot target a filesystem root");
  }
  return resolved;
}

export function safeRelativePath(rootPath: string, absolutePath: string): string {
  const root = safeBindingRoot(rootPath);
  const absolute = path.resolve(absolutePath);
  const relative = path.relative(root, absolute);
  if (
    relative.length === 0
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("path escapes desktop sync binding root");
  }
  return relative.split(path.sep).join("/");
}

export function resolveBoundPath(rootPath: string, relativePath: string): string {
  if (
    relativePath.length === 0
    || relativePath.startsWith("/")
    || relativePath.includes("\\")
    || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("invalid desktop sync relative path");
  }
  const root = safeBindingRoot(rootPath);
  return path.resolve(root, ...relativePath.split("/"));
}

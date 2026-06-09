export function normalizeOpenClawBaseDir(path: string) {
  const trimmed = path.trim()
  if (!trimmed) {
    return trimmed
  }

  const separator = trimmed.includes("/") && !trimmed.includes("\\") ? "/" : "\\"
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, "")
  const leaf = withoutTrailingSeparators.split(/[\\/]+/).pop()

  if (leaf?.toLowerCase() === "openclaw") {
    return withoutTrailingSeparators
  }

  return `${withoutTrailingSeparators}${withoutTrailingSeparators.endsWith(":") ? "\\" : separator}OpenClaw`
}

export function safeRedirectPath(path: unknown, fallback = "/dashboard") {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }
  return path;
}

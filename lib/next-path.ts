/** Only allow redirects to our own pages. */
export function safeNext(raw: string | string[] | undefined, fallback: string) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback;
}

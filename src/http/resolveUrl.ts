export function resolveMaybeRelativeUrl(baseUrl: string, url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base.length === 0) return trimmed;

  if (trimmed.startsWith("/")) return `${base}${trimmed}`;
  return `${base}/${trimmed}`;
}

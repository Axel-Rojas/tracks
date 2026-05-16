// Browser: relative URL (served by Next.js from public/)
// Client components use rawUrl() for asset paths and fetchJson() for data.
export function rawUrl(path: string): string {
  return `/${path}`
}

/**
 * Fetch JSON from a relative URL (client-side).
 */
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

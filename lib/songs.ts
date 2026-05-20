const R2_BASE = process.env.NEXT_PUBLIC_R2_URL

export function rawUrl(path: string): string {
  return R2_BASE ? `${R2_BASE}/${path}` : `/${path}`
}

/**
 * Fetch JSON from a relative URL (client-side).
 */
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

// Songs live in public/songs/ — served locally by Next.js at /songs/<path>
// Server Components need an absolute URL; the browser can use a relative one.
export function rawUrl(path: string): string {
  const base =
    typeof window === 'undefined'
      ? `http://localhost:${process.env.PORT ?? 3000}`
      : ''
  return `${base}/${path}`
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(rawUrl(path))
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

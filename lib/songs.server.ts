import 'server-only'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * Read a JSON file from public/ on the server (filesystem).
 * Works during static generation, ISR, and runtime — no HTTP request needed.
 */
export async function readJsonFromPublic<T>(path: string): Promise<T> {
  const filePath = join(process.cwd(), 'public', path)
  const raw = await readFile(filePath, 'utf-8')
  return JSON.parse(raw) as T
}

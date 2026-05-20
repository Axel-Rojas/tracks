/**
 * Uploads all MP3 files from public/songs/ to Cloudflare R2.
 * Keys match the paths stored in Convex: songs/{slug}/Track.mp3
 * Skips files already uploaded. Safe to re-run.
 *
 * Usage:
 *   npx tsx --env-file .env.local scripts/upload-to-r2.ts
 *
 * Required env vars in .env.local:
 *   CF_ACCOUNT_ID=a94829a893e90c8549949fbe19e212f0
 *   CF_R2_ACCESS_KEY_ID=<from Manage R2 API Tokens>
 *   CF_R2_SECRET_ACCESS_KEY=<from Manage R2 API Tokens>
 */
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { r2, R2_BUCKET, uploadToR2 } from '../lib/r2'

if (!process.env.CF_ACCOUNT_ID || !process.env.CF_R2_ACCESS_KEY_ID || !process.env.CF_R2_SECRET_ACCESS_KEY) {
  throw new Error('Faltan variables de entorno: CF_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY')
}

async function exists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function main() {
  const songsDir = join(process.cwd(), 'public', 'songs')
  const slugs = await readdir(songsDir)

  const files: { local: string; key: string }[] = []
  for (const slug of slugs) {
    const dir = join(songsDir, slug)
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.mp3')) continue
      files.push({ local: join(dir, entry), key: `songs/${slug}/${entry}` })
    }
  }

  console.log(`Encontrados ${files.length} archivos MP3\n`)

  let uploaded = 0
  let skipped = 0
  let failed = 0

  for (const { local, key } of files) {
    if (await exists(key)) {
      console.log(`  →  ${key} (ya existe, saltado)`)
      skipped++
      continue
    }
    try {
      const body = await readFile(local)
      await uploadToR2(key, body, 'audio/mpeg')
      console.log(`  ✓  ${key}`)
      uploaded++
    } catch (err) {
      console.error(`  ✗  ${key}: ${err}`)
      failed++
    }
  }

  console.log(`\nListo: ${uploaded} subidos, ${skipped} saltados, ${failed} errores`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

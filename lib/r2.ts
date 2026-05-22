import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

export const R2_BUCKET = 'tracks-app'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!,
  },
})

export async function uploadToR2(key: string, data: Buffer, contentType: string, cacheControl = 'public, max-age=31536000, immutable'): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  )
}

export async function getFromR2(key: string): Promise<Buffer | null> {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    if (!res.Body) return null
    return Buffer.from(await res.Body.transformToByteArray())
  } catch (err: unknown) {
    const code = (err as { Code?: string; name?: string })
    if (code.Code === 'NoSuchKey' || code.name === 'NoSuchKey') return null
    throw err
  }
}

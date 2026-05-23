import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getPresignedUploadUrl } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const { secret } = await req.json() as { secret?: string }

  if (!process.env.STUDIO_SECRET || secret !== process.env.STUDIO_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobId = crypto.randomUUID()
  const key = `tmp/${jobId}.mp3`
  const uploadUrl = await getPresignedUploadUrl(key, 'audio/mpeg')

  return NextResponse.json({ uploadUrl, key, jobId })
}

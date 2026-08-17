import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getPresignedUploadUrl } from '@/lib/r2'

export async function POST() {
  const jobId = crypto.randomUUID()
  const key = `tmp/${jobId}.mp3`
  const uploadUrl = await getPresignedUploadUrl(key, 'audio/mpeg')

  return NextResponse.json({ uploadUrl, key, jobId })
}

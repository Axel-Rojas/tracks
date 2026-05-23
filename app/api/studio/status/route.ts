import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getFromR2 } from '@/lib/r2'
import type { JobStatus } from '@/lib/types'

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId || !/^[0-9a-f-]{36}$/.test(jobId)) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 })
  }

  const buf = await getFromR2(`tmp/jobs/${jobId}.json`)
  if (!buf) {
    return NextResponse.json({ status: 'pending' } satisfies JobStatus)
  }

  try {
    const status = JSON.parse(buf.toString()) as JobStatus
    if (status.status === 'done') {
      revalidatePath('/', 'page')
      revalidatePath('/songs/[slug]', 'page')
    }
    return NextResponse.json(status)
  } catch {
    return NextResponse.json({ status: 'pending' } satisfies JobStatus)
  }
}

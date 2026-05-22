import { notFound } from 'next/navigation'
import StudioClient from './StudioClient'

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
  const secret = process.env.STUDIO_SECRET
  if (!secret || key !== secret) notFound()
  return <StudioClient studioKey={secret} />
}

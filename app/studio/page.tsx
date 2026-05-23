import StudioClient from './StudioClient'

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key } = await searchParams
  const isDev = process.env.NODE_ENV === 'development'
  const youtubeEnabled = isDev || key === process.env.STUDIO_SECRET
  return <StudioClient youtubeEnabled={youtubeEnabled} isDev={isDev} />
}

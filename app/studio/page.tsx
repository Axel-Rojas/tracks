import StudioClient from './StudioClient'

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key } = await searchParams
  const youtubeEnabled =
    process.env.NODE_ENV === 'development' || key === process.env.STUDIO_SECRET
  return <StudioClient youtubeEnabled={youtubeEnabled} />
}

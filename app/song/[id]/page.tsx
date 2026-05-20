import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function OldSongPage({ params }: Props) {
  const { id } = await params
  redirect(`/songs/${id}`)
}

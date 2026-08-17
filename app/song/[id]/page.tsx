import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

// Ruta vieja: solo redirige, así que no tiene shell para pintar al instante.
export const instant = false

export default async function OldSongPage({ params }: Props) {
  const { id } = await params
  redirect(`/songs/${id}`)
}

import StudioClient from './StudioClient'

export default function StudioPage() {
  // La descarga desde YouTube es solo local: en prod se sube el MP3 a R2.
  const isDev = process.env.NODE_ENV === 'development'
  return <StudioClient isDev={isDev} />
}

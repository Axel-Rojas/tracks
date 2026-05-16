import { notFound } from 'next/navigation'
import StudioClient from './StudioClient'

export default function StudioPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <StudioClient />
}

'use client'

import { useEffect } from 'react'

export default function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.error('SW registration failed:', err))
    }
  }, [])

  return null
}

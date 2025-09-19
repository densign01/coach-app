'use client'

import type { ReactNode } from 'react'

import { CoachProvider } from '@/lib/state/coach-store'
import { ThemeProvider } from '@/components/theme-provider'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <CoachProvider>{children}</CoachProvider>
    </ThemeProvider>
  )
}

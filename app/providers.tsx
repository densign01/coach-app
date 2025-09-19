'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useSessionContext } from '@supabase/auth-helpers-react'

import { CoachProvider, useCoachStore } from '@/lib/state/coach-store'
import { ThemeProvider } from '@/components/theme-provider'
import { SupabaseProvider } from './supabase-provider'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <SupabaseProvider>
        <CoachProvider>
          <CoachSessionSync>{children}</CoachSessionSync>
        </CoachProvider>
      </SupabaseProvider>
    </ThemeProvider>
  )
}

interface CoachSessionSyncProps {
  children: ReactNode
}

function CoachSessionSync({ children }: CoachSessionSyncProps) {
  const { session, isLoading } = useSessionContext()
  const { dispatch } = useCoachStore()

  useEffect(() => {
    dispatch({ type: 'setUser', userId: session?.user?.id ?? null })
  }, [dispatch, session?.user?.id])

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading your coach...</div>
  }

  return <>{children}</>
}

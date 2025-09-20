'use client'

import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'

import type { Database } from './schema'

let browserClient: ReturnType<typeof createPagesBrowserClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient

  browserClient = createPagesBrowserClient<Database>()

  return browserClient
}

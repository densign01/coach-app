'use client'

import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs'

import type { Database } from './schema'

let browserClient: ReturnType<typeof createBrowserSupabaseClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient

  browserClient = createBrowserSupabaseClient<Database>()

  return browserClient
}

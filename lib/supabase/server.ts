import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

import type { Database } from './schema'

export function getSupabaseRouteClient() {
  return createRouteHandlerClient<Database>({ cookies })
}

import { NextResponse } from 'next/server'

import { getSupabaseServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.draftId || !body?.meal) {
    return NextResponse.json({ error: 'Missing draftId or meal payload' }, { status: 400 })
  }

  const meal = body.meal
  const userId = body.userId ?? 'local-user'
  const supabase = tryGetServiceClient()

  if (supabase) {
    // Fire-and-forget persistence; failures fall back to local state.
    const dayId = meal.dayId ?? `${userId}-${meal.date}`

    await supabase
      .from('days')
      .upsert({ id: dayId, user_id: userId, date: meal.date })
      .throwOnError()

    await supabase
      .from('meals')
      .upsert({
        id: meal.id,
        day_id: dayId,
        type: meal.type,
        items_json: meal.items,
        macros_json: meal.macros,
        source: 'est',
      })
      .throwOnError()
  }

  return NextResponse.json({ status: 'ok', meal })
}

function tryGetServiceClient() {
  try {
    return getSupabaseServiceRoleClient()
  } catch (error) {
    console.warn('Supabase service client unavailable, skipping persistence', error)
    return null
  }
}

import { NextResponse } from 'next/server'

import { getSupabaseServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.meal) {
    return NextResponse.json({ error: 'Missing meal payload' }, { status: 400 })
  }

  const supabase = tryGetServiceClient()
  if (supabase) {
    const { meal, userId = 'local-user' } = body
    const dayId = meal.dayId ?? `${userId}-${meal.date}`

    await supabase
      .from('days')
      .upsert({ id: dayId, user_id: userId, date: meal.date })
      .throwOnError()

    await supabase
      .from('meals')
      .insert({
        id: meal.id,
        day_id: dayId,
        type: meal.type,
        items_json: meal.items,
        macros_json: meal.macros,
        source: meal.source ?? 'est',
      })
      .throwOnError()
  }

  return NextResponse.json({ status: 'ok' })
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.meal?.id) {
    return NextResponse.json({ error: 'Missing meal id' }, { status: 400 })
  }

  const supabase = tryGetServiceClient()
  if (supabase) {
    const { meal } = body
    await supabase
      .from('meals')
      .update({
        items_json: meal.items,
        macros_json: meal.macros,
        type: meal.type,
      })
      .eq('id', meal.id)
      .throwOnError()
  }

  return NextResponse.json({ status: 'ok' })
}

function tryGetServiceClient() {
  try {
    return getSupabaseServiceRoleClient()
  } catch (error) {
    console.warn('Supabase service client unavailable, skipping persistence', error)
    return null
  }
}

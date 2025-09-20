import { NextResponse } from 'next/server'

import { getSupabaseRouteClient } from '@/lib/supabase/server'
import { buildDayId } from '@/lib/utils'

function normalizeMealSource(source: string | null | undefined): 'api' | 'vision' | 'est' {
  switch (source) {
    case 'vision':
      return 'vision'
    case 'api':
      return 'api'
    case 'est':
      return 'est'
    case 'manual':
    case 'text':
      return 'api'
    default:
      return 'est'
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.meal) {
    return NextResponse.json({ error: 'Missing meal payload' }, { status: 400 })
  }

  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const meal = body.meal
  const dayId = buildDayId(user.id, meal.date)

  const { error: dayError } = await supabase
    .from('days')
    .upsert({ id: dayId, user_id: user.id, date: meal.date })

  if (dayError) {
    console.error('[api/meal POST] failed to upsert day', dayError)
    return NextResponse.json({ error: 'Failed to save meal' }, { status: 500 })
  }

  const { error: insertError } = await supabase
    .from('meals')
    .insert({
      id: meal.id,
      day_id: dayId,
      type: meal.type,
      items_json: meal.items,
      macros_json: meal.macros,
      source: normalizeMealSource(meal.source),
    })

  if (insertError) {
    console.error('[api/meal POST] failed to insert meal', insertError)
    return NextResponse.json({ error: 'Failed to save meal' }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok' })
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.meal?.id) {
    return NextResponse.json({ error: 'Missing meal id' }, { status: 400 })
  }

  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { meal } = body
  const { error } = await supabase
    .from('meals')
    .update({
      items_json: meal.items,
      macros_json: meal.macros,
      type: meal.type,
    })
    .eq('id', meal.id)

  if (error) {
    console.error('[api/meal PUT] failed to update meal', error)
    return NextResponse.json({ error: 'Failed to update meal' }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok' })
}

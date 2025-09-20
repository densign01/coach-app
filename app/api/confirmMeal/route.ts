import { NextResponse } from 'next/server'

import { getSupabaseRouteClient } from '@/lib/supabase/server'
import { buildDayId } from '@/lib/utils'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  console.log('[api/confirmMeal] Received body:', JSON.stringify(body, null, 2))

  if (!body?.draftId || !body?.meal) {
    console.log('[api/confirmMeal] Missing draftId or meal payload')
    return NextResponse.json({ error: 'Missing draftId or meal payload' }, { status: 400 })
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
  console.log('[api/confirmMeal] Processing meal:', JSON.stringify(meal, null, 2))
  console.log('[api/confirmMeal] Day ID:', dayId)

  const { error: dayError } = await supabase
    .from('days')
    .upsert({ id: dayId, user_id: user.id, date: meal.date })

  if (dayError) {
    console.error('[api/confirmMeal] failed to upsert day', dayError)
    return NextResponse.json({ error: 'Failed to save meal' }, { status: 500 })
  }

  const { data: upsertedMeal, error: mealError } = await supabase
    .from('meals')
    .upsert({
      id: meal.id,
      day_id: dayId,
      type: meal.type,
      items_json: meal.items,
      macros_json: meal.macros,
      source: meal.source ?? 'text',
    })
    .select('*')
    .maybeSingle()

  if (mealError) {
    console.error('[api/confirmMeal] failed to upsert meal', mealError)
    return NextResponse.json({ error: 'Failed to save meal' }, { status: 500 })
  }

  return NextResponse.json({
    status: 'ok',
    meal: {
      ...meal,
      dayId,
      createdAt: upsertedMeal?.created_at ?? meal.createdAt,
    },
    userId: user.id,
  })
}

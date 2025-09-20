import { NextRequest, NextResponse } from 'next/server'

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

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'Missing date query parameter' }, { status: 400 })
  }

  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dayId = buildDayId(user.id, date)

  try {
    const dayRecord = await fetchOrCreateDay(supabase, dayId, user.id, date)
    const meals = await fetchMeals(supabase, dayId, date)
    const workouts = await fetchWorkouts(supabase, dayId, date)

    return NextResponse.json({
      dayId,
      userId: user.id,
      date,
      targets: dayRecord?.targets_json ?? null,
      meals,
      workouts,
    })
  } catch (error) {
    console.error('[api/day] Failed to fetch day snapshot', error)
    return NextResponse.json({ error: 'Failed to fetch day snapshot' }, { status: 500 })
  }
}

async function fetchOrCreateDay(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  dayId: string,
  userId: string,
  date: string,
) {
  const { data, error, status } = await supabase
    .from('days')
    .select('*')
    .eq('id', dayId)
    .maybeSingle()

  if (error && status !== 406) {
    throw error
  }

  if (data) {
    return data
  }

  const { data: inserted, error: insertError } = await supabase
    .from('days')
    .upsert({ id: dayId, user_id: userId, date })
    .select('*')
    .maybeSingle()

  if (insertError) {
    throw insertError
  }

  return inserted
}

async function fetchMeals(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  dayId: string,
  date: string,
) {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('day_id', dayId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((meal) => ({
    id: meal.id,
    dayId,
    date,
    type: meal.type,
    items: Array.isArray(meal.items_json) ? (meal.items_json as string[]) : [],
    macros: {
      calories: Number(meal.macros_json?.calories ?? 0),
      protein: Number(meal.macros_json?.protein ?? 0),
      fat: Number(meal.macros_json?.fat ?? 0),
      carbs: Number(meal.macros_json?.carbs ?? 0),
    },
    source: normalizeMealSource(meal.source),
    createdAt: meal.created_at ?? new Date().toISOString(),
  }))
}

async function fetchWorkouts(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  dayId: string,
  date: string,
) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('day_id', dayId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((workout) => ({
    id: workout.id,
    dayId,
    date,
    type: workout.type,
    minutes: workout.minutes ?? 0,
    intensity: workout.raw_text?.toLowerCase().includes('easy')
      ? 'easy'
      : workout.raw_text?.toLowerCase().includes('hard')
        ? 'hard'
        : 'moderate',
    description: workout.raw_text ?? undefined,
    status: 'completed',
    createdAt: workout.created_at ?? new Date().toISOString(),
    rawText: workout.raw_text ?? undefined,
    distance: workout.distance ? Number(workout.distance) : undefined,
  }))
}

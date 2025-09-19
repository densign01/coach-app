import { NextResponse } from 'next/server'

import { getSupabaseRouteClient } from '@/lib/supabase/server'
import { buildDayId } from '@/lib/utils'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.workout) {
    return NextResponse.json({ error: 'Missing workout payload' }, { status: 400 })
  }

  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workout = body.workout
  const dayId = buildDayId(user.id, workout.date)

  const { error: dayError } = await supabase
    .from('days')
    .upsert({ id: dayId, user_id: user.id, date: workout.date })

  if (dayError) {
    console.error('[api/workout] failed to upsert day', dayError)
    return NextResponse.json({ error: 'Failed to save workout' }, { status: 500 })
  }

  const { data: upsertedWorkout, error: workoutError } = await supabase
    .from('workouts')
    .upsert({
      id: workout.id,
      day_id: dayId,
      type: workout.type,
      minutes: workout.minutes,
      distance: workout.distance ?? null,
      raw_text: workout.rawText ?? null,
    })
    .select('*')
    .maybeSingle()

  if (workoutError) {
    console.error('[api/workout] failed to upsert workout', workoutError)
    return NextResponse.json({ error: 'Failed to save workout' }, { status: 500 })
  }

  return NextResponse.json({
    status: 'ok',
    workout: {
      ...workout,
      dayId,
      createdAt: upsertedWorkout?.created_at ?? workout.createdAt,
    },
    userId: user.id,
  })
}

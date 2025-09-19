import { NextResponse } from 'next/server'

import { getSupabaseServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.workout) {
    return NextResponse.json({ error: 'Missing workout payload' }, { status: 400 })
  }

  const supabase = tryGetServiceClient()

  if (supabase) {
    const { workout, userId = 'local-user' } = body
    const dayId = workout.dayId ?? `${userId}-${workout.date}`

    await supabase
      .from('days')
      .upsert({ id: dayId, user_id: userId, date: workout.date })
      .throwOnError()

    await supabase
      .from('workouts')
      .upsert({
        id: workout.id,
        day_id: dayId,
        type: workout.type,
        minutes: workout.minutes,
        distance: workout.distance ?? null,
        raw_text: workout.rawText ?? null,
      })
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

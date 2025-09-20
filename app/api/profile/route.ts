import { NextResponse } from 'next/server'

import { getSupabaseRouteClient } from '@/lib/supabase/server'

type ProfilePayload = Partial<{
  username: string | null
  firstName: string | null
  lastName: string | null
  heightCm: number | string | null
  weightKg: number | string | null
  age: number | string | null
  gender: string | null
  goals: string | null
  profileSummary: string | null
  insights: string[] | null
  onboardingStep: number | null
  onboardingData: Record<string, unknown> | null
  onboardingCompleted: boolean | null
}>

export async function GET() {
  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error, status } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error && status !== 406) {
    console.error('[api/profile] fetch error', error)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }

  return NextResponse.json({ profile: data ?? null })
}

export async function PUT(request: Request) {
  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.profile) {
    return NextResponse.json({ error: 'Missing profile payload' }, { status: 400 })
  }

  const normalized = normalizeProfilePayload(body.profile as ProfilePayload)

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      ...normalized,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[api/profile] upsert error', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}

function normalizeProfilePayload(payload: ProfilePayload) {
  const result: Record<string, string | number | boolean | object | null | undefined> = {}

  if ('username' in payload) result.username = coerceString(payload.username)
  if ('firstName' in payload) result.first_name = coerceString(payload.firstName)
  if ('lastName' in payload) result.last_name = coerceString(payload.lastName)
  if ('gender' in payload) result.gender = coerceString(payload.gender)
  if ('goals' in payload) result.goals = coerceString(payload.goals)
  if ('profileSummary' in payload) result.profile_summary = coerceString(payload.profileSummary)

  if ('heightCm' in payload) result.height_cm = coerceNumber(payload.heightCm)
  if ('weightKg' in payload) result.weight_kg = coerceNumber(payload.weightKg)
  if ('age' in payload) result.age = payload.age === null ? null : coerceNumber(payload.age)

  if ('insights' in payload) result.insights_json = Array.isArray(payload.insights) ? payload.insights : []
  if ('onboardingStep' in payload) result.onboarding_step = coerceNumber(payload.onboardingStep)
  if ('onboardingData' in payload) result.onboarding_data = payload.onboardingData
  if ('onboardingCompleted' in payload) result.onboarding_completed = Boolean(payload.onboardingCompleted)

  return result
}

function coerceString(value: unknown) {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length ? str : null
}

function coerceNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

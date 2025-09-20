import { NextResponse } from 'next/server'

import { parseHeightToCm, parseWeightToKg } from '@/lib/ai/onboarding'
import { getSupabaseRouteClient } from '@/lib/supabase/server'

type ProfilePayload = Partial<{
  username: string | null
  firstName: string | null
  lastName: string | null
  heightCm: number | string | null
  weightKg: number | string | null
  heightFeet?: number | string | null
  heightInches?: number | string | null
  weightLbs?: number | string | null
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
    return NextResponse.json({ error: error.message ?? 'Failed to update profile' }, { status: 500 })
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

  if ('heightCm' in payload) result.height_cm = coerceHeight(payload.heightCm)
  if ('heightFeet' in payload || 'heightInches' in payload) {
    const feet = coerceNumber(payload.heightFeet)
    const inches = coerceNumber(payload.heightInches)
    if (feet !== null || inches !== null) {
      const totalInches = (feet ?? 0) * 12 + (inches ?? 0)
      result.height_cm = Math.round(totalInches * 2.54)
    }
  }
  if ('weightKg' in payload) result.weight_kg = coerceWeight(payload.weightKg)
  if ('weightLbs' in payload) {
    const pounds = coerceNumber(payload.weightLbs)
    if (pounds !== null) {
      result.weight_kg = Math.round(pounds * 0.453592 * 10) / 10
    }
  }
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

function coerceHeight(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value
  const str = String(value).trim()
  if (!str) return null
  const parsed = parseHeightToCm(str)
  if (parsed) return parsed
  return coerceNumber(str)
}

function coerceWeight(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return value > 400 ? Math.round(value * 0.453592 * 10) / 10 : value
  }

  const str = String(value).trim()
  if (!str) return null
  const lower = str.toLowerCase()

  if (lower.includes('lb') || lower.includes('pound') || lower.includes('lbs')) {
    return parseWeightToKg(str)
  }

  const numeric = parseWeightToKg(str)
  if (numeric) {
    return numeric
  }

  const num = coerceNumber(str)
  if (num && num > 400) {
    return Math.round(num * 0.453592 * 10) / 10
  }

  return num
}

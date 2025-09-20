'use client'

import type {
  CoachMessage,
  CoachState,
  DaySnapshot,
  MacroBreakdown,
  MealLog,
  UserProfile,
  WorkoutLog,
} from '@/lib/types'
import type { Database } from '@/lib/supabase/schema'
import { buildDayId } from '@/lib/utils'

export interface ApiMealDraft {
  mealType: string
  items: string[]
  macros: {
    calories: number
    protein: number
    fat: number
    carbs: number
  }
  confidence: 'low' | 'medium' | 'high'
}

export async function requestMealDraftFromText(text: string): Promise<ApiMealDraft | null> {
  try {
    const response = await fetch('/api/parseMeal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    return payload?.draft ?? null
  } catch (error) {
    console.error('Meal draft request failed', error)
    return null
  }
}

export async function confirmMealOnServer(draftId: string, meal: MealLog) {
  try {
    const response = await fetch('/api/confirmMeal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ draftId, meal }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Failed to persist meal draft', error)
      return { ok: false }
    }

    return { ok: true, data: await response.json() }
  } catch (error) {
    console.error('Failed to persist meal draft', error)
    return { ok: false }
  }
}

export async function persistWorkoutOnServer(workout: WorkoutLog) {
  try {
    const response = await fetch('/api/workout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workout }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Failed to persist workout', error)
      return { ok: false }
    }

    return { ok: true }
  } catch (error) {
    console.error('Failed to persist workout', error)
    return { ok: false }
  }
}

export async function fetchDaySnapshot(date: string): Promise<DaySnapshot | null> {
  try {
    const response = await fetch(`/api/day?date=${encodeURIComponent(date)}`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Failed to fetch day snapshot', error)
      return null
    }

    const payload = await response.json()

    const dayId = typeof payload.dayId === 'string' ? payload.dayId : buildDayId(payload.userId ?? '', date)

    const meals: MealLog[] = Array.isArray(payload.meals)
      ? payload.meals.map((meal: MealLog) => ({
          ...meal,
          dayId,
          macros: normalizeMacros(meal.macros),
        }))
      : []

    const workouts: WorkoutLog[] = Array.isArray(payload.workouts)
      ? payload.workouts.map((workout: WorkoutLog) => ({
          ...workout,
          dayId,
        }))
      : []

    return {
      dayId,
      date: payload.date ?? date,
      meals,
      workouts,
      targets: payload.targets ? normalizeMacros(payload.targets) : undefined,
    }
  } catch (error) {
    console.error('Failed to fetch day snapshot', error)
    return null
  }
}

function normalizeMacros(value: MacroBreakdown | undefined): MacroBreakdown {
  return {
    calories: Number(value?.calories ?? 0),
    protein: Number(value?.protein ?? 0),
    fat: Number(value?.fat ?? 0),
    carbs: Number(value?.carbs ?? 0),
  }
}

export interface CoachResponsePayload {
  message: string | null
  insight?: string | null
}

export async function generateCoachResponse(params: {
  userMessage: string
  state: CoachState
  mealDraftSummary?: string
  workoutSummary?: string
  energyNote?: string
  intent?: string
  profile?: UserProfile | null
  history?: CoachMessage[]
}): Promise<CoachResponsePayload> {
  try {
    const todaysMeals = params.state.meals.filter((meal) => meal.date === params.state.activeDate)
    const todaysWorkouts = params.state.workouts.filter((workout) => workout.date === params.state.activeDate)
    const profile = params.profile ?? params.state.profile
    const history = params.history ?? params.state.messages
    const historyPayload = history
      ?.slice(-10)
      .map((message) => ({ role: message.role, content: message.content }))
    const profileSnapshot = profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          goals: profile.goals,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          age: profile.age,
          gender: profile.gender,
          summary: profile.profileSummary,
          insights: profile.insights ?? null,
        }
      : null

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: params.userMessage,
        activeDate: params.state.activeDate,
        intent: params.intent ?? 'general',
        mealSummary: params.mealDraftSummary,
        workoutSummary: params.workoutSummary,
        energyNote: params.energyNote,
        macroTotals: calculateMacroTotals(todaysMeals),
        upcomingPlan: describeUpcomingPlan(params.state),
        recentMeals: todaysMeals.slice(-3).map((meal) => `${meal.type}: ${meal.items.join(', ')}`),
        recentWorkouts: todaysWorkouts.slice(-3).map((workout) => `${workout.type} ${workout.minutes}min`),
        profile: profileSnapshot,
        history: historyPayload,
      }),
    })

    if (!response.ok) {
      console.error('Failed to call /api/chat', await response.text())
      return { message: null }
    }

    const data = await response.json()
    const message = typeof data.message === 'string' ? data.message : null
    const insightRaw = typeof data.insight === 'string' ? data.insight.trim() : ''
    const insight = insightRaw && insightRaw.toLowerCase() !== 'none' ? insightRaw : null

    return {
      message,
      insight,
    }
  } catch (error) {
    console.error('Failed to generate coach response', error)
    return { message: null }
  }
}

function calculateMacroTotals(meals: MealLog[]) {
  return meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.macros.calories,
      protein: acc.protein + meal.macros.protein,
      fat: acc.fat + meal.macros.fat,
      carbs: acc.carbs + meal.macros.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  )
}

function describeUpcomingPlan(state: CoachState) {
  const today = new Date(state.activeDate)
  const weekday = today.getDay()
  const todayPlan = state.weeklyPlan.find((entry) => entry.weekday === weekday)
  return todayPlan ? `${todayPlan.focus} for about ${todayPlan.minutesTarget} minutes (${todayPlan.suggestedIntensity})` : null
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  try {
    const response = await fetch('/api/profile')
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Failed to fetch profile', error)
      return null
    }

    const payload = await response.json()
    return payload?.profile ? normalizeProfile(payload.profile) : null
  } catch (error) {
    console.error('Failed to fetch profile', error)
    return null
  }
}

export async function upsertUserProfile(profile: UserProfile) {
  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Failed to update profile', error)
      return null
    }

    const payload = await response.json()
    return payload?.profile ? normalizeProfile(payload.profile) : null
  } catch (error) {
    console.error('Failed to update profile', error)
    return null
  }
}

function normalizeProfile(raw: unknown): UserProfile {
  const record = (raw ?? {}) as Record<string, unknown>

  const heightRaw = record.height_cm ?? record.heightCm
  const weightRaw = record.weight_kg ?? record.weightKg
  const onboardingStepRaw = record.onboarding_step ?? record.onboardingStep
  const onboardingDataRaw = record.onboarding_data ?? record.onboardingData
  const onboardingCompletedRaw = record.onboarding_completed ?? record.onboardingCompleted
  const insightsRaw = record.insights_json ?? record.insightsJson

  return {
    userId: String(record.user_id ?? record.userId ?? ''),
    username: (record.username as string) ?? null,
    firstName: (record.first_name as string) ?? (record.firstName as string) ?? null,
    lastName: (record.last_name as string) ?? (record.lastName as string) ?? null,
    heightCm: heightRaw !== undefined && heightRaw !== null ? Number(heightRaw) : null,
    weightKg: weightRaw !== undefined && weightRaw !== null ? Number(weightRaw) : null,
    age: record.age !== undefined && record.age !== null ? Number(record.age) : null,
    gender: (record.gender as string) ?? null,
    goals: (record.goals as string) ?? null,
    profileSummary: (record.profile_summary as string) ?? (record.profileSummary as string) ?? null,
    insights:
      Array.isArray(insightsRaw)
        ? (insightsRaw as unknown[]).map((item) => String(item)).filter((item) => item.trim().length > 0)
        : null,
    onboardingStep: onboardingStepRaw !== undefined && onboardingStepRaw !== null ? Number(onboardingStepRaw) : null,
    onboardingData: (onboardingDataRaw as Record<string, unknown>) ?? null,
    onboardingCompleted: onboardingCompletedRaw !== undefined && onboardingCompletedRaw !== null ? Boolean(onboardingCompletedRaw) : null,
    updatedAt: (record.updated_at as string) ?? (record.updatedAt as string) ?? null,
  }
}

export async function fetchChatHistory(limit = 100): Promise<CoachMessage[] | null> {
  try {
    const response = await fetch(`/api/messages?limit=${limit}`)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Failed to fetch chat history', error)
      return null
    }

    const payload = await response.json()
    if (!Array.isArray(payload.messages)) return []

    type ChatRow = Database['public']['Tables']['chat_messages']['Row']

    return (payload.messages as ChatRow[]).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
      metadata: (message.metadata as Record<string, unknown> | null) ?? undefined,
    }))
  } catch (error) {
    console.error('Failed to fetch chat history', error)
    return null
  }
}

export async function persistChatMessage(message: CoachMessage) {
  try {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          metadata: message.metadata ?? null,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Failed to persist chat message', error)
    }
  } catch (error) {
    console.error('Failed to persist chat message', error)
  }
}

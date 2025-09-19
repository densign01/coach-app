'use client'

import type { MealLog, WorkoutLog } from '@/lib/types'

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

export async function confirmMealOnServer(draftId: string, meal: MealLog, userId?: string) {
  try {
    const response = await fetch('/api/confirmMeal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ draftId, meal, userId }),
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

export async function persistWorkoutOnServer(workout: WorkoutLog, userId?: string) {
  try {
    const response = await fetch('/api/workout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workout, userId }),
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

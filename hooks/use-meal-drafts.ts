'use client'

import { useCallback } from 'react'

import { confirmMealOnServer, fetchDaySnapshot } from '@/lib/api/client'
import { useCoachStore } from '@/lib/state/coach-store'
import type { CoachMessage, MealDraft, MealLog } from '@/lib/types'
import { buildDayId } from '@/lib/utils'

const emptyMacros = { calories: 0, protein: 0, fat: 0, carbs: 0 }

export function useMealDrafts() {
  const { state, dispatch } = useCoachStore()

  const confirmDraft = useCallback(
    async (draft: MealDraft) => {
      const now = new Date()
      const payloadMacros = draft.payload.macros
      if (!state.userId) {
        console.warn('Cannot confirm meal without an authenticated user')
        return
      }

      const dayId = buildDayId(state.userId, state.activeDate)

      const meal: MealLog = {
        id: crypto.randomUUID(),
        dayId,
        date: state.activeDate,
        type: draft.payload.type ?? 'snack',
        items: draft.payload.items ?? [draft.payload.originalText],
        macros: {
          calories: payloadMacros?.calories ?? emptyMacros.calories,
          protein: payloadMacros?.protein ?? emptyMacros.protein,
          fat: payloadMacros?.fat ?? emptyMacros.fat,
          carbs: payloadMacros?.carbs ?? emptyMacros.carbs,
        },
        source: 'text',
        createdAt: now.toISOString(),
      }

      dispatch({ type: 'upsertMeal', meal })
      dispatch({ type: 'removeMealDraft', draftId: draft.id })

      const result = await confirmMealOnServer(draft.id, meal)

      // Refresh day data to ensure meal totals are updated
      if (result.ok) {
        const snapshot = await fetchDaySnapshot(state.activeDate)
        if (snapshot) {
          dispatch({ type: 'syncDay', payload: snapshot })
        }
      }

      const mealSummary = `${meal.type ?? 'Meal'}: ${meal.items.join(', ')} (~${Math.round(meal.macros.protein)}g protein / ${Math.round(meal.macros.calories)} cal)`

      const coachMessage: CoachMessage = {
        id: crypto.randomUUID(),
        role: 'coach',
        content: `Meal logged: ${mealSummary}. Did I miss anything you want to adjust?`,
        createdAt: new Date().toISOString(),
      }

      dispatch({ type: 'addMessage', message: coachMessage })
    },
    [dispatch, state.activeDate, state.userId],
  )

  const dismissDraft = useCallback(
    (draftId: string) => {
      dispatch({ type: 'removeMealDraft', draftId })
    },
    [dispatch],
  )

  return {
    drafts: state.mealDrafts,
    confirmDraft,
    dismissDraft,
  }
}

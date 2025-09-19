'use client'

import { useCallback } from 'react'

import { confirmMealOnServer } from '@/lib/api/client'
import { useCoachStore } from '@/lib/state/coach-store'
import type { CoachMessage, MealDraft, MealLog } from '@/lib/types'

const emptyMacros = { calories: 0, protein: 0, fat: 0, carbs: 0 }

export function useMealDrafts() {
  const { state, dispatch } = useCoachStore()

  const confirmDraft = useCallback(
    async (draft: MealDraft) => {
      const now = new Date()
      const payloadMacros = draft.payload.macros
      const meal: MealLog = {
        id: crypto.randomUUID(),
        dayId: state.activeDate,
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

      void confirmMealOnServer(draft.id, meal)

      const coachMessage: CoachMessage = {
        id: crypto.randomUUID(),
        role: 'coach',
        content: 'Logged. I’ll keep an eye on your totals as the day moves along.',
        createdAt: new Date().toISOString(),
      }

      dispatch({ type: 'addMessage', message: coachMessage })
    },
    [dispatch, state.activeDate],
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

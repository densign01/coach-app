'use client'

import { useCallback } from 'react'

import { confirmMealOnServer, fetchDaySnapshot } from '@/lib/api/client'
import { useCoachStore } from '@/lib/state/coach-store'
import type { CoachMessage, FoodItemDraft, MealLog } from '@/lib/types'
import { buildDayId } from '@/lib/utils'

export function useFoodItemDrafts() {
  const { state, dispatch } = useCoachStore()

  const confirmFoodItem = useCallback(
    async (draft: FoodItemDraft) => {
      if (!state.userId) {
        console.warn('Cannot confirm food item without an authenticated user')
        return
      }

      const dayId = buildDayId(state.userId, state.activeDate)
      const now = new Date()

      // Create a meal log for this individual food item
      const meal: MealLog = {
        id: crypto.randomUUID(),
        dayId,
        date: state.activeDate,
        type: draft.mealType,
        items: [draft.payload.item],
        macros: draft.payload.macros,
        source: draft.payload.source,
        createdAt: now.toISOString(),
      }

      // Update local state immediately
      dispatch({ type: 'upsertMeal', meal })
      dispatch({ type: 'removeFoodItemDraft', draftId: draft.id })

      // Persist to server
      const result = await confirmMealOnServer(draft.id, meal)

      // Refresh day data to ensure meal totals are updated
      if (result.ok) {
        const snapshot = await fetchDaySnapshot(state.activeDate)
        if (snapshot) {
          dispatch({ type: 'syncDay', payload: snapshot })
        }
      }

      // Add confirmation message
      const coachMessage: CoachMessage = {
        id: crypto.randomUUID(),
        role: 'coach',
        content: `Added ${meal.items[0]} (~${Math.round(meal.macros.protein)}g protein / ${Math.round(meal.macros.calories)} cal).`,
        createdAt: new Date().toISOString(),
      }

      dispatch({ type: 'addMessage', message: coachMessage })
    },
    [dispatch, state.activeDate, state.userId],
  )

  const dismissFoodItem = useCallback(
    (draftId: string) => {
      dispatch({ type: 'removeFoodItemDraft', draftId })
    },
    [dispatch],
  )

  const updateFoodItem = useCallback(
    (draftId: string, updates: Partial<FoodItemDraft['payload']>) => {
      dispatch({ type: 'updateFoodItemDraft', draftId, updates })
    },
    [dispatch],
  )

  return {
    drafts: state.foodItemDrafts,
    confirmFoodItem,
    dismissFoodItem,
    updateFoodItem,
  }
}
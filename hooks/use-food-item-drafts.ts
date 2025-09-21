'use client'

import { useCallback } from 'react'

import { confirmMealOnServer, fetchDaySnapshot } from '@/lib/api/client'
import { useCoachStore } from '@/lib/state/coach-store'
import type { CoachMessage, FoodItemDraft, MealLog, MacroBreakdown, StructuredMealItem } from '@/lib/types'
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
      const item = draft.payload.item
      const label = formatItemLabel(item)
      const macros = nutritionToMacroBreakdown(item.nutritionEstimate)

      const meal: MealLog = {
        id: crypto.randomUUID(),
        dayId,
        date: state.activeDate,
        type: draft.mealType,
        items: [label],
        macros,
        source: draft.payload.source === 'heuristic' ? 'est' : 'api',
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
        content: `Added ${label} (~${Math.round(meal.macros.protein)}g protein / ${Math.round(meal.macros.calories)} cal).`,
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

  return {
    drafts: state.foodItemDrafts,
    confirmFoodItem,
    dismissFoodItem,
  }
}

function formatItemLabel(item: StructuredMealItem): string {
  const quantity = item.quantity.display ?? buildQuantityDisplay(item)
  const cleanedName = item.name || item.rawText
  if (quantity) {
    return `${quantity.trim()} ${cleanedName}`.trim()
  }
  return cleanedName
}

function buildQuantityDisplay(item: StructuredMealItem): string | null {
  const { value, unit } = item.quantity
  if (value == null) {
    return null
  }

  if (!unit) {
    return String(value)
  }

  return `${value} ${unit}`
}

function nutritionToMacroBreakdown(estimate: StructuredMealItem['nutritionEstimate']): MacroBreakdown {
  return {
    calories: Number(estimate?.caloriesKcal ?? 0),
    protein: Number(estimate?.proteinG ?? 0),
    fat: Number(estimate?.fatG ?? 0),
    carbs: Number(estimate?.carbsG ?? 0),
  }
}

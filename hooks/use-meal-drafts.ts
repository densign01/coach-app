'use client'

import { useCallback } from 'react'

import { confirmMealOnServer, fetchDaySnapshot } from '@/lib/api/client'
import { useCoachStore } from '@/lib/state/coach-store'
import type { CoachMessage, MealDraft, MealLog, MacroBreakdown, StructuredMealItem } from '@/lib/types'
import { buildDayId } from '@/lib/utils'

const emptyMacros = { calories: 0, protein: 0, fat: 0, carbs: 0 }

export function useMealDrafts() {
  const { state, dispatch } = useCoachStore()

  const confirmDraft = useCallback(
    async (draft: MealDraft) => {
      const now = new Date()
      if (!state.userId) {
        console.warn('Cannot confirm meal without an authenticated user')
        return
      }

      const dayId = buildDayId(state.userId, state.activeDate)

      const items = Array.isArray(draft.payload.items) ? draft.payload.items : []
      const itemLabels = items.length > 0 ? items.map(formatStructuredItemLabel) : [draft.payload.originalText]
      const macros = resolveMealMacros(draft.payload.macros, items)

      const meal: MealLog = {
        id: crypto.randomUUID(),
        dayId,
        date: state.activeDate,
        type: draft.payload.type ?? 'snack',
        items: itemLabels,
        macros,
        source: 'api',
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

function formatStructuredItemLabel(item: StructuredMealItem): string {
  const quantity = item.quantity.display ?? buildQuantityDisplay(item.quantity)
  return `${quantity ? `${quantity} ` : ''}${item.name || item.rawText}`.trim()
}

function buildQuantityDisplay(quantity: StructuredMealItem['quantity']): string | null {
  if (quantity.value == null) return null
  if (!quantity.unit || quantity.unit === 'other') {
    return String(quantity.value)
  }
  return `${quantity.value} ${quantity.unit}`
}

function resolveMealMacros(
  fallback: Partial<MacroBreakdown> | undefined,
  items: StructuredMealItem[],
): MacroBreakdown {
  if (fallback?.calories || fallback?.protein || fallback?.fat || fallback?.carbs) {
    return {
      calories: fallback.calories ?? 0,
      protein: fallback.protein ?? 0,
      fat: fallback.fat ?? 0,
      carbs: fallback.carbs ?? 0,
    }
  }

  const totals = items.reduce<MacroBreakdown>(
    (acc, item) => {
      const estimate = item.nutritionEstimate
      return {
        calories: acc.calories + Number(estimate?.caloriesKcal ?? 0),
        protein: acc.protein + Number(estimate?.proteinG ?? 0),
        fat: acc.fat + Number(estimate?.fatG ?? 0),
        carbs: acc.carbs + Number(estimate?.carbsG ?? 0),
      }
    },
    { ...emptyMacros },
  )

  return totals
}

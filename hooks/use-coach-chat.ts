'use client'

import { useState, useCallback } from 'react'

import { orchestrateCoachReply } from '@/lib/ai/orchestrator'
import { persistWorkoutOnServer } from '@/lib/api/client'
import { useCoachStore } from '@/lib/state/coach-store'
import type { CoachMessage, CoachState } from '@/lib/types'

interface UseCoachChatResult {
  messages: CoachMessage[]
  isProcessing: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
}

export function useCoachChat(): UseCoachChatResult {
  const { state, dispatch } = useCoachStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return

      const now = new Date().toISOString()
      const userMessage: CoachMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        createdAt: now,
      }

      dispatch({ type: 'addMessage', message: userMessage })
      setIsProcessing(true)
      setError(null)

      try {
        const snapshot: CoachState = {
          ...state,
          messages: [...state.messages, userMessage],
        }

        const result = await orchestrateCoachReply(trimmed, snapshot)

        if (result.mealDraft) {
          dispatch({ type: 'addMealDraft', draft: result.mealDraft })
        }

        if (result.workoutLog && state.userId) {
          dispatch({ type: 'upsertWorkout', workout: result.workoutLog })
          void persistWorkoutOnServer(result.workoutLog)
        }

        const coachMessage: CoachMessage = {
          id: crypto.randomUUID(),
          role: 'coach',
          content: result.coachMessage,
          createdAt: new Date().toISOString(),
        }

        dispatch({ type: 'addMessage', message: coachMessage })
      } catch (err) {
        console.error('Failed to process coach message', err)
        setError('I had trouble processing that. Try again in a moment?')
      } finally {
        setIsProcessing(false)
      }
    },
    [dispatch, state],
  )

  return {
    messages: state.messages,
    isProcessing,
    error,
    sendMessage,
  }
}

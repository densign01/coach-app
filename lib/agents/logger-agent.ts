import type {
  MealLog,
  WorkoutLog,
  UserProfile,
  FoodItemDraft,
  CoachMessage,
  DaySnapshot
} from '@/lib/types'

export interface LoggerAgentInput {
  type: 'meal' | 'workout' | 'profile' | 'message' | 'day'
  data: any
  userId?: string
}

export interface LoggerAgentOutput {
  success: boolean
  data?: any
  error?: string
}

/**
 * Logger Agent - Expert data management specialist
 *
 * Role: Handles all data persistence and retrieval operations
 * Responsibilities:
 * - Persist meal and workout data to database
 * - Manage user profiles and preferences
 * - Handle food item drafts and confirmations
 * - Maintain data integrity and validation
 * - Support data export and querying
 */
export class LoggerAgent {
  async persistData(input: LoggerAgentInput): Promise<LoggerAgentOutput> {
    console.log('[LoggerAgent] Persisting data type:', input.type)

    try {
      switch (input.type) {
        case 'meal':
          return await this.persistMeal(input.data as { draftId: string; meal: MealLog })

        case 'workout':
          return await this.persistWorkout(input.data as { workout: WorkoutLog })

        case 'profile':
          return await this.persistProfile(input.data as { profile: UserProfile })

        case 'message':
          return await this.persistMessage(input.data as { message: CoachMessage })

        default:
          return {
            success: false,
            error: `Unsupported data type: ${input.type}`
          }
      }
    } catch (error) {
      console.error('[LoggerAgent] Persistence error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown persistence error'
      }
    }
  }

  async retrieveData(type: 'day' | 'profile' | 'messages', params: any): Promise<LoggerAgentOutput> {
    console.log('[LoggerAgent] Retrieving data type:', type)

    try {
      switch (type) {
        case 'day':
          return await this.retrieveDaySnapshot(params.date)

        case 'profile':
          return await this.retrieveProfile()

        case 'messages':
          return await this.retrieveMessages(params.limit)

        default:
          return {
            success: false,
            error: `Unsupported retrieval type: ${type}`
          }
      }
    } catch (error) {
      console.error('[LoggerAgent] Retrieval error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown retrieval error'
      }
    }
  }

  private async persistMeal(data: { draftId: string; meal: MealLog }): Promise<LoggerAgentOutput> {
    try {
      const response = await fetch('/api/confirmMeal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: data.draftId,
          meal: data.meal,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Failed to persist meal: ${error.message || response.statusText}`
        }
      }

      const result = await response.json()
      return {
        success: true,
        data: result
      }
    } catch (error) {
      return {
        success: false,
        error: `Meal persistence failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async persistWorkout(data: { workout: WorkoutLog }): Promise<LoggerAgentOutput> {
    try {
      const response = await fetch('/api/workout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workout: data.workout,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Failed to persist workout: ${error.message || response.statusText}`
        }
      }

      return {
        success: true,
      }
    } catch (error) {
      return {
        success: false,
        error: `Workout persistence failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async persistProfile(data: { profile: UserProfile }): Promise<LoggerAgentOutput> {
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile: data.profile,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Failed to persist profile: ${error.message || response.statusText}`
        }
      }

      const result = await response.json()
      return {
        success: true,
        data: result.profile
      }
    } catch (error) {
      return {
        success: false,
        error: `Profile persistence failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async persistMessage(data: { message: CoachMessage }): Promise<LoggerAgentOutput> {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            id: data.message.id,
            role: data.message.role,
            content: data.message.content,
            createdAt: data.message.createdAt,
            metadata: data.message.metadata ?? null,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Failed to persist message: ${error.message || response.statusText}`
        }
      }

      return {
        success: true,
      }
    } catch (error) {
      return {
        success: false,
        error: `Message persistence failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async retrieveDaySnapshot(date: string): Promise<LoggerAgentOutput> {
    try {
      const response = await fetch(`/api/day?date=${encodeURIComponent(date)}`)

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Failed to fetch day snapshot: ${error.message || response.statusText}`
        }
      }

      const payload = await response.json()

      // Normalize the response data
      const daySnapshot: DaySnapshot = {
        dayId: payload.dayId || `${payload.userId || 'unknown'}_${date}`,
        date: payload.date || date,
        meals: Array.isArray(payload.meals) ? payload.meals : [],
        workouts: Array.isArray(payload.workouts) ? payload.workouts : [],
        targets: payload.targets || undefined,
      }

      return {
        success: true,
        data: daySnapshot
      }
    } catch (error) {
      return {
        success: false,
        error: `Day snapshot retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async retrieveProfile(): Promise<LoggerAgentOutput> {
    try {
      const response = await fetch('/api/profile')

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Failed to fetch profile: ${error.message || response.statusText}`
        }
      }

      const payload = await response.json()
      return {
        success: true,
        data: payload.profile || null
      }
    } catch (error) {
      return {
        success: false,
        error: `Profile retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async retrieveMessages(limit = 100): Promise<LoggerAgentOutput> {
    try {
      const response = await fetch(`/api/messages?limit=${limit}`)

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Failed to fetch messages: ${error.message || response.statusText}`
        }
      }

      const payload = await response.json()
      return {
        success: true,
        data: Array.isArray(payload.messages) ? payload.messages : []
      }
    } catch (error) {
      return {
        success: false,
        error: `Messages retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  // Validation methods
  private validateMeal(meal: MealLog): boolean {
    return !!(meal.id && meal.type && meal.items && meal.macros)
  }

  private validateWorkout(workout: WorkoutLog): boolean {
    return !!(workout.id && workout.type && workout.minutes !== undefined)
  }

  private validateProfile(profile: UserProfile): boolean {
    return !!(profile.userId)
  }

  private validateMessage(message: CoachMessage): boolean {
    return !!(message.id && message.role && message.content)
  }

  // Utility methods for data transformation
  private normalizeMacros(value: any) {
    return {
      calories: Number(value?.calories ?? 0),
      protein: Number(value?.protein ?? 0),
      fat: Number(value?.fat ?? 0),
      carbs: Number(value?.carbs ?? 0),
    }
  }
}

export const loggerAgent = new LoggerAgent()
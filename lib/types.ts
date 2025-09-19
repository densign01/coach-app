import type React from 'react'

export type Tab = 'home' | 'nutrition' | 'fitness'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MacroBreakdown {
  calories: number
  protein: number
  fat: number
  carbs: number
}

export interface MealLog {
  id: string
  dayId: string
  date: string
  type: MealType
  items: string[]
  macros: MacroBreakdown
  source: 'text' | 'vision' | 'manual'
  createdAt: string
}

export type WorkoutStatus = 'planned' | 'completed' | 'skipped'

export interface WorkoutLog {
  id: string
  dayId: string
  date: string
  type: string
  minutes: number
  intensity?: 'easy' | 'moderate' | 'hard'
  description?: string
  status: WorkoutStatus
  createdAt: string
  rawText?: string
}

export interface CoachMessage {
  id: string
  role: 'user' | 'coach' | 'system'
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface MealDraft {
  id: string
  createdAt: string
  payload: {
    type?: MealType
    items?: string[]
    macros?: Partial<MacroBreakdown>
    notes?: string
    originalText: string
    confidence: 'low' | 'medium' | 'high'
    source: 'text'
  }
}

export interface WorkoutDraft {
  id: string
  createdAt: string
  payload: {
    type?: string
    minutes?: number
    intensity?: 'easy' | 'moderate' | 'hard'
    notes?: string
    originalText: string
  }
}

export interface DaySummary {
  date: string
  meals: MealLog[]
  workouts: WorkoutLog[]
  totals: MacroBreakdown
  coachNotes?: string
}

export interface WeeklyPlanEntry {
  id: string
  weekday: number
  focus: string
  minutesTarget: number
  suggestedIntensity: 'easy' | 'moderate' | 'hard'
}

export interface CoachState {
  activeDate: string
  messages: CoachMessage[]
  mealDrafts: MealDraft[]
  meals: MealLog[]
  workouts: WorkoutLog[]
  weeklyPlan: WeeklyPlanEntry[]
  targets: MacroBreakdown
}

export type CoachAction =
  | { type: 'hydrate'; state: CoachState }
  | { type: 'addMessage'; message: CoachMessage }
  | { type: 'replaceMessages'; messages: CoachMessage[] }
  | { type: 'addMealDraft'; draft: MealDraft }
  | { type: 'removeMealDraft'; draftId: string }
  | { type: 'upsertMeal'; meal: MealLog }
  | { type: 'removeMeal'; mealId: string }
  | { type: 'upsertWorkout'; workout: WorkoutLog }
  | { type: 'removeWorkout'; workoutId: string }
  | { type: 'setWeeklyPlan'; plan: WeeklyPlanEntry[] }
  | { type: 'setTargets'; targets: MacroBreakdown }

export interface CoachContextValue {
  state: CoachState
  dispatch: React.Dispatch<CoachAction>
}

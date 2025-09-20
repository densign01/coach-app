'use client'

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'

import { fetchDaySnapshot, fetchUserProfile, fetchChatHistory } from '@/lib/api/client'
import type { CoachAction, CoachContextValue, CoachState, DaySnapshot, MacroBreakdown, MealLog } from '@/lib/types'
import { buildDayId } from '@/lib/utils'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'coach-state-v1'

const DEFAULT_TARGETS: MacroBreakdown = {
  calories: 2200,
  protein: 130,
  fat: 70,
  carbs: 220,
}

const defaultState: CoachState = {
  activeDate: new Date().toISOString().slice(0, 10),
  userId: null,
  profile: null,
  profileLoaded: false,
  messages: [
    {
      id: 'welcome',
      role: 'coach',
      content:
        "I'm your Coach. Tell me about your energy, meals, or movement today and I'll help you chart the next step.",
      createdAt: new Date().toISOString(),
    },
  ],
  mealDrafts: [],
  foodItemDrafts: [],
  meals: [],
  workouts: [],
  weeklyPlan: [
    { id: 'plan-mon', weekday: 1, focus: 'Strength A', minutesTarget: 45, suggestedIntensity: 'moderate' },
    { id: 'plan-tue', weekday: 2, focus: 'Movement / Walk', minutesTarget: 30, suggestedIntensity: 'easy' },
    { id: 'plan-wed', weekday: 3, focus: 'Strength B', minutesTarget: 45, suggestedIntensity: 'moderate' },
    { id: 'plan-thu', weekday: 4, focus: 'Mobility + Core', minutesTarget: 20, suggestedIntensity: 'easy' },
    { id: 'plan-fri', weekday: 5, focus: 'Strength C', minutesTarget: 45, suggestedIntensity: 'hard' },
    { id: 'plan-sat', weekday: 6, focus: 'Cardio Session', minutesTarget: 35, suggestedIntensity: 'moderate' },
    { id: 'plan-sun', weekday: 0, focus: 'Recharge / Walk', minutesTarget: 20, suggestedIntensity: 'easy' },
  ],
  targets: DEFAULT_TARGETS,
}

function coachReducer(state: CoachState, action: CoachAction): CoachState {
  switch (action.type) {
    case 'hydrate':
      return {
        ...action.state,
        profileLoaded: Boolean(action.state.profile ?? false),
      }
    case 'addMessage':
      return { ...state, messages: [...state.messages, action.message] }
    case 'replaceMessages':
      return { ...state, messages: action.messages }
    case 'addMealDraft':
      return { ...state, mealDrafts: [...state.mealDrafts, action.draft] }
    case 'removeMealDraft':
      return { ...state, mealDrafts: state.mealDrafts.filter((draft) => draft.id !== action.draftId) }
    case 'addFoodItemDrafts':
      return { ...state, foodItemDrafts: [...state.foodItemDrafts, ...action.drafts] }
    case 'removeFoodItemDraft':
      return { ...state, foodItemDrafts: state.foodItemDrafts.filter((draft) => draft.id !== action.draftId) }
    case 'updateFoodItemDraft':
      return {
        ...state,
        foodItemDrafts: state.foodItemDrafts.map((draft) =>
          draft.id === action.draftId ? { ...draft, payload: { ...draft.payload, ...action.updates } } : draft
        ),
      }
    case 'confirmFoodItemDraft': {
      // Convert food item draft to meal log and remove the draft
      const draft = state.foodItemDrafts.find((d) => d.id === action.draftId)
      if (!draft || !state.userId) return state

      const meal: MealLog = {
        id: crypto.randomUUID(),
        dayId: buildDayId(state.userId, state.activeDate),
        date: state.activeDate,
        type: draft.mealType,
        items: [draft.payload.item],
        macros: draft.payload.macros,
        source: draft.payload.source === 'text' ? 'api' : draft.payload.source,
        createdAt: new Date().toISOString(),
      }

      return {
        ...state,
        meals: upsertById(state.meals, meal),
        foodItemDrafts: state.foodItemDrafts.filter((d) => d.id !== action.draftId),
      }
    }
    case 'upsertMeal':
      return {
        ...state,
        meals: upsertById(state.meals, action.meal),
      }
    case 'removeMeal':
      return {
        ...state,
        meals: state.meals.filter((meal) => meal.id !== action.mealId),
      }
    case 'upsertWorkout':
      return {
        ...state,
        workouts: upsertById(state.workouts, action.workout),
      }
    case 'removeWorkout':
      return {
        ...state,
        workouts: state.workouts.filter((workout) => workout.id !== action.workoutId),
      }
    case 'setWeeklyPlan':
      return { ...state, weeklyPlan: action.plan }
    case 'setTargets':
      return { ...state, targets: action.targets }
    case 'syncDay':
      return syncDayReducer(state, action.payload)
    case 'setProfile':
      return { ...state, profile: action.profile, profileLoaded: true }
    case 'setUser':
      if (state.userId === action.userId) {
        return state
      }
      return {
        ...defaultState,
        userId: action.userId,
        activeDate: state.activeDate,
        profile: null,
        profileLoaded: false,
      }
    default:
      return state
  }
}

function upsertById<T extends { id: string }>(collection: T[], nextItem: T): T[] {
  const existingIndex = collection.findIndex((item) => item.id === nextItem.id)
  if (existingIndex === -1) return [...collection, nextItem]

  const cloned = [...collection]
  cloned[existingIndex] = nextItem
  return cloned
}

const CoachContext = createContext<CoachContextValue | undefined>(undefined)

interface CoachProviderProps {
  children: ReactNode
}

export function CoachProvider({ children }: CoachProviderProps) {
  const [state, dispatch] = useReducer(coachReducer, defaultState)
  const hydratedRef = useRef(false)
  const fetchedDatesRef = useRef<Set<string>>(new Set())
  const fetchedProfileRef = useRef<string | null>(null)
  const loadedMessagesRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      hydratedRef.current = true
      return
    }

    try {
      const parsed = JSON.parse(raw) as Partial<CoachState>
      dispatch({
        type: 'hydrate',
        state: {
          ...defaultState,
          ...parsed,
          messages: parsed.messages ?? defaultState.messages,
          mealDrafts: parsed.mealDrafts ?? defaultState.mealDrafts,
          meals: parsed.meals ?? defaultState.meals,
          workouts: parsed.workouts ?? defaultState.workouts,
          weeklyPlan: parsed.weeklyPlan ?? defaultState.weeklyPlan,
          targets: parsed.targets ?? defaultState.targets,
          profile: parsed.profile ?? null,
        },
      })
    } catch (error) {
      console.error('Failed to hydrate coach state', error)
    } finally {
      hydratedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!hydratedRef.current || typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!state.userId) return
    const date = state.activeDate
    if (!date || fetchedDatesRef.current.has(`${state.userId}-${date}`)) return

    let cancelled = false
    fetchedDatesRef.current.add(`${state.userId}-${date}`)

    void fetchDaySnapshot(date).then((snapshot) => {
      if (cancelled || !snapshot) return
      dispatch({ type: 'syncDay', payload: snapshot })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeDate, state.userId])

  useEffect(() => {
    fetchedDatesRef.current = new Set()
    fetchedProfileRef.current = null
    loadedMessagesRef.current = null
  }, [state.userId])

  useEffect(() => {
    if (!state.userId) return
    if (fetchedProfileRef.current === state.userId) return

    let cancelled = false
    fetchedProfileRef.current = state.userId

    void fetchUserProfile().then((profile) => {
      if (cancelled) return

      dispatch({ type: 'setProfile', profile })

      const needsOnboarding =
        !profile?.onboardingCompleted && (profile?.onboardingStep ?? 0) === 0;
      if (needsOnboarding) {
        dispatch({
          type: 'replaceMessages',
          messages: [
            {
              id: 'welcome-onboarding',
              role: 'coach',
              content:
                "Welcome! I'll ask a few quick questions to get to know you and tailor your plan.",
              createdAt: new Date().toISOString(),
            },
          ],
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [state.userId])

  useEffect(() => {
    if (!state.userId) return
    if (loadedMessagesRef.current === state.userId) return

    let cancelled = false
    loadedMessagesRef.current = state.userId

    void fetchChatHistory().then((messages) => {
      if (cancelled || !messages || messages.length === 0) return
      dispatch({ type: 'replaceMessages', messages })
    })

    return () => {
      cancelled = true
    }
  }, [state.userId])

  const value = useMemo(() => ({ state, dispatch }), [state])

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>
}

export function useCoachStore() {
  const context = useContext(CoachContext)
  if (!context) {
    throw new Error('useCoachStore must be used within a CoachProvider')
  }
  return context
}

function syncDayReducer(state: CoachState, snapshot: DaySnapshot): CoachState {
  const mealsExcludingDate = state.meals.filter((meal) => meal.date !== snapshot.date)
  const workoutsExcludingDate = state.workouts.filter((workout) => workout.date !== snapshot.date)

  const sortedMeals = [...mealsExcludingDate, ...snapshot.meals].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  const sortedWorkouts = [...workoutsExcludingDate, ...snapshot.workouts].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )

  return {
    ...state,
    meals: sortedMeals,
    workouts: sortedWorkouts,
    targets: snapshot.targets ?? state.targets,
  }
}

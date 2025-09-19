import { addDays, differenceInCalendarDays, parseISO, startOfWeek } from 'date-fns'

import type {
  CoachState,
  MacroBreakdown,
  MealLog,
  MealType,
  WorkoutLog,
  WeeklyPlanEntry,
} from '@/lib/types'

const WEEK_LENGTH = 7

export function getMealsForDate(meals: MealLog[], date: string) {
  return meals.filter((meal) => meal.date === date)
}

export function getWorkoutsForDate(workouts: WorkoutLog[], date: string) {
  return workouts.filter((workout) => workout.date === date)
}

export function calculateDailyTotals(meals: MealLog[]): MacroBreakdown {
  return meals.reduce<MacroBreakdown>(
    (acc, meal) => ({
      calories: acc.calories + meal.macros.calories,
      protein: acc.protein + meal.macros.protein,
      fat: acc.fat + meal.macros.fat,
      carbs: acc.carbs + meal.macros.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  )
}

export function getMealsByType(meals: MealLog[]): Record<MealType, MealLog[]> {
  return meals.reduce<Record<MealType, MealLog[]>>(
    (acc, meal) => {
      acc[meal.type] = acc[meal.type].concat(meal)
      return acc
    },
    { breakfast: [], lunch: [], dinner: [], snack: [] },
  )
}

export function getWeeklyWorkoutStats(state: CoachState) {
  const today = parseISO(state.activeDate)
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })

  const workoutsThisWeek = state.workouts.filter((workout) => {
    const date = parseISO(workout.date)
    return differenceInCalendarDays(date, weekStart) >= 0 && differenceInCalendarDays(date, weekStart) < WEEK_LENGTH
  })

  const completed = workoutsThisWeek.filter((workout) => workout.status === 'completed')
  const totalMinutes = completed.reduce((total, workout) => total + workout.minutes, 0)
  const planMinutes = state.weeklyPlan.reduce((total, entry) => total + entry.minutesTarget, 0)
  const adherence = planMinutes === 0 ? 0 : Math.min(100, Math.round((totalMinutes / planMinutes) * 100))

  return {
    workoutsCompleted: completed.length,
    totalMinutes,
    adherence,
  }
}

export function getUpcomingPlan(state: CoachState): WeeklyPlanEntry | null {
  const todayDate = parseISO(state.activeDate)
  const todayWeekday = todayDate.getDay()

  const sortedPlan = [...state.weeklyPlan].sort((a, b) => a.weekday - b.weekday)

  return (
    sortedPlan.find((entry) => entry.weekday >= todayWeekday) ?? sortedPlan[0] ?? null
  )
}

export function getRecentMeals(state: CoachState, limit = 3): MealLog[] {
  return [...state.meals]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export function getDaySummary(state: CoachState, date: string) {
  const meals = getMealsForDate(state.meals, date)
  const workouts = getWorkoutsForDate(state.workouts, date)
  const totals = calculateDailyTotals(meals)

  return {
    meals,
    workouts,
    totals,
  }
}

export function projectTomorrow(date: string) {
  return addDays(parseISO(date), 1).toISOString().slice(0, 10)
}

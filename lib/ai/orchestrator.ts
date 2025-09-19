import { detectIntent } from '@/lib/ai/intents'
import { requestMealDraftFromText } from '@/lib/api/client'
import { parseMealFromText } from '@/lib/ai/parsers'
import { parseWorkoutFromText } from '@/lib/ai/workouts'
import { calculateDailyTotals, getDaySummary, getUpcomingPlan, getWeeklyWorkoutStats } from '@/lib/data/queries'
import type { CoachState, MealDraft, MacroBreakdown, MealType, WorkoutLog } from '@/lib/types'

interface CoachReply {
  coachMessage: string
  mealDraft?: MealDraft
  workoutLog?: WorkoutLog
}

export async function orchestrateCoachReply(message: string, state: CoachState): Promise<CoachReply> {
  const intent = detectIntent(message)

  switch (intent.type) {
    case 'logMeal':
      return handleMealLogging(intent.payload.text, state)
    case 'logWorkout':
      return handleWorkoutLogging(intent.payload.text, state)
    case 'askPlan':
      return {
        coachMessage: describeUpcomingPlan(state),
      }
    case 'askNutritionSummary':
      return {
        coachMessage: summarizeNutrition(state),
      }
    case 'askProgress':
      return {
        coachMessage: summarizeProgress(state),
      }
    case 'statusUpdate':
      return {
        coachMessage: respondToStatus(intent.payload.mood, state),
      }
    case 'smallTalk':
      return {
        coachMessage: 'Happy you checked in. Anything you want to focus on today?',
      }
    default:
      return {
        coachMessage: generalNudge(state),
      }
  }
}

async function handleMealLogging(text: string, state: CoachState): Promise<CoachReply> {
  const draftFromApi = await requestMealDraftFromText(text)
  const parsed = draftFromApi
    ? {
        mealType: (draftFromApi.mealType ?? 'snack') as MealType,
        items: draftFromApi.items,
        macros: draftFromApi.macros,
        confidence: draftFromApi.confidence,
      }
    : await parseMealFromText(text)
  const draft: MealDraft = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    payload: {
      type: parsed.mealType,
      items: parsed.items,
      macros: parsed.macros,
      originalText: text,
      confidence: parsed.confidence,
      source: 'text',
    },
  }

  const todaysTotals = calculateDailyTotals(state.meals.filter((meal) => meal.date === state.activeDate))

  const projectedTotals = addMacros(todaysTotals, parsed.macros)

  const comparison =
    `That adds about ${parsed.macros.protein.toFixed(0)}g protein and ${parsed.macros.calories.toFixed(0)} calories. ` +
    `Projected today → ${projectedTotals.protein.toFixed(0)}g protein / ${projectedTotals.calories.toFixed(0)} cal.`

  const coachMessage =
    parsed.confidence === 'low'
      ? "I can take a guess at that meal, but double-check the details before we log it."
      : `Nice. ${comparison} Does that look right?`

  return {
    coachMessage,
    mealDraft: draft,
  }
}

function handleWorkoutLogging(text: string, state: CoachState): CoachReply {
  const parsed = parseWorkoutFromText(text)
  const workout: WorkoutLog = {
    id: crypto.randomUUID(),
    dayId: state.activeDate,
    date: state.activeDate,
    type: parsed.type,
    minutes: parsed.minutes,
    intensity: parsed.intensity,
    description: parsed.description,
    status: 'completed',
    createdAt: new Date().toISOString(),
    rawText: text,
    distance: parsed.distance,
  }

  const updatedStats = getWeeklyWorkoutStats({ ...state, workouts: [...state.workouts, workout] })
  const todayWeekday = new Date(state.activeDate).getDay()
  const todaysPlan = state.weeklyPlan.find((entry) => entry.weekday === todayWeekday)

  const planDelta = todaysPlan ? todaysPlan.minutesTarget - workout.minutes : null

  const comparison = todaysPlan
    ? planDelta && planDelta > 5
      ? `That keeps you within ${Math.abs(planDelta)} minutes of today's ${todaysPlan.focus} target.`
      : `You just knocked out the ${todaysPlan.focus} focus. Nice work.`
    : 'Logged and counted. Every bit of movement adds up.'

  const distanceSnippet = parsed.distance ? ` ~${parsed.distance} distance logged.` : ''

  const coachMessage =
    `Logged ${workout.type.toLowerCase()} for ${workout.minutes} minutes${distanceSnippet}. ${comparison} ` +
    `Week total → ${updatedStats.workoutsCompleted} sessions / ${updatedStats.totalMinutes} minutes (${updatedStats.adherence}% of plan).`

  return {
    coachMessage,
    workoutLog: workout,
  }
}

function describeUpcomingPlan(state: CoachState) {
  const plan = getUpcomingPlan(state)
  if (!plan) return "Let's keep today flexible. Take a short walk and check in afterwards."

  return `Today's plan: ${plan.focus} for about ${plan.minutesTarget} minutes at a ${plan.suggestedIntensity} pace. Want to stick with it or adjust?`
}

function summarizeNutrition(state: CoachState) {
  const { meals, totals } = getDaySummary(state, state.activeDate)
  if (meals.length === 0) {
    return "No meals logged yet today. Share whatever you've eaten and I'll give you directional feedback."
  }

  return `You've logged ${meals.length} meals today, putting you around ${totals.calories.toFixed(0)} calories with ${totals.protein.toFixed(0)}g protein. That keeps you ${state.targets.protein - totals.protein > 0 ? `${(state.targets.protein - totals.protein).toFixed(0)}g under` : `${(totals.protein - state.targets.protein).toFixed(0)}g over`} the protein target.`
}

function summarizeProgress(state: CoachState) {
  const stats = getWeeklyWorkoutStats(state)
  if (stats.workoutsCompleted === 0) {
    return "No recorded movement this week yet. Even a 10-minute walk counts—log it and I'll adjust your plan."
  }

  return `You've finished ${stats.workoutsCompleted} sessions for ${stats.totalMinutes} minutes. That's about ${stats.adherence}% of the plan so far. Nice consistency.`
}

function respondToStatus(mood: 'tired' | 'sore' | 'energized' | 'neutral', state: CoachState) {
  const todayPlan = getUpcomingPlan(state)
  switch (mood) {
    case 'tired':
      return todayPlan
        ? `Thanks for telling me. Let's swap today's ${todayPlan.focus.toLowerCase()} for 15 minutes of easy mobility instead. Sound good?`
        : "Thanks for telling me. Let's dial things back—consider a light walk or mobility and call it good."
    case 'sore':
      return "Recovery matters. Focus on easy movement and hydration today; we can push again once you're fresher."
    case 'energized':
      return todayPlan
        ? `Love that energy. Want to extend today's ${todayPlan.focus.toLowerCase()} by 5-10 minutes or add a finisher?`
        : "Love that energy. Want to extend today's session a bit or add a finisher?"
    default:
      return "Noted. Anything you'd like to adjust in your plan or meals?"
  }
}

function addMacros(base: MacroBreakdown, delta: MacroBreakdown): MacroBreakdown {
  return {
    calories: base.calories + delta.calories,
    protein: base.protein + delta.protein,
    fat: base.fat + delta.fat,
    carbs: base.carbs + delta.carbs,
  }
}

function generalNudge(state: CoachState) {
  const stats = getWeeklyWorkoutStats(state)

  if (stats.workoutsCompleted === 0) {
    return "Thanks for the update. Want to log a short walk or stretch session? Even 10 minutes counts toward the plan."
  }

  const todayMeals = state.meals.filter((meal) => meal.date === state.activeDate)
  if (todayMeals.length === 0) {
    return "Tell me about your first meal when you grab it—I’ll keep your macros directional, no calorie math required."
  }

  return "Thanks for sharing. Want me to log anything else or adjust today's plan?"
}

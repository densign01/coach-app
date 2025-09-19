import { detectIntent } from '@/lib/ai/intents'
import { generateCoachResponse, requestMealDraftFromText } from '@/lib/api/client'
import { parseMealFromText } from '@/lib/ai/parsers'
import { parseWorkoutFromText } from '@/lib/ai/workouts'
import { calculateDailyTotals, getDaySummary, getUpcomingPlan, getWeeklyWorkoutStats } from '@/lib/data/queries'
import type { CoachState, MealDraft, MacroBreakdown, MealType, WorkoutLog } from '@/lib/types'
import { buildDayId } from '@/lib/utils'

interface CoachReply {
  coachMessage: string
  mealDraft?: MealDraft
  workoutLog?: WorkoutLog
}

export async function orchestrateCoachReply(message: string, state: CoachState): Promise<CoachReply> {
  const intent = detectIntent(message)

  switch (intent.type) {
    case 'logMeal':
      return await handleMealLogging(intent.payload.text, state)
    case 'logWorkout':
      return await handleWorkoutLogging(intent.payload.text, state)
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
      return await buildGenerativeReply(state, message, { energyNote: describeMood(intent.payload.mood, message) })
    case 'smallTalk':
    case 'unknown':
    default:
      return await buildGenerativeReply(state, message, {})
  }
}

async function handleMealLogging(text: string, state: CoachState): Promise<CoachReply> {
  const draftFromApi = await requestMealDraftFromText(text)
  const parsed = draftFromApi
    ? {
        mealType: (draftFromApi.mealType ?? 'snack') as MealType,
        items: draftFromApi.items,
        macros: parsedMacros(draftFromApi.macros),
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

  const mealSummary = `${parsed.items.join(', ')} (~${Math.round(parsed.macros.protein)}g protein / ${Math.round(parsed.macros.calories)} cal)`

  const coachMessage =
    (await generateCoachResponse({
      userMessage: text,
      state,
      mealDraftSummary: mealSummary,
      intent: 'meal_log',
    })) ??
    (parsed.confidence === 'low'
      ? "I can take a guess at that meal, but double-check the details before we log it."
      : `Nice. That adds about ${parsed.macros.protein.toFixed(0)}g protein and ${parsed.macros.calories.toFixed(0)} calories. Projected today → ${projectedTotals.protein.toFixed(0)}g protein / ${projectedTotals.calories.toFixed(0)} cal. Does that look right?`)

  return {
    coachMessage,
    mealDraft: draft,
  }
}

async function handleWorkoutLogging(text: string, state: CoachState): Promise<CoachReply> {
  if (!state.userId) {
    return {
      coachMessage: 'Please sign in so I can log your activity.',
    }
  }

  const parsed = parseWorkoutFromText(text)
  const dayId = buildDayId(state.userId, state.activeDate)
  const workout: WorkoutLog = {
    id: crypto.randomUUID(),
    dayId,
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

  const workoutSummary = `${workout.type} for ${workout.minutes} minutes${parsed.distance ? ` (~${parsed.distance} distance)` : ''}`

  const coachMessage =
    (await generateCoachResponse({
      userMessage: text,
      state,
      workoutSummary,
      intent: 'workout_log',
    })) ??
    defaultWorkoutMessage(workout, state)

  return {
    coachMessage,
    workoutLog: workout,
  }
}

function defaultWorkoutMessage(workout: WorkoutLog, state: CoachState) {
  const updatedStats = getWeeklyWorkoutStats({ ...state, workouts: [...state.workouts, workout] })
  const todayWeekday = new Date(state.activeDate).getDay()
  const todaysPlan = state.weeklyPlan.find((entry) => entry.weekday === todayWeekday)
  const planDelta = todaysPlan ? todaysPlan.minutesTarget - workout.minutes : null
  const comparison = todaysPlan
    ? planDelta && planDelta > 5
      ? `That keeps you within ${Math.abs(planDelta)} minutes of today's ${todaysPlan.focus} target.`
      : `You just knocked out the ${todaysPlan.focus} focus. Nice work.`
    : 'Logged and counted. Every bit of movement adds up.'
  const distanceSnippet = workout.distance ? ` ~${workout.distance} distance logged.` : ''

  return `Logged ${workout.type.toLowerCase()} for ${workout.minutes} minutes${distanceSnippet}. ${comparison} Week total → ${updatedStats.workoutsCompleted} sessions / ${updatedStats.totalMinutes} minutes (${updatedStats.adherence}% of plan).`
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

function addMacros(base: MacroBreakdown, delta: MacroBreakdown): MacroBreakdown {
  return {
    calories: base.calories + delta.calories,
    protein: base.protein + delta.protein,
    fat: base.fat + delta.fat,
    carbs: base.carbs + delta.carbs,
  }
}

async function buildGenerativeReply(
  state: CoachState,
  userMessage: string,
  { energyNote }: { energyNote?: string },
): Promise<CoachReply> {
  const generated = await generateCoachResponse({
    userMessage,
    state,
    energyNote,
    intent: 'status_update',
  })

  if (generated) {
    return { coachMessage: generated }
  }

  if (energyNote && energyNote.toLowerCase().includes('unwell')) {
    return {
      coachMessage: "Thanks for telling me. Let's listen to your body—take the day to recover with light movement or extra rest, and we'll reassess tomorrow."
    }
  }

  return { coachMessage: fallbackGeneral(state) }
}

function fallbackGeneral(state: CoachState) {
  const stats = getWeeklyWorkoutStats(state)

  if (stats.workoutsCompleted === 0) {
    return 'Thanks for the update. Want to log a short walk or stretch session? Even 10 minutes counts toward the plan.'
  }

  const todayMeals = state.meals.filter((meal) => meal.date === state.activeDate)
  if (todayMeals.length === 0) {
    return "Tell me about your first meal when you grab it—I’ll keep your macros directional, no calorie math required."
  }

  return "Thanks for sharing. Want me to log anything else or adjust today's plan?"
}

function parsedMacros(macros: MacroBreakdown) {
  return {
    calories: Number(macros.calories ?? 0),
    protein: Number(macros.protein ?? 0),
    fat: Number(macros.fat ?? 0),
    carbs: Number(macros.carbs ?? 0),
  }
}

function describeMood(mood: 'tired' | 'sore' | 'energized' | 'neutral', message: string) {
  switch (mood) {
    case 'tired':
      return `User reports low energy / feeling unwell: "${message}"`
    case 'sore':
      return `User reports soreness and may need recovery: "${message}"`
    case 'energized':
      return `User feels energized and ready for more: "${message}"`
    default:
      return undefined
  }
}

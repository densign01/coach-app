import { detectIntent } from '@/lib/ai/intents'
import { generateCoachResponse, requestMealDraftFromText, upsertUserProfile } from '@/lib/api/client'
import { parseMealFromText } from '@/lib/ai/parsers'
import { parseWorkoutFromText } from '@/lib/ai/workouts'
import { enrichNutritionEstimates } from '@/lib/ai/macro-estimator'
import {
  getNextOnboardingStep,
  getOnboardingStep,
  parseOnboardingResponse,
  parseHeightToCm,
  parseWeightToKg,
  generateOnboardingResponse,
  generateProfileSummary,
} from '@/lib/ai/onboarding'
import { calculateDailyTotals, getDaySummary, getUpcomingPlan, getWeeklyWorkoutStats } from '@/lib/data/queries'
import type {
  CoachState,
  MealDraft,
  FoodItemDraft,
  MacroBreakdown,
  MealType,
  MealParseResult,
  NutritionEstimate,
  StructuredMealItem,
  WorkoutLog,
  UserProfile,
} from '@/lib/types'
import { buildDayId } from '@/lib/utils'

interface CoachReply {
  coachMessage: string
  mealDraft?: MealDraft
  foodItemDrafts?: FoodItemDraft[]
  workoutLog?: WorkoutLog
  profileUpdate?: UserProfile
}

export async function orchestrateCoachReply(message: string, state: CoachState): Promise<CoachReply> {
  // Check if user is in onboarding flow
  const profile = state.profile
  const isInOnboarding =
    state.profileLoaded && !profile?.onboardingCompleted && (profile?.onboardingStep ?? 0) >= 0

  if (isInOnboarding) {
    return await handleOnboardingFlow(message, state)
  }

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
      return await buildGenerativeReply(state, message, {
        energyNote: describeMood(intent.payload.mood, message),
        intent: 'status_update',
      })
    case 'smallTalk':
    case 'unknown':
    default:
      return await buildGenerativeReply(state, message, { intent: 'general' })
  }
}

async function handleMealLogging(text: string, state: CoachState): Promise<CoachReply> {
  const draftFromApi = await requestMealDraftFromText(text)
  const parsed: MealParseResult = draftFromApi ?? (await parseMealFromText(text))

  console.log('[ORCHESTRATOR] Parsed meal result:', parsed)

  const normalizedMealType = toAppMealType(parsed.mealType)
  const groupId = crypto.randomUUID()
  const now = new Date().toISOString()

  const enrichedItems = await enrichNutritionEstimates(parsed.items, {
    mealType: parsed.mealType,
    inputText: text,
  })

  const foodItemDrafts: FoodItemDraft[] = enrichedItems.map((item) => ({
    id: crypto.randomUUID(),
    createdAt: now,
    mealType: normalizedMealType,
    groupId,
    payload: {
      item: cloneStructuredItem(item),
      originalText: text,
      confidence: parsed.confidence,
      source: parsed.audit?.source === 'heuristic' ? 'heuristic' : 'llm',
    },
  }))

  console.log('[ORCHESTRATOR] Created food item drafts:', foodItemDrafts)

  const totalEstimate = parsed.totals ?? computeTotalsFromItems(enrichedItems)
  const totalMacros = nutritionEstimateToMacroBreakdown(totalEstimate)
  const todaysTotals = calculateDailyTotals(state.meals.filter((meal) => meal.date === state.activeDate))
  const projectedTotals = addMacros(todaysTotals, totalMacros)

  const itemsList = enrichedItems.map((item) => item.name).join(', ')
  const mealSummary = `${itemsList} (~${Math.round(totalMacros.protein)}g protein / ${Math.round(totalMacros.calories)} cal)`

  const aiResponse = await generateCoachResponse({
    userMessage: text,
    state,
    mealDraftSummary: mealSummary,
    intent: 'meal_log',
    profile: state.profile,
    history: state.messages,
  })

  let coachMessage = aiResponse.message

  if (!coachMessage) {
    coachMessage = parsed.confidence === 'low'
      ? "I can take a guess at those foods, but double-check the details before we log them."
      : `Nice. That adds about ${totalMacros.protein.toFixed(0)}g protein and ${totalMacros.calories.toFixed(0)} calories. Projected today → ${projectedTotals.protein.toFixed(0)}g protein / ${projectedTotals.calories.toFixed(0)} cal. Look good?`
  }

  let profileUpdate: UserProfile | undefined
  if (aiResponse.insight) {
    const updated = await appendInsightToProfile(state.profile, aiResponse.insight)
    if (updated) {
      profileUpdate = updated
    }
  }

  return {
    coachMessage,
    foodItemDrafts,
    profileUpdate,
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

  const aiResponse = await generateCoachResponse({
    userMessage: text,
    state,
    workoutSummary,
    intent: 'workout_log',
    profile: state.profile,
    history: state.messages,
  })

  const coachMessage = aiResponse.message ?? defaultWorkoutMessage(workout, state)

  let profileUpdate: UserProfile | undefined
  if (aiResponse.insight) {
    const updated = await appendInsightToProfile(state.profile, aiResponse.insight)
    if (updated) {
      profileUpdate = updated
    }
  }

  return {
    coachMessage,
    workoutLog: workout,
    profileUpdate,
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

function toAppMealType(mealType: MealParseResult['mealType']): MealType {
  switch (mealType) {
    case 'breakfast':
    case 'lunch':
    case 'dinner':
    case 'snack':
      return mealType
    case 'drink':
    case 'unknown':
    default:
      return inferMealTypeFromClock()
  }
}

function inferMealTypeFromClock(): MealType {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 20) return 'dinner'
  return 'snack'
}

function cloneStructuredItem(item: StructuredMealItem): StructuredMealItem {
  return {
    ...item,
    preparation: [...(item.preparation ?? [])],
    quantity: { ...item.quantity },
    alcohol: item.alcohol ? { ...item.alcohol } : null,
    nutritionEstimate: item.nutritionEstimate ? { ...item.nutritionEstimate } : null,
    lookup: item.lookup
      ? {
          status: item.lookup.status,
          candidates: [...item.lookup.candidates.map((candidate) => ({ ...candidate }))],
        }
      : undefined,
    flags: item.flags ? { ...item.flags } : undefined,
  }
}

function computeTotalsFromItems(items: StructuredMealItem[]): NutritionEstimate | null {
  let hasValues = false
  const totals = items.reduce<NutritionEstimate>(
    (acc, item) => {
      const nutrition = item.nutritionEstimate
      if (!nutrition) {
        return acc
      }
      hasValues = true
      return {
        caloriesKcal: sumNumbers(acc.caloriesKcal, nutrition.caloriesKcal),
        proteinG: sumNumbers(acc.proteinG, nutrition.proteinG),
        carbsG: sumNumbers(acc.carbsG, nutrition.carbsG),
        fatG: sumNumbers(acc.fatG, nutrition.fatG),
        fiberG: sumNumbers(acc.fiberG ?? null, nutrition.fiberG ?? null),
        source: nutrition.source ?? acc.source,
        confidence: averageNumeric(acc.confidence, nutrition.confidence),
      }
    },
    {
      caloriesKcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      source: 'heuristic',
      confidence: 0.5,
    },
  )

  return hasValues ? totals : null
}

function nutritionEstimateToMacroBreakdown(nutrition: NutritionEstimate | null | undefined): MacroBreakdown {
  return {
    calories: Number(nutrition?.caloriesKcal ?? 0),
    protein: Number(nutrition?.proteinG ?? 0),
    fat: Number(nutrition?.fatG ?? 0),
    carbs: Number(nutrition?.carbsG ?? 0),
  }
}

function sumNumbers(a: number | null | undefined, b: number | null | undefined): number | null {
  const first = a ?? 0
  const second = b ?? 0
  const total = first + second
  return Number.isNaN(total) ? null : Number(total.toFixed(2))
}

function averageNumeric(a: number | null | undefined, b: number | null | undefined): number | null {
  const values = [a, b].filter((value): value is number => value !== null && value !== undefined)
  if (values.length === 0) return null
  const total = values.reduce((acc, value) => acc + value, 0)
  return Number((total / values.length).toFixed(2))
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
  { energyNote, intent }: { energyNote?: string; intent?: string },
): Promise<CoachReply> {
  const aiResponse = await generateCoachResponse({
    userMessage,
    state,
    energyNote,
    intent,
    profile: state.profile,
    history: state.messages,
  })

  let coachMessage = aiResponse.message

  if (!coachMessage) {
    if (energyNote && energyNote.toLowerCase().includes('unwell')) {
      coachMessage = "Thanks for telling me. Let's listen to your body—take the day to recover with light movement or extra rest, and we'll reassess tomorrow."
    } else {
      coachMessage = fallbackGeneral(state)
    }
  }

  let profileUpdate: UserProfile | undefined
  if (aiResponse.insight) {
    const updated = await appendInsightToProfile(state.profile, aiResponse.insight)
    if (updated) {
      profileUpdate = updated
    }
  }

  return { coachMessage, profileUpdate }
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

async function appendInsightToProfile(profile: UserProfile | null, insight: string | null): Promise<UserProfile | null> {
  if (!profile?.userId) return null
  if (!insight || insight.trim().length === 0) return null

  const trimmed = insight.trim()
  const existingInsights = Array.isArray(profile.insights) ? profile.insights : []
  if (existingInsights[0] === trimmed) return profile
  const normalizedInsights = [trimmed, ...existingInsights.filter((item) => item !== trimmed)].slice(0, 20)

  const updatedProfile: UserProfile = {
    ...profile,
    insights: normalizedInsights,
    onboardingData: {
      ...(profile.onboardingData ?? {}),
      insights: normalizedInsights,
    },
  }

  const saved = await upsertUserProfile(updatedProfile)
  return saved ?? updatedProfile
}

async function handleOnboardingFlow(message: string, state: CoachState): Promise<CoachReply> {
  const profile = state.profile
  const currentStep = profile?.onboardingStep ?? 0
  const onboardingData = profile?.onboardingData ?? {}

  // If this is the first message, start onboarding
  if (currentStep === 0) {
    const firstStep = getOnboardingStep(1)
    if (!firstStep) {
      return { coachMessage: "Sorry, there was an issue with the onboarding flow." }
    }

    const updatedProfile: UserProfile = {
      ...(profile ?? {}),
      userId: state.userId!,
      onboardingStep: 1,
      onboardingData,
      onboardingCompleted: false,
    }

    // Save the updated profile
    return {
      coachMessage: firstStep.question,
      profileUpdate: (await upsertUserProfile(updatedProfile)) ?? updatedProfile,
    }
  }

  // Process the user's response to the current step
  const currentStepData = getOnboardingStep(currentStep)
  if (!currentStepData) {
    return { coachMessage: "Let me start over with a fresh approach to getting to know you." }
  }

  let updatedData = { ...onboardingData }
  const updatedProfile: UserProfile = { ...(profile ?? {}), userId: state.userId! }

  // Parse the response based on the current step
  if (currentStep > 1) { // Skip parsing for the welcome message
    const parsedData = parseOnboardingResponse(currentStepData, message, onboardingData)
    updatedData = { ...updatedData, ...parsedData }

    // Handle special parsing for height and weight
    if (currentStepData.field === 'heightCm') {
      const heightCm = parseHeightToCm(message)
      if (heightCm) {
        updatedProfile.heightCm = heightCm
      }
    } else if (currentStepData.field === 'weightKg') {
      const weightKg = parseWeightToKg(message)
      if (weightKg) {
        updatedProfile.weightKg = weightKg
      }
    }

    // Update profile fields directly
    if (currentStepData.field && currentStepData.field !== 'custom') {
      const fieldKey = currentStepData.field as keyof UserProfile
      const fieldValue = parsedData[currentStepData.field as string]
      if (fieldValue !== undefined) {
        ;(updatedProfile as Record<string, unknown>)[fieldKey as string] = fieldValue
      }
    }
  }

  // Move to next step
  const nextStep = getNextOnboardingStep(currentStep, updatedData)

  if (!nextStep) {
    // Onboarding complete
    updatedProfile.onboardingCompleted = true
    updatedProfile.onboardingStep = currentStep + 1
    updatedProfile.onboardingData = updatedData
    const profileSummary = await generateProfileSummary(updatedProfile, updatedData)
    updatedProfile.profileSummary = profileSummary

    const savedProfile = await upsertUserProfile(updatedProfile)
    const finalProfile = savedProfile ?? updatedProfile

    return {
      coachMessage: `${profileSummary}\n\nNow, tell me about your energy, meals, or movement today and I'll help you chart the next step.`,
      profileUpdate: finalProfile,
    }
  }

  // Continue to next step with conversational response
  updatedProfile.onboardingStep = nextStep.id
  updatedProfile.onboardingData = updatedData

  const savedProfile = await upsertUserProfile(updatedProfile)

  // Generate conversational response that acknowledges current answer and asks next question
  const conversationalMessage = await generateOnboardingResponse(message, currentStepData, nextStep, updatedData)

  return {
    coachMessage: conversationalMessage,
    profileUpdate: savedProfile ?? updatedProfile,
  }
}

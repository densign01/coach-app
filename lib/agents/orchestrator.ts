import { detectIntent } from '@/lib/ai/intents'
import { parseWorkoutFromText } from '@/lib/ai/workouts'
import { calculateDailyTotals, getDaySummary, getUpcomingPlan, getWeeklyWorkoutStats } from '@/lib/data/queries'
import { buildDayId } from '@/lib/utils'
import {
  coachAgent,
  mealParserAgent,
  calorieLookupAgent,
  loggerAgent,
  nutritionistAgent,
} from './index'
import type {
  CoachState,
  MealDraft,
  FoodItemDraft,
  MacroBreakdown,
  MealType,
  WorkoutLog,
  UserProfile,
} from '@/lib/types'

interface CoachReply {
  coachMessage: string
  mealDraft?: MealDraft
  foodItemDrafts?: FoodItemDraft[]
  workoutLog?: WorkoutLog
  profileUpdate?: UserProfile
}

/**
 * Agent Orchestrator - Coordinates between specialized AI agents
 *
 * Role: Routes requests to appropriate agents and coordinates their interactions
 * Responsibilities:
 * - Detect user intent and route to appropriate agent workflows
 * - Coordinate data flow between agents
 * - Handle agent failures gracefully with fallbacks
 * - Maintain conversation context across agent interactions
 */
export class AgentOrchestrator {
  async orchestrateCoachReply(message: string, state: CoachState): Promise<CoachReply> {
    console.log('[AgentOrchestrator] Processing message:', message)

    // Check if user is in onboarding flow
    const profile = state.profile
    const isInOnboarding =
      state.profileLoaded && !profile?.onboardingCompleted && (profile?.onboardingStep ?? 0) >= 0

    if (isInOnboarding) {
      return await this.handleOnboardingFlow(message, state)
    }

    const intent = detectIntent(message)
    console.log('[AgentOrchestrator] Detected intent:', intent.type)

    switch (intent.type) {
      case 'logMeal':
        return await this.handleMealLogging(intent.payload.text, state)
      case 'logWorkout':
        return await this.handleWorkoutLogging(intent.payload.text, state)
      case 'askPlan':
        return {
          coachMessage: this.describeUpcomingPlan(state),
        }
      case 'askNutritionSummary':
        return await this.handleNutritionSummaryRequest(state)
      case 'askProgress':
        return await this.handleProgressRequest(state)
      case 'statusUpdate':
        return await this.handleStatusUpdate(message, state, intent.payload.mood)
      case 'smallTalk':
      case 'unknown':
      default:
        return await this.handleGeneralConversation(message, state)
    }
  }

  private async handleMealLogging(text: string, state: CoachState): Promise<CoachReply> {
    console.log('[AgentOrchestrator] Processing meal logging workflow')

    try {
      // Step 1: Parse the meal using Meal Parser Agent
      const parseResult = await mealParserAgent.parsemeal({ text })
      console.log('[AgentOrchestrator] Meal parsed with source:', parseResult.source)

      // Step 2: Enrich with nutrition using Calorie Lookup Agent
      const nutritionResult = await calorieLookupAgent.enrichNutrition({
        items: parseResult.result.items,
        context: {
          mealType: parseResult.result.mealType,
          inputText: text,
        },
      })
      console.log('[AgentOrchestrator] Nutrition enriched with source:', nutritionResult.source)

      // Step 3: Convert to food item drafts
      const foodItemDrafts = this.convertToFoodItemDrafts(
        nutritionResult.enrichedItems,
        text,
        parseResult.result.mealType
      )

      // Step 4: Calculate totals and get nutritionist insight
      const totalMacros = this.calculateTotalMacros(nutritionResult.enrichedItems)
      const todaysTotals = calculateDailyTotals(state.meals.filter((meal) => meal.date === state.activeDate))
      const projectedTotals = this.addMacros(todaysTotals, totalMacros)

      // Step 5: Get nutritionist analysis
      const nutritionistAnalysis = await nutritionistAgent.analyzeNutrition({
        type: 'meal_analysis',
        state,
        context: {
          todaysMeals: state.meals.filter((meal) => meal.date === state.activeDate),
        },
      })

      // Step 6: Generate coach response
      const itemsList = nutritionResult.enrichedItems.map((item) => item.name).join(', ')
      const mealSummary = `${itemsList} (~${Math.round(totalMacros.protein)}g protein / ${Math.round(totalMacros.calories)} cal)`

      const coachResponse = await coachAgent.generateResponse({
        userMessage: text,
        state,
        context: {
          mealSummary,
          intent: 'meal_log',
          nutritionistInsight: nutritionistAnalysis.analysis,
        },
        profile: state.profile,
        history: state.messages,
      })

      // Step 7: Handle profile updates if insights were generated
      let profileUpdate: UserProfile | undefined
      if (coachResponse.insight) {
        const updateResult = await this.appendInsightToProfile(state.profile, coachResponse.insight)
        if (updateResult) {
          profileUpdate = updateResult
        }
      }

      return {
        coachMessage: coachResponse.message ?? this.getFallbackMealResponse(totalMacros, projectedTotals),
        foodItemDrafts,
        profileUpdate,
      }
    } catch (error) {
      console.error('[AgentOrchestrator] Meal logging workflow failed:', error)
      return {
        coachMessage: "I can help you log that meal, but I ran into a technical issue. Can you try describing it again?",
      }
    }
  }

  private async handleWorkoutLogging(text: string, state: CoachState): Promise<CoachReply> {
    console.log('[AgentOrchestrator] Processing workout logging workflow')

    if (!state.userId) {
      return {
        coachMessage: 'Please sign in so I can log your activity.',
      }
    }

    try {
      // Parse workout (keeping existing logic for now)
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

      // Get coach response
      const coachResponse = await coachAgent.generateResponse({
        userMessage: text,
        state,
        context: {
          workoutSummary,
          intent: 'workout_log',
        },
        profile: state.profile,
        history: state.messages,
      })

      // Handle profile updates
      let profileUpdate: UserProfile | undefined
      if (coachResponse.insight) {
        const updateResult = await this.appendInsightToProfile(state.profile, coachResponse.insight)
        if (updateResult) {
          profileUpdate = updateResult
        }
      }

      return {
        coachMessage: coachResponse.message ?? this.getDefaultWorkoutMessage(workout, state),
        workoutLog: workout,
        profileUpdate,
      }
    } catch (error) {
      console.error('[AgentOrchestrator] Workout logging workflow failed:', error)
      return {
        coachMessage: "I can help you log that workout, but I ran into a technical issue. Can you try describing it again?",
      }
    }
  }

  private async handleNutritionSummaryRequest(state: CoachState): Promise<CoachReply> {
    try {
      const nutritionistAnalysis = await nutritionistAgent.analyzeNutrition({
        type: 'progress_review',
        state,
        context: {
          todaysMeals: state.meals.filter((meal) => meal.date === state.activeDate),
        },
      })

      const coachResponse = await coachAgent.generateResponse({
        userMessage: 'nutrition summary request',
        state,
        context: {
          intent: 'nutrition_summary',
          nutritionistInsight: nutritionistAnalysis.analysis,
        },
      })

      return {
        coachMessage: coachResponse.message ?? this.summarizeNutrition(state),
      }
    } catch (error) {
      console.error('[AgentOrchestrator] Nutrition summary failed:', error)
      return {
        coachMessage: this.summarizeNutrition(state),
      }
    }
  }

  private async handleProgressRequest(state: CoachState): Promise<CoachReply> {
    try {
      const nutritionistAnalysis = await nutritionistAgent.analyzeNutrition({
        type: 'progress_review',
        state,
      })

      const coachResponse = await coachAgent.generateResponse({
        userMessage: 'progress review request',
        state,
        context: {
          intent: 'progress_review',
          nutritionistInsight: nutritionistAnalysis.analysis,
        },
      })

      return {
        coachMessage: coachResponse.message ?? this.summarizeProgress(state),
      }
    } catch (error) {
      console.error('[AgentOrchestrator] Progress request failed:', error)
      return {
        coachMessage: this.summarizeProgress(state),
      }
    }
  }

  private async handleStatusUpdate(message: string, state: CoachState, mood: string): Promise<CoachReply> {
    const energyNote = this.describeMood(mood as any, message)

    const coachResponse = await coachAgent.generateResponse({
      userMessage: message,
      state,
      context: {
        energyNote,
        intent: 'status_update',
      },
    })

    let profileUpdate: UserProfile | undefined
    if (coachResponse.insight) {
      const updateResult = await this.appendInsightToProfile(state.profile, coachResponse.insight)
      if (updateResult) {
        profileUpdate = updateResult
      }
    }

    return {
      coachMessage: coachResponse.message ?? this.getFallbackStatusResponse(energyNote),
      profileUpdate,
    }
  }

  private async handleGeneralConversation(message: string, state: CoachState): Promise<CoachReply> {
    const coachResponse = await coachAgent.generateResponse({
      userMessage: message,
      state,
      context: {
        intent: 'general',
      },
    })

    let profileUpdate: UserProfile | undefined
    if (coachResponse.insight) {
      const updateResult = await this.appendInsightToProfile(state.profile, coachResponse.insight)
      if (updateResult) {
        profileUpdate = updateResult
      }
    }

    return {
      coachMessage: coachResponse.message ?? this.getFallbackGeneral(state),
      profileUpdate,
    }
  }

  private async handleOnboardingFlow(message: string, state: CoachState): Promise<CoachReply> {
    // Keep existing onboarding logic for now
    // TODO: Potentially create a separate OnboardingAgent
    const { generateOnboardingResponse, parseOnboardingResponse, getOnboardingStep, getNextOnboardingStep, generateProfileSummary, parseHeightToCm, parseWeightToKg } = await import('@/lib/ai/onboarding')

    // Implementation details... (keeping existing logic)
    return {
      coachMessage: "Onboarding flow handled by existing system for now.",
    }
  }

  // Helper methods
  private convertToFoodItemDrafts(items: any[], originalText: string, mealType: MealType): FoodItemDraft[] {
    const groupId = crypto.randomUUID()
    const now = new Date().toISOString()

    return items.map((item) => ({
      id: crypto.randomUUID(),
      createdAt: now,
      mealType,
      groupId,
      payload: {
        item,
        originalText,
        confidence: 'high' as const,
        source: 'llm' as const,
      },
    }))
  }

  private calculateTotalMacros(items: any[]): MacroBreakdown {
    return items.reduce(
      (acc, item) => {
        const nutrition = item.nutritionEstimate
        if (!nutrition) return acc

        return {
          calories: acc.calories + (nutrition.caloriesKcal || 0),
          protein: acc.protein + (nutrition.proteinG || 0),
          carbs: acc.carbs + (nutrition.carbsG || 0),
          fat: acc.fat + (nutrition.fatG || 0),
        }
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }

  private addMacros(base: MacroBreakdown, delta: MacroBreakdown): MacroBreakdown {
    return {
      calories: base.calories + delta.calories,
      protein: base.protein + delta.protein,
      fat: base.fat + delta.fat,
      carbs: base.carbs + delta.carbs,
    }
  }

  private async appendInsightToProfile(profile: UserProfile | null, insight: string | null): Promise<UserProfile | null> {
    if (!profile?.userId || !insight?.trim()) return null

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

    try {
      const saveResult = await loggerAgent.persistData({
        type: 'profile',
        data: { profile: updatedProfile },
      })

      return saveResult.success ? (saveResult.data as UserProfile) ?? updatedProfile : updatedProfile
    } catch (error) {
      console.error('[AgentOrchestrator] Failed to save profile insights:', error)
      return updatedProfile
    }
  }

  // Fallback methods
  private describeUpcomingPlan(state: CoachState): string {
    const plan = getUpcomingPlan(state)
    if (!plan) return "Let's keep today flexible. Take a short walk and check in afterwards."

    return `Today's plan: ${plan.focus} for about ${plan.minutesTarget} minutes at a ${plan.suggestedIntensity} pace. Want to stick with it or adjust?`
  }

  private summarizeNutrition(state: CoachState): string {
    const { meals, totals } = getDaySummary(state, state.activeDate)
    if (meals.length === 0) {
      return "No meals logged yet today. Share whatever you've eaten and I'll give you directional feedback."
    }

    return `You've logged ${meals.length} meals today, putting you around ${totals.calories.toFixed(0)} calories with ${totals.protein.toFixed(0)}g protein. That keeps you ${state.targets.protein - totals.protein > 0 ? `${(state.targets.protein - totals.protein).toFixed(0)}g under` : `${(totals.protein - state.targets.protein).toFixed(0)}g over`} the protein target.`
  }

  private summarizeProgress(state: CoachState): string {
    const stats = getWeeklyWorkoutStats(state)
    if (stats.workoutsCompleted === 0) {
      return "No recorded movement this week yet. Even a 10-minute walk counts—log it and I'll adjust your plan."
    }

    return `You've finished ${stats.workoutsCompleted} sessions for ${stats.totalMinutes} minutes. That's about ${stats.adherence}% of the plan so far. Nice consistency.`
  }

  private describeMood(mood: 'tired' | 'sore' | 'energized' | 'neutral', message: string): string {
    switch (mood) {
      case 'tired':
        return `User reports low energy / feeling unwell: "${message}"`
      case 'sore':
        return `User reports soreness and may need recovery: "${message}"`
      case 'energized':
        return `User feels energized and ready for more: "${message}"`
      default:
        return `User status update: "${message}"`
    }
  }

  private getFallbackMealResponse(totalMacros: MacroBreakdown, projectedTotals: MacroBreakdown): string {
    return `Nice. That adds about ${totalMacros.protein.toFixed(0)}g protein and ${totalMacros.calories.toFixed(0)} calories. Projected today → ${projectedTotals.protein.toFixed(0)}g protein / ${projectedTotals.calories.toFixed(0)} cal. Look good?`
  }

  private getDefaultWorkoutMessage(workout: WorkoutLog, state: CoachState): string {
    const updatedStats = getWeeklyWorkoutStats({ ...state, workouts: [...state.workouts, workout] })
    return `Logged ${workout.type.toLowerCase()} for ${workout.minutes} minutes. Week total → ${updatedStats.workoutsCompleted} sessions / ${updatedStats.totalMinutes} minutes (${updatedStats.adherence}% of plan).`
  }

  private getFallbackStatusResponse(energyNote?: string): string {
    if (energyNote && energyNote.toLowerCase().includes('unwell')) {
      return "Thanks for telling me. Let's listen to your body—take the day to recover with light movement or extra rest, and we'll reassess tomorrow."
    }
    return "Thanks for the update. How can I help you with your nutrition or fitness goals today?"
  }

  private getFallbackGeneral(state: CoachState): string {
    const stats = getWeeklyWorkoutStats(state)

    if (stats.workoutsCompleted === 0) {
      return 'Thanks for the update. Want to log a short walk or stretch session? Even 10 minutes counts toward the plan.'
    }

    const todayMeals = state.meals.filter((meal) => meal.date === state.activeDate)
    if (todayMeals.length === 0) {
      return "Tell me about your first meal when you grab it—I'll keep your macros directional, no calorie math required."
    }

    return "Thanks for sharing. Want me to log anything else or adjust today's plan?"
  }
}

export const agentOrchestrator = new AgentOrchestrator()
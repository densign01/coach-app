import { agentOrchestrator } from '@/lib/agents/orchestrator'
import type {
  CoachState,
  MealDraft,
  FoodItemDraft,
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

export async function orchestrateCoachReply(message: string, state: CoachState): Promise<CoachReply> {
  // Delegate to the new agent orchestrator
  return await agentOrchestrator.orchestrateCoachReply(message, state)
}

// All functionality now handled by the dedicated agent orchestrator

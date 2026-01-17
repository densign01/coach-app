import type React from 'react'

export type Tab = 'home' | 'nutrition' | 'fitness'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MacroBreakdown {
  calories: number
  protein: number
  fat: number
  carbs: number
}

export type MealSource = 'api' | 'vision' | 'est' | 'manual' | 'text'

export type ParseConfidence = 'low' | 'medium' | 'high'

// Simplified nutrition expert types (GPT-inspired)
export interface SimpleFoodItem {
  name: string          // "Eggs, large"
  quantity: number      // 2
  unit?: string        // "tbsp", "slice", etc
  calories: number     // 140
  protein_g: number    // 12
  carbs_g: number      // 1
  fat_g: number        // 10
}

export interface NutritionResponse {
  items: SimpleFoodItem[]
  total: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
}

export type MealQuantityUnit =
  | 'count'
  | 'slice'
  | 'cup'
  | 'oz_fl'
  | 'oz'
  | 'g'
  | 'ml'
  | 'tbsp'
  | 'tsp'
  | 'serving'
  | 'packet'
  | 'bottle'
  | 'pint'
  | 'can'
  | 'other'

export interface MealItemQuantity {
  value: number | null
  unit: MealQuantityUnit | null
  display?: string | null
}

export interface NutritionEstimate {
  caloriesKcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG?: number | null
  source?: 'usda' | 'brand' | 'heuristic' | 'user'
  confidence?: number | null
}

export interface AlcoholInfo {
  isAlcohol: boolean
  abvPct?: number | null
  volumeMl?: number | null
}

export interface MealItemLookupCandidate {
  provider: string
  id: string
  name: string
}

export type MealItemLookupStatus = 'pending' | 'matched' | 'ambiguous'

export interface MealItemLookup {
  status: MealItemLookupStatus
  candidates: MealItemLookupCandidate[]
}

export interface MealItemFlags {
  needsLookup?: boolean
  needsPortion?: boolean
}

export type MealSizeHint = 'small' | 'medium' | 'large' | null

export interface StructuredMealItem {
  rawText: string
  name: string
  brand?: string | null
  preparation?: string[]
  quantity: MealItemQuantity
  sizeHint?: MealSizeHint
  alcohol?: AlcoholInfo | null
  nutritionEstimate?: NutritionEstimate | null
  lookup?: MealItemLookup
  flags?: MealItemFlags
  confidence?: ParseConfidence
}

export type MealParseTotals = NutritionEstimate

export interface MealParseAudit {
  messageId?: string
  inputText: string
  parsedBy?: string
  version?: string
  source?: 'llm' | 'heuristic'
}

export interface MealParseResult {
  mealType: MealType | 'drink' | 'unknown'
  contextNote?: string | null
  items: StructuredMealItem[]
  totals?: MealParseTotals | null
  confidence: ParseConfidence
  audit?: MealParseAudit
}

export interface MealLog {
  id: string
  dayId: string
  date: string
  type: MealType
  items: string[]
  macros: MacroBreakdown
  source: MealSource
  createdAt: string
}

export type WorkoutStatus = 'planned' | 'completed' | 'skipped'

export interface WorkoutLog {
  id: string
  dayId: string
  date: string
  type: string
  minutes: number
  distance?: number
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

export interface UserProfile {
  userId: string
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  heightCm?: number | null
  weightKg?: number | null
  age?: number | null
  gender?: string | null
  goals?: string | null
  profileSummary?: string | null
  insights?: string[] | null
  onboardingStep?: number | null
  onboardingData?: Record<string, unknown> | null
  onboardingCompleted?: boolean | null
  updatedAt?: string | null
}

export interface FoodItemDraft {
  id: string
  createdAt: string
  mealType: MealType
  groupId: string // Links items from same meal input
  payload: {
    item: StructuredMealItem
    originalText: string // The full original input text
    confidence: ParseConfidence
    source: 'llm' | 'heuristic'
  }
}

// Keep old interface for backward compatibility
export interface MealDraft {
  id: string
  createdAt: string
  payload: {
    type?: MealType
    items?: StructuredMealItem[]
    macros?: Partial<MacroBreakdown>
    notes?: string
    originalText: string
    confidence: ParseConfidence
    source: 'llm' | 'heuristic'
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

export interface DaySnapshot {
  dayId: string
  date: string
  meals: MealLog[]
  workouts: WorkoutLog[]
  targets?: MacroBreakdown
}

export interface CoachState {
  activeDate: string
  userId: string | null
  profile: UserProfile | null
  profileLoaded: boolean
  messages: CoachMessage[]
  mealDrafts: MealDraft[]
  foodItemDrafts: FoodItemDraft[] // New individual food item drafts
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
  | { type: 'addFoodItemDrafts'; drafts: FoodItemDraft[] } // Add multiple food items at once
  | { type: 'removeFoodItemDraft'; draftId: string }
  | { type: 'updateFoodItemDraft'; draftId: string; updates: Partial<FoodItemDraft['payload']> }
  | { type: 'confirmFoodItemDraft'; draftId: string } // Convert food item to meal log
  | { type: 'upsertMeal'; meal: MealLog }
  | { type: 'removeMeal'; mealId: string }
  | { type: 'upsertWorkout'; workout: WorkoutLog }
  | { type: 'removeWorkout'; workoutId: string }
  | { type: 'setWeeklyPlan'; plan: WeeklyPlanEntry[] }
  | { type: 'setTargets'; targets: MacroBreakdown }
  | { type: 'syncDay'; payload: DaySnapshot }
  | { type: 'setUser'; userId: string | null }
  | { type: 'setProfile'; profile: UserProfile | null }

export interface CoachContextValue {
  state: CoachState
  dispatch: React.Dispatch<CoachAction>
}

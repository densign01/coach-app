import type { CoachMessage, UserProfile } from '@/lib/types'

export interface OnboardingStep {
  id: number
  section: string
  question: string
  field?: keyof UserProfile | 'custom'
  customField?: string
  type: 'text' | 'number' | 'select' | 'multi-line'
  options?: string[]
  required?: boolean
  skipCondition?: (data: Record<string, unknown>) => boolean
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  // 1. Welcome & Context
  {
    id: 1,
    section: 'welcome',
    question: "Welcome! I'll ask a few quick questions to get to know you and tailor your plan.",
    type: 'text',
    required: false,
  },

  // 2. Basics
  {
    id: 2,
    section: 'basics',
    question: 'How old are you?',
    field: 'age',
    type: 'number',
    required: true,
  },
  {
    id: 3,
    section: 'basics',
    question: "What's your sex (male, female, other)?",
    field: 'gender',
    type: 'select',
    options: ['male', 'female', 'other'],
    required: true,
  },
  {
    id: 4,
    section: 'basics',
    question: 'How tall are you? (in cm or feet/inches)',
    field: 'heightCm',
    type: 'text',
    required: true,
  },
  {
    id: 5,
    section: 'basics',
    question: 'What do you currently weigh? (in kg or lbs)',
    field: 'weightKg',
    type: 'text',
    required: true,
  },
  {
    id: 6,
    section: 'basics',
    question: 'How many steps do you usually get on a typical workday?',
    customField: 'dailySteps',
    type: 'text',
    required: false,
  },
  {
    id: 7,
    section: 'basics',
    question: 'Do you wear a watch/track steps?',
    customField: 'tracksSteps',
    type: 'select',
    options: ['yes', 'no'],
    required: false,
  },

  // 3. Health & Constraints
  {
    id: 8,
    section: 'health',
    question: 'Do you have any injuries or conditions (e.g., back pain, GERD) I should keep in mind?',
    customField: 'healthConditions',
    type: 'multi-line',
    required: false,
  },
  {
    id: 9,
    section: 'health',
    question: 'How many hours of sleep do you typically get?',
    customField: 'sleepHours',
    type: 'number',
    required: false,
  },
  {
    id: 10,
    section: 'health',
    question: 'Do you take any medications or supplements relevant to fitness/nutrition?',
    customField: 'medications',
    type: 'multi-line',
    required: false,
  },

  // 4. Goals
  {
    id: 11,
    section: 'goals',
    question: "What's your target weight range, if you have one?",
    customField: 'targetWeight',
    type: 'text',
    required: false,
  },
  {
    id: 12,
    section: 'goals',
    question: 'How quickly do you want to get there?',
    customField: 'timeframe',
    type: 'text',
    required: false,
  },
  {
    id: 13,
    section: 'goals',
    question: 'Do you want to focus more on cardio, strength, or overall health?',
    customField: 'fitnessGoals',
    type: 'select',
    options: ['cardio', 'strength', 'overall health', 'mix of all'],
    required: false,
  },
  {
    id: 14,
    section: 'goals',
    question: 'Are there any sports/events you\'re training for?',
    customField: 'sportsEvents',
    type: 'text',
    required: false,
  },
  {
    id: 15,
    section: 'goals',
    question: 'Are you mainly interested in weight loss, muscle gain, eating healthier, or something else?',
    field: 'goals',
    type: 'select',
    options: ['weight loss', 'muscle gain', 'eating healthier', 'general health', 'athletic performance'],
    required: false,
  },

  // 5. Current Habits
  {
    id: 16,
    section: 'habits',
    question: 'Walk me through a typical day of eating (breakfast, lunch, dinner, snacks).',
    customField: 'typicalEating',
    type: 'multi-line',
    required: false,
  },
  {
    id: 17,
    section: 'habits',
    question: 'How many days a week do you currently exercise, and what type of workouts do you usually do?',
    customField: 'currentExercise',
    type: 'multi-line',
    required: false,
  },
  {
    id: 18,
    section: 'habits',
    question: 'Do you drink alcohol? If so, how often?',
    customField: 'alcoholConsumption',
    type: 'text',
    required: false,
  },
  {
    id: 19,
    section: 'habits',
    question: 'Do you usually have dessert or sweets?',
    customField: 'sweetConsumption',
    type: 'text',
    required: false,
  },

  // 6. Preferences
  {
    id: 20,
    section: 'preferences',
    question: 'Any dietary restrictions (vegetarian, kosher, allergies)?',
    customField: 'dietaryRestrictions',
    type: 'text',
    required: false,
  },
  {
    id: 21,
    section: 'preferences',
    question: 'Any foods you really dislike or don\'t want in your plan?',
    customField: 'foodDislikes',
    type: 'text',
    required: false,
  },
  {
    id: 22,
    section: 'preferences',
    question: 'Do you prefer gym workouts, home workouts, classes, outdoor activities, or a mix?',
    customField: 'workoutPreferences',
    type: 'select',
    options: ['gym workouts', 'home workouts', 'classes', 'outdoor activities', 'mix of all'],
    required: false,
  },

  // 7. Motivation & Support
  {
    id: 23,
    section: 'motivation',
    question: 'What\'s motivating you to work with me right now?',
    customField: 'motivation',
    type: 'multi-line',
    required: false,
  },
  {
    id: 24,
    section: 'motivation',
    question: 'Do you have a support system (family, friends, trainer) or should I assume it\'s just you and me?',
    customField: 'supportSystem',
    type: 'text',
    required: false,
  },

  // 8. Wrap-Up
  {
    id: 25,
    section: 'wrap-up',
    question: "Thanks! I'll use this info to set your initial nutrition targets and workout plan. You can always update me if things change.",
    type: 'text',
    required: false,
  },
]

export function getNextOnboardingStep(currentStep: number, data: Record<string, unknown> = {}): OnboardingStep | null {
  const nextStep = ONBOARDING_STEPS.find(step => step.id === currentStep + 1)

  if (!nextStep) return null

  // Check skip conditions
  if (nextStep.skipCondition && nextStep.skipCondition(data)) {
    return getNextOnboardingStep(currentStep + 1, data)
  }

  return nextStep
}

export function getOnboardingStep(stepId: number): OnboardingStep | null {
  return ONBOARDING_STEPS.find(step => step.id === stepId) ?? null
}

export function isOnboardingComplete(stepId: number): boolean {
  return stepId >= ONBOARDING_STEPS.length
}

export function parseOnboardingResponse(step: OnboardingStep, response: string, currentData: Record<string, unknown> = {}): Record<string, unknown> {
  const newData = { ...currentData }

  if (step.field && step.field !== 'custom') {
    // Handle standard profile fields
    if (step.type === 'number') {
      const num = parseNumber(response)
      if (num !== null) {
        newData[step.field] = num
      }
    } else {
      newData[step.field] = response.trim()
    }
  } else if (step.customField) {
    // Handle custom onboarding data fields
    if (step.type === 'number') {
      const num = parseNumber(response)
      if (num !== null) {
        newData[step.customField] = num
      }
    } else {
      newData[step.customField] = response.trim()
    }
  }

  return newData
}

function parseNumber(input: string): number | null {
  const num = parseFloat(input.replace(/[^\d.-]/g, ''))
  return isNaN(num) ? null : num
}

export function parseHeightToCm(input: string): number | null {
  const cleaned = input.toLowerCase().trim()

  // Already in cm
  if (cleaned.includes('cm') || /^\d+$/.test(cleaned)) {
    return parseNumber(cleaned)
  }

  // Feet and inches
  const feetInchesMatch = cleaned.match(/(\d+)['"]?\s*(\d+)['"]?/)
  if (feetInchesMatch) {
    const feet = parseInt(feetInchesMatch[1])
    const inches = parseInt(feetInchesMatch[2])
    return Math.round((feet * 12 + inches) * 2.54)
  }

  // Just feet
  const feetMatch = cleaned.match(/(\d+(?:\.\d+)?)['"]?\s*feet?/)
  if (feetMatch) {
    const feet = parseFloat(feetMatch[1])
    return Math.round(feet * 30.48)
  }

  return parseNumber(cleaned)
}

export function parseWeightToKg(input: string): number | null {
  const cleaned = input.toLowerCase().trim()

  // Already in kg
  if (cleaned.includes('kg') || (!cleaned.includes('lb') && !cleaned.includes('pound'))) {
    return parseNumber(cleaned)
  }

  // Convert from lbs
  if (cleaned.includes('lb') || cleaned.includes('pound')) {
    const lbs = parseNumber(cleaned)
    return lbs ? Math.round(lbs * 0.453592 * 10) / 10 : null
  }

  return parseNumber(cleaned)
}

export function createOnboardingMessage(step: OnboardingStep): CoachMessage {
  return {
    id: `onboarding-${step.id}`,
    role: 'coach',
    content: step.question,
    createdAt: new Date().toISOString(),
    metadata: {
      onboardingStep: step.id,
      onboardingSection: step.section,
    }
  }
}
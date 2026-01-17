export type CoachIntent =
  | { type: 'logMeal'; payload: { text: string } }
  | { type: 'logWorkout'; payload: { text: string } }
  | { type: 'statusUpdate'; payload: { mood: 'tired' | 'sore' | 'energized' | 'neutral' } }
  | { type: 'askPlan' }
  | { type: 'askNutritionSummary' }
  | { type: 'askProgress' }
  | { type: 'smallTalk' }
  | { type: 'unknown' }

const mealKeywords = [
  'ate', 'eating', 'breakfast', 'lunch', 'dinner', 'snack',
  'had', 'having', 'slice', 'pizza', 'apple', 'cheese', 'bread', 'egg', 'eggs',
  'cottage', 'muffin', 'meal', 'food', 'drink', 'coffee', 'smoothie',
  'salad', 'sandwich', 'burger', 'chicken', 'beef', 'pasta', 'rice'
]
const workoutKeywords = [
  'ran',
  'run',
  'walk',
  'walked',
  'yoga',
  'lifted',
  'workout',
  'ride',
  'cycled',
  'swam',
  'pushup',
  'push-ups',
  'pushups',
  'squat',
  'lunges',
  'mobility',
  'plank',
]
const planKeywords = ['plan', 'today', 'workout plan']
const nutritionKeywords = ['protein', 'macros', 'calories', 'nutrition', 'eat']
const progressKeywords = ['progress', 'week', 'adherence', 'how am i doing']

export function detectIntent(message: string): CoachIntent {
  const normalized = message.toLowerCase()

  // Check for requests for estimates/nutrition info (should NOT trigger meal logging)
  if (
    normalized.includes('estimate') ||
    normalized.includes('how many calories') ||
    normalized.includes('nutrition info') ||
    normalized.includes('nutritional value') ||
    (normalized.includes('what') && (normalized.includes('protein') || normalized.includes('calories')))
  ) {
    return { type: 'unknown' } // Let it fall through to general conversation
  }

  // Use word boundaries to avoid false positives like "estimate" matching "ate"
  if (mealKeywords.some((keyword) => new RegExp(`\\b${keyword}\\b`).test(normalized))) {
    return { type: 'logMeal', payload: { text: message } }
  }

  if (workoutKeywords.some((keyword) => new RegExp(`\\b${keyword}\\b`).test(normalized))) {
    return { type: 'logWorkout', payload: { text: message } }
  }

  if (normalized.includes('tired') || normalized.includes('exhausted')) {
    return { type: 'statusUpdate', payload: { mood: 'tired' } }
  }

  if (normalized.includes('sore')) {
    return { type: 'statusUpdate', payload: { mood: 'sore' } }
  }

  if (normalized.includes('energized') || normalized.includes('great')) {
    return { type: 'statusUpdate', payload: { mood: 'energized' } }
  }

  if (planKeywords.some((keyword) => normalized.includes(keyword))) {
    return { type: 'askPlan' }
  }

  if (nutritionKeywords.some((keyword) => normalized.includes(keyword)) && normalized.includes('how')) {
    return { type: 'askNutritionSummary' }
  }

  if (progressKeywords.some((keyword) => normalized.includes(keyword))) {
    return { type: 'askProgress' }
  }

  if (normalized.includes('hi') || normalized.includes('hello') || normalized.includes('thanks')) {
    return { type: 'smallTalk' }
  }

  return { type: 'unknown' }
}

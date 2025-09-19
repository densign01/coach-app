import type { WorkoutLog } from '@/lib/types'

const workoutKeywordMap: Record<string, string> = {
  run: 'Run',
  jog: 'Run',
  walk: 'Walk',
  hike: 'Hike',
  yoga: 'Yoga',
  lift: 'Strength',
  weights: 'Strength',
  strength: 'Strength',
  pushup: 'Strength',
  'push-ups': 'Strength',
  pushups: 'Strength',
  squat: 'Strength',
  squats: 'Strength',
  lunges: 'Strength',
  plank: 'Core',
  bike: 'Ride',
  ride: 'Ride',
  cycle: 'Ride',
  swim: 'Swim',
  row: 'Row',
  mobility: 'Mobility',
  pilates: 'Pilates',
  hiit: 'HIIT',
}

const intensityMap: Record<string, WorkoutLog['intensity']> = {
  easy: 'easy',
  light: 'easy',
  chill: 'easy',
  moderate: 'moderate',
  steady: 'moderate',
  normal: 'moderate',
  hard: 'hard',
  intense: 'hard',
  spicy: 'hard',
}

export interface ParsedWorkoutResult {
  type: string
  minutes: number
  intensity: WorkoutLog['intensity']
  description: string
  status: WorkoutLog['status']
  distance?: number
}

export function parseWorkoutFromText(text: string): ParsedWorkoutResult {
  const normalized = text.toLowerCase()
  const minutesMatch = normalized.match(/(\d{1,3})\s?(?:min|mins|minute|minutes)/)
  const milesMatch = normalized.match(/(\d+(?:\.\d+)?)\s?(?:mile|miles|km|kilometers)/)
  const keyword = Object.keys(workoutKeywordMap).find((key) => normalized.includes(key))
  const intensityKeyword = Object.keys(intensityMap).find((key) => normalized.includes(key))

  const baseType = keyword ? workoutKeywordMap[keyword] : 'Activity'
  const minutes = minutesMatch ? Number(minutesMatch[1]) : milesMatch ? Math.round(Number(milesMatch[1]) * 12) : 20

  const distance = milesMatch ? Number(milesMatch[1]) : undefined

  const result: ParsedWorkoutResult = {
    type: baseType,
    minutes,
    intensity: intensityKeyword ? intensityMap[intensityKeyword] : inferIntensity(baseType, minutes),
    description: text.trim(),
    status: 'completed',
    distance,
  }

  return result
}

function inferIntensity(type: string, minutes: number): WorkoutLog['intensity'] {
  if (type === 'Yoga' || type === 'Walk' || minutes <= 20) return 'easy'
  if (minutes >= 50) return 'hard'
  return 'moderate'
}

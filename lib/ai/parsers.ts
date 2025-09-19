import { z } from 'zod'

import type { MacroBreakdown, MealType } from '@/lib/types'

const responseSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  items: z.array(z.string()).min(1),
  macros: z.object({
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
  }),
})

const fallbackMacros: Record<string, MacroBreakdown> = {
  chicken: { calories: 350, protein: 35, fat: 12, carbs: 5 },
  salad: { calories: 180, protein: 5, fat: 10, carbs: 15 },
  yogurt: { calories: 150, protein: 15, fat: 4, carbs: 20 },
  smoothie: { calories: 220, protein: 12, fat: 5, carbs: 35 },
  oatmeal: { calories: 240, protein: 8, fat: 5, carbs: 42 },
  sandwich: { calories: 420, protein: 28, fat: 15, carbs: 45 },
  rice: { calories: 200, protein: 4, fat: 2, carbs: 44 },
  steak: { calories: 500, protein: 45, fat: 26, carbs: 0 },
  eggs: { calories: 210, protein: 18, fat: 14, carbs: 2 },
  pasta: { calories: 480, protein: 18, fat: 12, carbs: 70 },
}

export interface ParsedMealResult {
  mealType: MealType
  items: string[]
  macros: MacroBreakdown
  confidence: 'low' | 'medium' | 'high'
}

export async function parseMealFromText(text: string): Promise<ParsedMealResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const result = await callOpenAIParser(apiKey, text)
      return {
        mealType: (result.mealType ?? inferMealType(text)) as MealType,
        items: result.items,
        macros: result.macros,
        confidence: 'high',
      }
    } catch (error) {
      console.warn('Falling back to heuristic meal parser', error)
    }
  }

  return heuristicMealParser(text)
}

async function callOpenAIParser(apiKey: string, text: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: `Extract meal items and macro estimates from the following user text. Respond only with valid JSON matching the schema {"mealType":"breakfast|lunch|dinner|snack","items":["string"],"macros":{"calories":number,"protein":number,"fat":number,"carbs":number}}. Use realistic estimates but keep it directional.

Input: ${text}`,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI parse request failed: ${response.status}`)
  }

  const data = await response.json()
  const outputText = Array.isArray(data.output_text) ? data.output_text.join('') : data.output_text
  const parsed = typeof outputText === 'string' ? JSON.parse(outputText) : data
  return responseSchema.parse(parsed)
}

function heuristicMealParser(text: string): ParsedMealResult {
  const cleaned = text.replace(/[^a-zA-Z0-9,\s]/g, '').toLowerCase()
  const parts = cleaned.split(/(?:\band\b|,|\+)/).map((part) => part.trim()).filter(Boolean)
  const items = parts.length > 0 ? parts : ['meal']

  const macros = items.reduce<MacroBreakdown>((acc, item) => {
    const key = Object.keys(fallbackMacros).find((food) => item.includes(food))
    if (!key) {
      return {
        calories: acc.calories + 250,
        protein: acc.protein + 12,
        fat: acc.fat + 8,
        carbs: acc.carbs + 28,
      }
    }

    const estimate = fallbackMacros[key]
    return {
      calories: acc.calories + estimate.calories,
      protein: acc.protein + estimate.protein,
      fat: acc.fat + estimate.fat,
      carbs: acc.carbs + estimate.carbs,
    }
  },
  { calories: 0, protein: 0, fat: 0, carbs: 0 })

  return {
    mealType: inferMealType(text),
    items,
    macros,
    confidence: 'medium',
  }
}

function inferMealType(text: string): MealType {
  const normalized = text.toLowerCase()
  if (normalized.includes('breakfast')) return 'breakfast'
  if (normalized.includes('lunch')) return 'lunch'
  if (normalized.includes('dinner')) return 'dinner'
  if (normalized.includes('snack')) return 'snack'

  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 20) return 'dinner'
  return 'snack'
}

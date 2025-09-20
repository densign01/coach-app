import { z } from 'zod'

import type { MacroBreakdown, MealType } from '@/lib/types'

const macrosSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
})

const itemSchema = z.object({
  name: z.string().min(1),
  macros: macrosSchema,
})

const responseSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  items: z.array(z.union([itemSchema, z.string().min(1)])).min(1),
  macros: macrosSchema.optional(),
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

export interface ParsedMealItem {
  name: string
  macros: MacroBreakdown
}

export interface ParsedMealResult {
  mealType: MealType
  items: ParsedMealItem[]
  macros: MacroBreakdown
  confidence: 'low' | 'medium' | 'high'
}

export async function parseMealFromText(text: string): Promise<ParsedMealResult> {
  console.log('[MEAL_PARSER] Input text:', text)
  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      console.log('[MEAL_PARSER] Attempting OpenAI API call...')
      const result = await callOpenAIParser(apiKey, text)
      console.log('[MEAL_PARSER] OpenAI result:', result)
      return {
        mealType: (result.mealType ?? inferMealType(text)) as MealType,
        items: result.items,
        macros: result.macros,
        confidence: 'high',
      }
    } catch (error) {
      console.warn('[MEAL_PARSER] OpenAI failed, falling back to heuristic parser:', error)
    }
  } else {
    console.log('[MEAL_PARSER] No OpenAI API key, using heuristic parser')
  }

  const heuristicResult = heuristicMealParser(text)
  console.log('[MEAL_PARSER] Heuristic result:', heuristicResult)
  return heuristicResult
}

async function callOpenAIParser(apiKey: string, text: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content:
            'Extract just the food items and their macro estimates from the user text. Ignore conversational phrasing. Respond only with JSON: {"mealType":"breakfast|lunch|dinner|snack","items":[{"name":"string","macros":{"calories":number,"protein":number,"fat":number,"carbs":number}}],"macros":{"calories":number,"protein":number,"fat":number,"carbs":number}}. Ensure per-item macros are realistic and totals roughly match the sum.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI parse request failed: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No content in OpenAI response')
  }

  const parsed = responseSchema.parse(JSON.parse(content))

  const normalizedItems = parsed.items.map((entry) =>
    typeof entry === 'string'
      ? {
          name: entry.trim(),
          macros: estimateItemMacros(entry),
        }
      : {
          name: entry.name.trim(),
          macros: normalizeMacros(entry.macros),
        },
  )

  const totalMacros = parsed.macros
    ? normalizeMacros(parsed.macros)
    : normalizeMacrosFromItems(normalizedItems)

  return {
    mealType: (parsed.mealType ?? inferMealType(text)) as MealType,
    items: normalizedItems,
    macros: totalMacros,
    confidence: 'high',
  }
}

function heuristicMealParser(text: string): ParsedMealResult {
  console.log('[HEURISTIC_PARSER] Starting with text:', text)
  let workingText = text.trim()

  // Remove colon-prefixed text (like "breakfast:")
  const colonIndex = workingText.indexOf(':')
  if (colonIndex !== -1 && colonIndex < workingText.length - 1) {
    workingText = workingText.slice(colonIndex + 1)
    console.log('[HEURISTIC_PARSER] After colon removal:', workingText)
  }

  // Remove conversational prefixes
  const prefixPatterns = [
    /^\s*(?:my\s+)?(?:breakfast|lunch|dinner|snack)\s*(?:was|is|=)?\s*/i,
    /^\s*(?:i\s+(?:had|ate|was\s+eating))\s*/i,
    /^\s*for\s+(?:breakfast|lunch|dinner|snack)\s+(?:today|yesterday)?\s*,?\s*/i,
    /^\s*(?:breakfast|lunch|dinner|snack)\s*(?:today|yesterday)?\s*(?:was|is|:)?\s*/i,
  ]

  for (const pattern of prefixPatterns) {
    if (pattern.test(workingText)) {
      workingText = workingText.replace(pattern, '')
      console.log('[HEURISTIC_PARSER] After prefix removal:', workingText)
      break
    }
  }

  // Clean and split into items
  const cleaned = workingText.replace(/[^a-zA-Z0-9,./\s-]/g, '').toLowerCase()
  console.log('[HEURISTIC_PARSER] Cleaned text:', cleaned)

  // Better splitting: handle "and", commas, and other separators
  const parts = cleaned
    .split(/(?:\s+and\s+|,\s*|\+\s*|\s*&\s*)/)
    .map((part) => part.trim())
    .filter(part => part.length > 0)

  console.log('[HEURISTIC_PARSER] Split parts:', parts)
  const items = (parts.length > 0 ? parts : ['meal']).map((item) => ({
    name: item,
    macros: estimateItemMacros(item),
  }))

  const macros = normalizeMacrosFromItems(items)

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

function estimateItemMacros(item: string): MacroBreakdown {
  const key = Object.keys(fallbackMacros).find((food) => item.includes(food))
  if (!key) {
    return {
      calories: 250,
      protein: 12,
      fat: 8,
      carbs: 28,
    }
  }

  return fallbackMacros[key]
}

function normalizeMacros(value: MacroBreakdown | undefined): MacroBreakdown {
  return {
    calories: Number(value?.calories ?? 0),
    protein: Number(value?.protein ?? 0),
    fat: Number(value?.fat ?? 0),
    carbs: Number(value?.carbs ?? 0),
  }
}

function normalizeMacrosFromItems(items: ParsedMealItem[]): MacroBreakdown {
  return items.reduce<MacroBreakdown>(
    (acc, item) => ({
      calories: acc.calories + item.macros.calories,
      protein: acc.protein + item.macros.protein,
      fat: acc.fat + item.macros.fat,
      carbs: acc.carbs + item.macros.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  )
}

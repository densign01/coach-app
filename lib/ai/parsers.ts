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

type FoodUnit = 'serving' | 'cup' | 'tbsp' | 'tsp' | 'oz' | 'gram' | 'piece' | 'slice'

interface FoodMacroEstimate {
  keywords: string[]
  unit: FoodUnit
  amount: number
  macros: MacroBreakdown
}

const DEFAULT_UNKNOWN_MACROS: MacroBreakdown = { calories: 200, protein: 7, fat: 8, carbs: 26 }

const FOOD_MACRO_DATABASE: FoodMacroEstimate[] = [
  {
    keywords: ['blueberries', 'blueberry'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 85, protein: 1, fat: 0.5, carbs: 21 },
  },
  {
    keywords: ['strawberries', 'strawberry'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 50, protein: 1, fat: 0.5, carbs: 12 },
  },
  {
    keywords: ['banana'],
    unit: 'piece',
    amount: 1,
    macros: { calories: 105, protein: 1.3, fat: 0.4, carbs: 27 },
  },
  {
    keywords: ['apple'],
    unit: 'piece',
    amount: 1,
    macros: { calories: 95, protein: 0.5, fat: 0.3, carbs: 25 },
  },
  {
    keywords: ['greek yogurt', 'yogurt'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 120, protein: 20, fat: 0, carbs: 9 },
  },
  {
    keywords: ['oatmeal', 'oats'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 150, protein: 5, fat: 3, carbs: 27 },
  },
  {
    keywords: ['chicken breast', 'chicken'],
    unit: 'oz',
    amount: 4,
    macros: { calories: 187, protein: 35, fat: 4, carbs: 0 },
  },
  {
    keywords: ['salad'],
    unit: 'serving',
    amount: 1,
    macros: { calories: 180, protein: 5, fat: 10, carbs: 15 },
  },
  {
    keywords: ['smoothie'],
    unit: 'serving',
    amount: 1,
    macros: { calories: 230, protein: 12, fat: 4, carbs: 38 },
  },
  {
    keywords: ['sandwich'],
    unit: 'serving',
    amount: 1,
    macros: { calories: 420, protein: 25, fat: 15, carbs: 45 },
  },
  {
    keywords: ['rice'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 205, protein: 4, fat: 0.5, carbs: 45 },
  },
  {
    keywords: ['steak'],
    unit: 'oz',
    amount: 4,
    macros: { calories: 310, protein: 30, fat: 20, carbs: 0 },
  },
  {
    keywords: ['egg', 'eggs'],
    unit: 'piece',
    amount: 1,
    macros: { calories: 78, protein: 6, fat: 5, carbs: 1 },
  },
  {
    keywords: ['pasta'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 220, protein: 8, fat: 1, carbs: 43 },
  },
  {
    keywords: ['english muffin'],
    unit: 'piece',
    amount: 1,
    macros: { calories: 120, protein: 5, fat: 1, carbs: 23 },
  },
  {
    keywords: ['cream cheese'],
    unit: 'tbsp',
    amount: 1,
    macros: { calories: 50, protein: 1, fat: 5, carbs: 1 },
  },
  {
    keywords: ['almond butter', 'peanut butter', 'nut butter'],
    unit: 'tbsp',
    amount: 1,
    macros: { calories: 95, protein: 3.5, fat: 8, carbs: 3.5 },
  },
  {
    keywords: ['spinach'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 7, protein: 1, fat: 0, carbs: 1 },
  },
  {
    keywords: ['avocado'],
    unit: 'piece',
    amount: 1,
    macros: { calories: 240, protein: 3, fat: 22, carbs: 12 },
  },
  {
    keywords: ['broccoli'],
    unit: 'cup',
    amount: 1,
    macros: { calories: 55, protein: 4, fat: 0.5, carbs: 11 },
  },
]

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
  const normalized = item.toLowerCase()
  const quantityInfo = extractQuantityInfo(normalized)
  const estimate = FOOD_MACRO_DATABASE.find((entry) =>
    entry.keywords.some((keyword) => normalized.includes(keyword)),
  )

  if (!estimate) {
    const multiplier = Math.max(quantityInfo?.value ?? 1, 1)
    return multiplyMacros(DEFAULT_UNKNOWN_MACROS, multiplier)
  }

  const multiplier = computeMultiplier(quantityInfo, estimate)
  return multiplyMacros(estimate.macros, multiplier)
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

function computeMultiplier(
  quantityInfo: QuantityInfo | null,
  estimate: FoodMacroEstimate,
): number {
  if (!quantityInfo) {
    return 1
  }

  const baseAmount = estimate.amount === 0 ? 1 : estimate.amount

  if (estimate.unit === 'serving') {
    return (quantityInfo.value ?? 1) / baseAmount
  }

  if (!quantityInfo.unit) {
    // No explicit unit, treat numeric prefix as count for piece-based foods
    if (estimate.unit === 'piece' || estimate.unit === 'slice') {
      return (quantityInfo.value ?? 1) / baseAmount
    }
    return quantityInfo.value ?? 1
  }

  if (unitsMatch(quantityInfo.unit, estimate.unit)) {
    return (quantityInfo.value ?? 1) / baseAmount
  }

  // Unit mismatch — fall back to the numeric quantity
  return quantityInfo.value ?? 1
}

interface QuantityInfo {
  value: number
  unit?: FoodUnit | null
}

function extractQuantityInfo(text: string): QuantityInfo | null {
  const quantityRegex = /(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)(?:\s*)(cups?|cup|c|tablespoons?|tbsp|tbsps?|teaspoons?|tsp|tsps?|ounces?|oz|grams?|g|servings?|serving|pieces?|piece|slices?|slice)\b/i

  const match = quantityRegex.exec(text)
  if (match) {
    const value = parseQuantityValue(match[1])
    const unit = normalizeUnit(match[2])
    return { value, unit }
  }

  const leadingMatch = text.match(/^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/)
  if (leadingMatch) {
    return { value: parseQuantityValue(leadingMatch[1]), unit: null }
  }

  return null
}

function parseQuantityValue(raw: string): number {
  const cleaned = raw.replace(/\s+/g, '')
  if (cleaned.includes('/')) {
    const [numerator, denominator] = cleaned.split('/')
    const num = Number(numerator)
    const den = Number(denominator)
    if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
      return num / den
    }
  }

  const value = Number(cleaned)
  return Number.isNaN(value) ? 1 : value
}

function normalizeUnit(raw: string | undefined): FoodUnit | null {
  if (!raw) return null
  const unit = raw.toLowerCase().replace(/\./g, '')
  switch (unit) {
    case 'cup':
    case 'cups':
    case 'c':
      return 'cup'
    case 'tablespoon':
    case 'tablespoons':
    case 'tbsp':
    case 'tbsps':
      return 'tbsp'
    case 'teaspoon':
    case 'teaspoons':
    case 'tsp':
    case 'tsps':
      return 'tsp'
    case 'ounce':
    case 'ounces':
    case 'oz':
      return 'oz'
    case 'gram':
    case 'grams':
    case 'g':
      return 'gram'
    case 'serving':
    case 'servings':
      return 'serving'
    case 'piece':
    case 'pieces':
      return 'piece'
    case 'slice':
    case 'slices':
      return 'slice'
    default:
      return null
  }
}

function unitsMatch(first: FoodUnit | null | undefined, second: FoodUnit | null | undefined): boolean {
  if (!first || !second) return false
  if (first === second) return true
  const equivalent: Record<FoodUnit, FoodUnit[]> = {
    serving: ['serving'],
    cup: ['cup'],
    tbsp: ['tbsp'],
    tsp: ['tsp'],
    oz: ['oz'],
    gram: ['gram'],
    piece: ['piece'],
    slice: ['slice'],
  }
  return equivalent[first]?.includes(second) ?? false
}

function multiplyMacros(macros: MacroBreakdown, multiplier: number): MacroBreakdown {
  return {
    calories: Number((macros.calories * multiplier).toFixed(2)),
    protein: Number((macros.protein * multiplier).toFixed(2)),
    fat: Number((macros.fat * multiplier).toFixed(2)),
    carbs: Number((macros.carbs * multiplier).toFixed(2)),
  }
}

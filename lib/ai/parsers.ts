import { z } from 'zod'

import type {
  MealParseResult,
  MealParseTotals,
  MealType,
  StructuredMealItem,
  MealItemQuantity,
  MealItemLookup,
  MealItemFlags,
  NutritionEstimate,
  ParseConfidence,
  MealSizeHint,
} from '@/lib/types'

const quantitySchema = z.object({
  value: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  display: z.string().nullable().optional(),
})

const nutritionSchema = z.object({
  calories_kcal: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  fiber_g: z.number().nullable().optional(),
  source: z.string().optional(),
  confidence: z.number().nullable().optional(),
})

const lookupCandidateSchema = z.object({
  provider: z.string(),
  id: z.string(),
  name: z.string(),
})

const lookupSchema = z.object({
  status: z.enum(['pending', 'matched', 'ambiguous']).default('pending'),
  candidates: z.array(lookupCandidateSchema).default([]),
})

const flagsSchema = z.object({
  needs_lookup: z.boolean().optional(),
  needs_portion: z.boolean().optional(),
})

const itemSchema = z.object({
  raw_text: z.string(),
  name: z.string(),
  brand: z.string().nullable().optional(),
  preparation: z.array(z.string()).optional(),
  quantity: quantitySchema.default({ value: null, unit: null, display: null }),
  size_hint: z.enum(['small', 'medium', 'large']).nullable().optional(),
  alcohol: z
    .object({
      is_alcohol: z.boolean(),
      abv_pct: z.number().nullable().optional(),
      volume_ml: z.number().nullable().optional(),
    })
    .optional()
    .nullable(),
  nutrition_estimate: nutritionSchema.nullable().optional(),
  lookup: lookupSchema.optional(),
  flags: flagsSchema.optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
})

const responseSchema = z.object({
  meal_type: z.string().optional(),
  mealType: z.string().optional(),
  context_note: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1),
  totals: nutritionSchema.nullable().optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  audit: z
    .object({
      message_id: z.string().optional(),
      parsed_by: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
})

const FALLBACK_CONFIDENCE: ParseConfidence = 'medium'

export async function parseMealFromText(text: string): Promise<MealParseResult> {
  console.log('[MEAL_PARSER] Input text:', text)
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey) {
    try {
      const parsed = await callOpenAIParser(apiKey, text)
      return {
        ...parsed,
        audit: {
          ...(parsed.audit ?? {}),
          inputText: text,
          source: 'llm',
        },
      }
    } catch (error) {
      console.warn('[MEAL_PARSER] OpenAI parsing failed, falling back to heuristic:', error)
    }
  }

  return heuristicMealParser(text)
}

async function callOpenAIParser(apiKey: string, text: string): Promise<MealParseResult> {
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
            'Extract meal items from the user text and respond with JSON only. Use keys: meal_type, context_note, confidence, items[]. Each item must include raw_text, name, quantity {value,unit,display}, size_hint, nutrition_estimate, lookup, flags. Leave nutrition_estimate fields null if unknown. Do not add commentary.',
        },
        {
          role: 'user',
          content: text,
        },
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

  const mealType = (parsed.meal_type ?? parsed.mealType ?? 'unknown').toLowerCase()
  const items = parsed.items.map(normalizeLLMItem)
  const totals = normalizeNutrition(parsed.totals)
  const confidence = parsed.confidence ?? inferConfidenceFromItems(items)

  return {
    mealType: normalizeMealType(mealType),
    contextNote: parsed.context_note ?? null,
    items,
    totals: totals ?? computeTotals(items),
    confidence,
    audit: {
      messageId: parsed.audit?.message_id,
      parsedBy: parsed.audit?.parsed_by,
      version: parsed.audit?.version,
      inputText: text,
    },
  }
}

function normalizeLLMItem(item: z.infer<typeof itemSchema>): StructuredMealItem {
  const quantity = normalizeQuantity(item.quantity)
  const flags = normalizeFlags(item.flags)
  const lookup = normalizeLookup(item.lookup)
  const nutrition = normalizeNutrition(item.nutrition_estimate)

  return {
    rawText: item.raw_text,
    name: item.name,
    brand: item.brand ?? null,
    preparation: item.preparation ?? [],
    quantity,
    sizeHint: normalizeSizeHint(item.size_hint),
    alcohol: item.alcohol
      ? {
          isAlcohol: item.alcohol.is_alcohol,
          abvPct: item.alcohol.abv_pct ?? null,
          volumeMl: item.alcohol.volume_ml ?? null,
        }
      : null,
    nutritionEstimate: nutrition,
    lookup,
    flags,
    confidence: item.confidence ?? FALLBACK_CONFIDENCE,
  }
}

function heuristicMealParser(text: string): MealParseResult {
  const cleanedInput = text.trim()
  const parts = segmentMealText(cleanedInput)
  const inferredType = normalizeMealType(inferMealType(cleanedInput))

  const items: StructuredMealItem[] = parts.map((part) => {
    const quantityInfo = extractQuantityInfo(part)
    const quantity = quantityInfo ?? { value: null, unit: null, display: null }
    const nutrition = estimateNutritionFromHeuristics(part, quantity)

    return {
      rawText: part,
      name: deriveItemName(part),
      brand: null,
      preparation: [],
      quantity,
      sizeHint: null,
      alcohol: detectAlcohol(part, quantity),
      nutritionEstimate: nutrition,
      lookup: defaultLookup(),
      flags: deriveFlags(quantity, nutrition),
      confidence: FALLBACK_CONFIDENCE,
    }
  })

  return {
    mealType: inferredType,
    contextNote: null,
    items,
    totals: computeTotals(items),
    confidence: FALLBACK_CONFIDENCE,
    audit: {
      inputText: text,
      source: 'heuristic',
    },
  }
}

function segmentMealText(text: string): string[] {
  console.log('[MEAL_PARSER] segmentMealText input:', text)

  let withoutPrefixes = text

  // Remove colon-separated prefixes (e.g., "Meal: ...")
  const step1 = withoutPrefixes.replace(/^[^:]+:\s*/, '')
  if (step1 !== withoutPrefixes) {
    console.log('[MEAL_PARSER] After colon removal:', step1)
    withoutPrefixes = step1
  }

  // Remove conversational meal type prefixes (e.g., "For lunch", "At breakfast", "During dinner")
  const step2 = withoutPrefixes.replace(/^(?:for\s+|at\s+|during\s+|my\s+)?(?:breakfast|lunch|dinner|snack)\s*(?:was|is|=|,)?\s*/i, '')
  if (step2 !== withoutPrefixes) {
    console.log('[MEAL_PARSER] After meal type removal:', step2)
    withoutPrefixes = step2
  }

  // Remove "I had/ate/was eating" constructions
  const step3 = withoutPrefixes.replace(/^(?:i\s+(?:had|ate|was\s+eating|just\s+had))\s*/i, '')
  if (step3 !== withoutPrefixes) {
    console.log('[MEAL_PARSER] After "I had" removal:', step3)
    withoutPrefixes = step3
  }

  // Remove additional conversational starters
  const step4 = withoutPrefixes.replace(/^(?:today\s+)?(?:i\s+)?(?:just\s+|also\s+)?(?:consumed|enjoyed|grabbed)\s*/i, '')
  if (step4 !== withoutPrefixes) {
    console.log('[MEAL_PARSER] After conversational starters removal:', step4)
    withoutPrefixes = step4
  }

  withoutPrefixes = withoutPrefixes.trim()
  console.log('[MEAL_PARSER] Final cleaned text:', withoutPrefixes)

  const parts = withoutPrefixes
    .split(/(?:\s+and\s+|,\s*|\+\s*|\s*&\s*)/)
    .map((part) => part.trim())
    .filter(Boolean)

  console.log('[MEAL_PARSER] Final segmented parts:', parts)
  return parts
}

function normalizeQuantity(quantity?: z.infer<typeof quantitySchema>): MealItemQuantity {
  if (!quantity) {
    return { value: null, unit: null, display: null }
  }

  return {
    value: quantity.value ?? null,
    unit: normalizeUnit(quantity.unit ?? undefined),
    display: quantity.display ?? null,
  }
}

function normalizeNutrition(input?: z.infer<typeof nutritionSchema> | null): NutritionEstimate | null {
  if (!input) return null
  return {
    caloriesKcal: coerceNullableNumber(input.calories_kcal),
    proteinG: coerceNullableNumber(input.protein_g),
    carbsG: coerceNullableNumber(input.carbs_g),
    fatG: coerceNullableNumber(input.fat_g),
    fiberG: coerceNullableNumber(input.fiber_g),
    source: input.source as NutritionEstimate['source'],
    confidence: coerceNullableNumber(input.confidence),
  }
}

function normalizeLookup(input?: z.infer<typeof lookupSchema>): MealItemLookup {
  if (!input) {
    return defaultLookup()
  }

  return {
    status: input.status,
    candidates: input.candidates.map((candidate) => ({
      provider: candidate.provider,
      id: candidate.id,
      name: candidate.name,
    })),
  }
}

function normalizeFlags(input?: z.infer<typeof flagsSchema>): MealItemFlags {
  return {
    needsLookup: input?.needs_lookup ?? false,
    needsPortion: input?.needs_portion ?? false,
  }
}

function normalizeSizeHint(value?: string | null): MealSizeHint {
  if (!value) return null
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value
  }
  return null
}

function inferConfidenceFromItems(items: StructuredMealItem[]): ParseConfidence {
  if (items.some((item) => item.flags?.needsLookup)) {
    return 'medium'
  }
  return 'high'
}

function normalizeMealType(value: string): MealParseResult['mealType'] {
  const lowered = value.toLowerCase()
  if (lowered === 'breakfast' || lowered === 'lunch' || lowered === 'dinner' || lowered === 'snack') {
    return lowered
  }
  if (lowered === 'drink' || lowered === 'unknown') {
    return lowered
  }
  return inferMealType(value)
}

function computeTotals(items: StructuredMealItem[]): MealParseTotals | null {
  const totals = items.reduce<NutritionEstimate>(
    (acc, item) => {
      const nutrition = item.nutritionEstimate
      if (!nutrition) {
        return acc
      }
      return {
        caloriesKcal: addNullableNumbers(acc.caloriesKcal, nutrition.caloriesKcal),
        proteinG: addNullableNumbers(acc.proteinG, nutrition.proteinG),
        carbsG: addNullableNumbers(acc.carbsG, nutrition.carbsG),
        fatG: addNullableNumbers(acc.fatG, nutrition.fatG),
        fiberG: addNullableNumbers(acc.fiberG ?? null, nutrition.fiberG ?? null),
        source: acc.source ?? nutrition.source ?? 'heuristic',
        confidence: averageConfidence(acc.confidence, nutrition.confidence),
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

  if (
    totals.caloriesKcal === 0 &&
    totals.proteinG === 0 &&
    totals.carbsG === 0 &&
    totals.fatG === 0
  ) {
    return null
  }

  return totals
}

function coerceNullableNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const coerced = Number(value)
  return Number.isNaN(coerced) ? null : coerced
}

function addNullableNumbers(a: number | null | undefined, b: number | null | undefined): number | null {
  const first = a ?? 0
  const second = b ?? 0
  const total = first + second
  return total === 0 ? null : Number(total.toFixed(2))
}

function averageConfidence(a: number | null | undefined, b: number | null | undefined): number | null {
  const values = [a, b].filter((value): value is number => value !== null && value !== undefined)
  if (values.length === 0) return null
  const sum = values.reduce((acc, value) => acc + value, 0)
  return Number((sum / values.length).toFixed(2))
}

// -------- Heuristic helpers --------

function deriveItemName(part: string): string {
  return part.trim().replace(/^[0-9./\s]+/, '')
}

function estimateNutritionFromHeuristics(part: string, quantity: MealItemQuantity): NutritionEstimate {
  const macros = estimateItemMacros(part, quantity)
  return {
    caloriesKcal: macros.calories,
    proteinG: macros.protein,
    carbsG: macros.carbs,
    fatG: macros.fat,
    fiberG: null,
    source: 'heuristic',
    confidence: 0.4,
  }
}

function detectAlcohol(part: string, quantity: MealItemQuantity) {
  const lower = part.toLowerCase()
  if (!lower.includes('beer') && !lower.includes('lager') && !lower.includes('wine') && !lower.includes('ale')) {
    return null
  }

  const volumeMl = convertToMl(quantity)
  return {
    isAlcohol: true,
    abvPct: null,
    volumeMl,
  }
}

function defaultLookup(): MealItemLookup {
  return { status: 'pending', candidates: [] }
}

function deriveFlags(quantity: MealItemQuantity, nutrition: NutritionEstimate | null): MealItemFlags {
  return {
    needsLookup: !nutrition,
    needsPortion: quantity.value === null,
  }
}

function convertToMl(quantity: MealItemQuantity): number | null {
  if (!quantity.unit || quantity.value == null) return null
  const value = quantity.value
  switch (quantity.unit) {
    case 'cup':
      return Number((value * 240).toFixed(2))
    case 'oz_fl':
      return Number((value * 29.5735).toFixed(2))
    case 'ml':
      return Number(value.toFixed(2))
    default:
      return null
  }
}

// -------- Quantity + macros estimation --------

type FoodUnit = 'serving' | 'cup' | 'tbsp' | 'tsp' | 'oz' | 'oz_fl' | 'gram' | 'piece' | 'slice'

interface FoodMacroEstimate {
  keywords: string[]
  unit: FoodUnit
  amount: number
  macros: { calories: number; protein: number; carbs: number; fat: number }
}

const DEFAULT_UNKNOWN_MACROS: FoodMacroEstimate['macros'] = {
  calories: 200,
  protein: 7,
  carbs: 26,
  fat: 8,
}

const FOOD_MACRO_DATABASE: FoodMacroEstimate[] = [
  { keywords: ['blueberries', 'blueberry'], unit: 'cup', amount: 1, macros: { calories: 85, protein: 1, carbs: 21, fat: 0.5 } },
  { keywords: ['strawberries', 'strawberry'], unit: 'cup', amount: 1, macros: { calories: 50, protein: 1, carbs: 12, fat: 0.5 } },
  { keywords: ['banana'], unit: 'piece', amount: 1, macros: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 } },
  { keywords: ['apple'], unit: 'piece', amount: 1, macros: { calories: 95, protein: 0.5, carbs: 25, fat: 0.3 } },
  { keywords: ['pretzel'], unit: 'serving', amount: 1, macros: { calories: 300, protein: 7, carbs: 60, fat: 3 } },
  { keywords: ['lager', 'beer'], unit: 'oz_fl', amount: 12, macros: { calories: 150, protein: 2, carbs: 13, fat: 0 } },
]

function estimateItemMacros(part: string, quantity: MealItemQuantity) {
  const normalized = part.toLowerCase()
  const estimate = FOOD_MACRO_DATABASE.find((entry) =>
    entry.keywords.some((keyword) => normalized.includes(keyword)),
  )

  const baseMacros = estimate?.macros ?? DEFAULT_UNKNOWN_MACROS
  const multiplier = computeMultiplier(quantity, estimate)

  return {
    calories: Number((baseMacros.calories * multiplier).toFixed(2)),
    protein: Number((baseMacros.protein * multiplier).toFixed(2)),
    carbs: Number((baseMacros.carbs * multiplier).toFixed(2)),
    fat: Number((baseMacros.fat * multiplier).toFixed(2)),
  }
}

function computeMultiplier(quantity: MealItemQuantity, estimate?: FoodMacroEstimate) {
  const baseAmount = estimate?.amount ?? 1
  if (!quantity.value) return 1
  if (!estimate) return quantity.value
  if (!quantity.unit) {
    return quantity.value / baseAmount
  }
  if (estimate.unit === 'serving') {
    return quantity.value / baseAmount
  }
  if (unitsMatch(quantity.unit, estimate.unit)) {
    return quantity.value / baseAmount
  }
  return quantity.value
}

function extractQuantityInfo(text: string): MealItemQuantity | null {
  const quantityRegex = /(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)(?:\s*)(cups?|cup|c|tablespoons?|tbsp|tbsps?|teaspoons?|tsp|tsps?|ounces?|oz|oz_fl|grams?|g|servings?|serving|pieces?|piece|slices?|slice)\b/i
  const match = quantityRegex.exec(text)

  if (match) {
    return {
      value: parseQuantityValue(match[1]),
      unit: normalizeUnit(match[2]),
      display: match[0],
    }
  }

  const leadingMatch = text.match(/^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/)
  if (leadingMatch) {
    return {
      value: parseQuantityValue(leadingMatch[1]),
      unit: null,
      display: leadingMatch[0],
    }
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

function normalizeUnit(raw: string | undefined): MealItemQuantity['unit'] {
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
    case 'oz_fl':
      return 'oz_fl'
    case 'gram':
    case 'grams':
    case 'g':
      return 'g'
    case 'serving':
    case 'servings':
      return 'serving'
    case 'packet':
    case 'packets':
      return 'packet'
    case 'piece':
    case 'pieces':
      return 'count'
    case 'slice':
    case 'slices':
      return 'slice'
    default:
      return 'other'
  }
}

function unitsMatch(first: MealItemQuantity['unit'], second: FoodUnit): boolean {
  if (!first) return false
  if (first === 'count' && second === 'piece') return true
  if (first === 'packet' && second === 'serving') return true
  if (first === 'oz' && (second === 'oz' || second === 'oz_fl')) return true
  if (first === 'oz_fl' && second === 'oz_fl') return true
  return first === second
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

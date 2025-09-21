import { z } from 'zod'

import type { MealParseResult, NutritionEstimate, StructuredMealItem } from '@/lib/types'

const responseSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      nutrition_estimate: z.object({
        calories_kcal: z.number().nullable().optional(),
        protein_g: z.number().nullable().optional(),
        carbs_g: z.number().nullable().optional(),
        fat_g: z.number().nullable().optional(),
        fiber_g: z.number().nullable().optional(),
        confidence: z.number().nullable().optional(),
        source: z.enum(['usda', 'brand', 'heuristic', 'user', 'llm']).optional(),
      }),
    }),
  ),
})

interface EnrichmentContext {
  mealType: MealParseResult['mealType']
  inputText: string
}

export async function enrichNutritionEstimates(
  items: StructuredMealItem[],
  context: EnrichmentContext,
): Promise<StructuredMealItem[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return items
  }

  const needsEnrichment = items.some((item) => !item.nutritionEstimate)
  if (!needsEnrichment) {
    return items
  }

  try {
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
              'You estimate nutrition for meals. Given structured items with name, raw_text, and quantity, return JSON with nutrition_estimate for each item. Use keys calories_kcal, protein_g, carbs_g, fat_g, fiber_g, confidence (0-1), and set source to "llm". Only respond with JSON.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              mealType: context.mealType,
              inputText: context.inputText,
              items: items.map((item, index) => ({
                index,
                raw_text: item.rawText,
                name: item.name,
                quantity: item.quantity,
              })),
            }),
          },
        ],
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      throw new Error(`Macro enrichment failed with status ${response.status}`)
    }

    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('Macro enrichment response missing content')
    }

    const parsed = responseSchema.parse(JSON.parse(content))
    const enriched = [...items]

    for (const item of parsed.items) {
      const target = enriched[item.index]
      if (!target) continue
      target.nutritionEstimate = mergeNutritionEstimates(target.nutritionEstimate, {
        caloriesKcal: coerce(item.nutrition_estimate.calories_kcal),
        proteinG: coerce(item.nutrition_estimate.protein_g),
        carbsG: coerce(item.nutrition_estimate.carbs_g),
        fatG: coerce(item.nutrition_estimate.fat_g),
        fiberG: coerce(item.nutrition_estimate.fiber_g),
        source: item.nutrition_estimate.source ?? 'llm',
        confidence: coerce(item.nutrition_estimate.confidence),
      })
    }

    return enriched
  } catch (error) {
    console.warn('[MACRO_ENRICHMENT] Failed to enrich macros, falling back to heuristics', error)
    return items
  }
}

function mergeNutritionEstimates(existing: NutritionEstimate | null | undefined, incoming: NutritionEstimate): NutritionEstimate {
  if (!existing) {
    return incoming
  }

  return {
    caloriesKcal: incoming.caloriesKcal ?? existing.caloriesKcal,
    proteinG: incoming.proteinG ?? existing.proteinG,
    carbsG: incoming.carbsG ?? existing.carbsG,
    fatG: incoming.fatG ?? existing.fatG,
    fiberG: incoming.fiberG ?? existing.fiberG ?? null,
    source: incoming.source ?? existing.source,
    confidence: incoming.confidence ?? existing.confidence ?? null,
  }
}

function coerce(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isNaN(n) ? null : Number(n.toFixed(2))
}

import { z } from 'zod'
import type { StructuredMealItem, NutritionEstimate } from '@/lib/types'

export interface CalorieLookupAgentInput {
  items: StructuredMealItem[]
  context?: {
    mealType?: string
    inputText?: string
  }
}

export interface CalorieLookupAgentOutput {
  enrichedItems: StructuredMealItem[]
  confidence: 'low' | 'medium' | 'high'
  source: 'usda' | 'llm' | 'heuristic'
}

export interface NutritionResponse {
  items: Array<{
    name: string
    quantity: number
    unit?: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }>
  total: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
}

/**
 * Calorie Lookup Agent - Expert nutrition database specialist
 *
 * Role: Enriches food items with accurate nutritional data
 * Responsibilities:
 * - Look up nutritional information using USDA database knowledge
 * - Handle portion size calculations and scaling
 * - Provide confidence scores for nutritional estimates
 * - Fall back to heuristic estimates when needed
 */
export class CalorieLookupAgent {
  private readonly systemPrompt = `You are an expert nutrition database specialist with comprehensive knowledge of the USDA nutrition database and food composition data. Your role is to provide accurate nutritional information for food items, including calories, macronutrients (protein, carbohydrates, fats), and micronutrients when available. You understand portion size conversions, cooking effects on nutrition, and food preparation variations. Use your internal USDA database knowledge to provide precise nutritional breakdowns. When exact matches aren't available, use comparable foods and clearly indicate confidence levels. Always round calories to nearest 5 and macros to nearest 1g for practical use.`

  private readonly nutritionResponseSchema = z.object({
    items: z.array(z.object({
      name: z.string(),
      quantity: z.number(),
      unit: z.string().optional(),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    })),
    total: z.object({
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  })

  private readonly enrichmentResponseSchema = z.object({
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

  async enrichNutrition(input: CalorieLookupAgentInput): Promise<CalorieLookupAgentOutput> {
    console.log('[CalorieLookupAgent] Enriching nutrition for', input.items.length, 'items')

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn('[CalorieLookupAgent] No API key, using heuristic estimates')
      return {
        enrichedItems: input.items.map(this.addHeuristicNutrition),
        confidence: 'low',
        source: 'heuristic'
      }
    }

    // Check if items need enrichment
    const needsEnrichment = input.items.some((item) => !item.nutritionEstimate)
    if (!needsEnrichment) {
      console.log('[CalorieLookupAgent] All items already have nutrition data')
      return {
        enrichedItems: input.items,
        confidence: 'high',
        source: 'usda'
      }
    }

    try {
      const enrichedItems = await this.callNutritionAPI(apiKey, input.items, input.context)
      return {
        enrichedItems,
        confidence: 'high',
        source: 'usda'
      }
    } catch (error) {
      console.warn('[CalorieLookupAgent] API enrichment failed, falling back to heuristics:', error)
      return {
        enrichedItems: input.items.map(this.addHeuristicNutrition),
        confidence: 'low',
        source: 'heuristic'
      }
    }
  }

  async lookupNutrition(text: string): Promise<NutritionResponse | null> {
    console.log('[CalorieLookupAgent] Looking up nutrition for:', text)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn('[CalorieLookupAgent] No API key available')
      return null
    }

    try {
      const { generateObject } = await import('ai')
      const { openai } = await import('@ai-sdk/openai')

      const { object } = await generateObject({
        model: openai('gpt-5'),
        schema: this.nutritionResponseSchema,
        prompt: `${this.systemPrompt}

When given food descriptions:
1. Parse into distinct items with quantities
2. Use your internal USDA nutrition database (no internet access)
3. Return JSON with itemized breakdown + totals
4. Round calories to nearest 5, macros to nearest 1g
5. Use standardized USDA food names

Food description: "${text}"

Provide the nutrition breakdown for each item and calculate totals.`,
        providerOptions: {
          openai: {
            textVerbosity: 'low',
          },
        },
      })

      console.log('[CalorieLookupAgent] Successfully retrieved nutrition data')
      return object
    } catch (error) {
      console.error('[CalorieLookupAgent] Failed to lookup nutrition:', error)
      return null
    }
  }

  private async callNutritionAPI(
    apiKey: string,
    items: StructuredMealItem[],
    context?: { mealType?: string; inputText?: string }
  ): Promise<StructuredMealItem[]> {
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
            content: `${this.systemPrompt} Given structured items with name, raw_text, and quantity, return JSON with nutrition_estimate for each item. Use keys calories_kcal, protein_g, carbs_g, fat_g, fiber_g, confidence (0-1), and set source to "llm". Only respond with JSON.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              mealType: context?.mealType || 'unknown',
              inputText: context?.inputText || '',
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
      throw new Error(`Nutrition enrichment failed with status ${response.status}`)
    }

    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('Nutrition enrichment response missing content')
    }

    const parsed = this.enrichmentResponseSchema.parse(JSON.parse(content))
    const enriched = [...items]

    for (const item of parsed.items) {
      const target = enriched[item.index]
      if (!target) continue

      target.nutritionEstimate = this.mergeNutritionEstimates(target.nutritionEstimate, {
        caloriesKcal: this.coerce(item.nutrition_estimate.calories_kcal),
        proteinG: this.coerce(item.nutrition_estimate.protein_g),
        carbsG: this.coerce(item.nutrition_estimate.carbs_g),
        fatG: this.coerce(item.nutrition_estimate.fat_g),
        fiberG: this.coerce(item.nutrition_estimate.fiber_g),
        source: item.nutrition_estimate.source ?? 'llm',
        confidence: this.coerce(item.nutrition_estimate.confidence),
      })
    }

    return enriched
  }

  private addHeuristicNutrition(item: StructuredMealItem): StructuredMealItem {
    if (item.nutritionEstimate) {
      return item
    }

    // Simple heuristic estimates based on food name
    const macros = this.estimateItemMacros(item.name, item.quantity)

    return {
      ...item,
      nutritionEstimate: {
        caloriesKcal: macros.calories,
        proteinG: macros.protein,
        carbsG: macros.carbs,
        fatG: macros.fat,
        fiberG: null,
        source: 'heuristic',
        confidence: 0.4,
      }
    }
  }

  private estimateItemMacros(name: string, quantity: any) {
    // Basic heuristic estimates - could be enhanced with a lookup table
    const normalized = name.toLowerCase()

    let baseCalories = 200
    let baseProtein = 7
    let baseCarbs = 26
    let baseFat = 8

    // Simple food category estimates
    if (normalized.includes('egg')) {
      baseCalories = 70; baseProtein = 6; baseCarbs = 1; baseFat = 5
    } else if (normalized.includes('bread') || normalized.includes('toast')) {
      baseCalories = 80; baseProtein = 3; baseCarbs = 15; baseFat = 1
    } else if (normalized.includes('banana')) {
      baseCalories = 105; baseProtein = 1; baseCarbs = 27; baseFat = 0.4
    } else if (normalized.includes('apple')) {
      baseCalories = 95; baseProtein = 0.5; baseCarbs = 25; baseFat = 0.3
    }

    const multiplier = quantity?.value || 1

    return {
      calories: Math.round(baseCalories * multiplier / 5) * 5, // Round to nearest 5
      protein: Math.round(baseProtein * multiplier),
      carbs: Math.round(baseCarbs * multiplier),
      fat: Math.round(baseFat * multiplier),
    }
  }

  private mergeNutritionEstimates(
    existing: NutritionEstimate | null | undefined,
    incoming: NutritionEstimate
  ): NutritionEstimate {
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

  private coerce(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null
    const n = Number(value)
    return Number.isNaN(n) ? null : Number(n.toFixed(2))
  }
}

export const calorieLookupAgent = new CalorieLookupAgent()
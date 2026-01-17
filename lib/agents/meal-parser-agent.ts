import { z } from 'zod'
import type { MealParseResult, MealType, StructuredMealItem } from '@/lib/types'

export interface MealParserAgentInput {
  text: string
  mealType?: MealType
}

export interface MealParserAgentOutput {
  result: MealParseResult
  source: 'llm' | 'heuristic'
}

/**
 * Meal Parser Agent - Expert food parsing specialist
 *
 * Role: Converts natural language food descriptions into structured data
 * Responsibilities:
 * - Parse meal text into individual food items
 * - Extract quantities, units, and portions
 * - Identify meal types and food preparation methods
 * - Handle complex meal descriptions with multiple items
 */
export class MealParserAgent {
  private readonly systemPrompt = `You are an expert food parsing specialist with deep knowledge of food nomenclature, portion sizes, and meal composition. Your job is to analyze natural language descriptions of meals and extract structured data including individual food items, quantities, units of measurement, and meal classifications. You understand cooking methods, brand variations, and common portion descriptions. Parse food descriptions with precision while handling ambiguity gracefully. Always extract measurable quantities when possible and provide structured JSON output with consistent field names. Extract meal items from the user text and respond with JSON only. Use keys: meal_type, context_note, confidence, items[]. Each item must include raw_text, name, quantity {value,unit,display}, size_hint, nutrition_estimate, lookup, flags. Leave nutrition_estimate fields null if unknown. Do not add commentary.`

  private readonly responseSchema = z.object({
    meal_type: z.string().optional(),
    mealType: z.string().optional(),
    context_note: z.string().nullable().optional(),
    items: z.array(
      z.object({
        raw_text: z.string(),
        name: z.string(),
        brand: z.string().nullable().optional(),
        preparation: z.array(z.string()).optional(),
        quantity: z.object({
          value: z.number().nullable().optional(),
          unit: z.string().nullable().optional(),
          display: z.string().nullable().optional(),
        }).default({ value: null, unit: null, display: null }),
        size_hint: z.enum(['small', 'medium', 'large']).nullable().optional(),
        alcohol: z
          .object({
            is_alcohol: z.boolean(),
            abv_pct: z.number().nullable().optional(),
            volume_ml: z.number().nullable().optional(),
          })
          .optional()
          .nullable(),
        nutrition_estimate: z.object({
          calories_kcal: z.number().nullable().optional(),
          protein_g: z.number().nullable().optional(),
          carbs_g: z.number().nullable().optional(),
          fat_g: z.number().nullable().optional(),
          fiber_g: z.number().nullable().optional(),
          source: z.string().optional(),
          confidence: z.number().nullable().optional(),
        }).nullable().optional(),
        lookup: z.object({
          status: z.enum(['pending', 'matched', 'ambiguous']).default('pending'),
          candidates: z.array(z.object({
            provider: z.string(),
            id: z.string(),
            name: z.string(),
          })).default([]),
        }).optional(),
        flags: z.object({
          needs_lookup: z.boolean().optional(),
          needs_portion: z.boolean().optional(),
        }).optional(),
        confidence: z.enum(['low', 'medium', 'high']).optional(),
      })
    ).min(1),
    totals: z.object({
      calories_kcal: z.number().nullable().optional(),
      protein_g: z.number().nullable().optional(),
      carbs_g: z.number().nullable().optional(),
      fat_g: z.number().nullable().optional(),
      fiber_g: z.number().nullable().optional(),
      source: z.string().optional(),
      confidence: z.number().nullable().optional(),
    }).nullable().optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
    audit: z.object({
      message_id: z.string().optional(),
      parsed_by: z.string().optional(),
      version: z.string().optional(),
    }).optional(),
  })

  async parsemeal(input: MealParserAgentInput): Promise<MealParserAgentOutput> {
    console.log('[MealParserAgent] Parsing:', input.text)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn('[MealParserAgent] No API key, falling back to heuristic parsing')
      return {
        result: this.heuristicParse(input.text),
        source: 'heuristic'
      }
    }

    try {
      const llmResult = await this.callLLMParser(apiKey, input.text)
      return {
        result: {
          ...llmResult,
          audit: {
            ...(llmResult.audit ?? {}),
            inputText: input.text,
            source: 'llm',
          },
        },
        source: 'llm'
      }
    } catch (error) {
      console.warn('[MealParserAgent] LLM parsing failed, falling back to heuristic:', error)
      return {
        result: this.heuristicParse(input.text),
        source: 'heuristic'
      }
    }
  }

  private async callLLMParser(apiKey: string, text: string): Promise<MealParseResult> {
    const [{ generateObject }, { createOpenAI }] = await Promise.all([
      import('ai'),
      import('@ai-sdk/openai'),
    ])

    const client = createOpenAI({ apiKey })

    const { object: parsed } = await generateObject({
      model: client('gpt-5-mini'),
      schema: this.responseSchema,
      system: this.systemPrompt,
      prompt: text,
      temperature: 0.1,
    })

    const mealType = (parsed.meal_type ?? parsed.mealType ?? 'unknown').toLowerCase()
    const items = parsed.items.map(this.normalizeLLMItem)
    const totals = this.normalizeNutrition(parsed.totals)
    const confidence = parsed.confidence ?? this.inferConfidenceFromItems(items)

    return {
      mealType: this.normalizeMealType(mealType),
      contextNote: parsed.context_note ?? null,
      items,
      totals: totals ?? this.computeTotals(items),
      confidence,
      audit: {
        messageId: parsed.audit?.message_id,
        parsedBy: parsed.audit?.parsed_by,
        version: parsed.audit?.version,
        inputText: text,
      },
    }
  }

  private heuristicParse(text: string): MealParseResult {
    const cleanedInput = text.trim()
    const parts = this.segmentMealText(cleanedInput)
    const inferredType = this.normalizeMealType(this.inferMealType(cleanedInput))

    const items: StructuredMealItem[] = parts.map((part) => {
      const quantityInfo = this.extractQuantityInfo(part)
      const quantity = quantityInfo ?? { value: null, unit: null, display: null }

      return {
        rawText: part,
        name: this.deriveItemName(part),
        brand: null,
        preparation: [],
        quantity,
        sizeHint: null,
        alcohol: null,
        nutritionEstimate: null,
        lookup: { status: 'pending', candidates: [] },
        flags: {
          needsLookup: true,
          needsPortion: quantity.value === null,
        },
        confidence: 'medium',
      }
    })

    return {
      mealType: inferredType,
      contextNote: null,
      items,
      totals: null,
      confidence: 'medium',
      audit: {
        inputText: text,
        source: 'heuristic',
      },
    }
  }

  // Helper methods
  private normalizeLLMItem(item: any): StructuredMealItem {
    return {
      rawText: item.raw_text,
      name: item.name,
      brand: item.brand ?? null,
      preparation: item.preparation ?? [],
      quantity: {
        value: item.quantity?.value ?? null,
        unit: item.quantity?.unit ?? null,
        display: item.quantity?.display ?? null,
      },
      sizeHint: item.size_hint,
      alcohol: item.alcohol ? {
        isAlcohol: item.alcohol.is_alcohol,
        abvPct: item.alcohol.abv_pct ?? null,
        volumeMl: item.alcohol.volume_ml ?? null,
      } : null,
      nutritionEstimate: this.normalizeNutrition(item.nutrition_estimate),
      lookup: item.lookup ? {
        status: item.lookup.status,
        candidates: item.lookup.candidates.map((c: any) => ({
          provider: c.provider,
          id: c.id,
          name: c.name,
        })),
      } : { status: 'pending', candidates: [] },
      flags: {
        needsLookup: item.flags?.needs_lookup ?? false,
        needsPortion: item.flags?.needs_portion ?? false,
      },
      confidence: item.confidence ?? 'medium',
    }
  }

  private normalizeNutrition(input: any) {
    if (!input) return null
    return {
      caloriesKcal: input.calories_kcal ?? null,
      proteinG: input.protein_g ?? null,
      carbsG: input.carbs_g ?? null,
      fatG: input.fat_g ?? null,
      fiberG: input.fiber_g ?? null,
      source: input.source || 'heuristic',
      confidence: input.confidence ?? null,
    }
  }

  private inferConfidenceFromItems(items: StructuredMealItem[]) {
    if (items.some((item) => item.flags?.needsLookup)) {
      return 'medium' as const
    }
    return 'high' as const
  }

  private normalizeMealType(value: string): MealParseResult['mealType'] {
    const lowered = value.toLowerCase()
    if (['breakfast', 'lunch', 'dinner', 'snack', 'drink'].includes(lowered)) {
      return lowered as any
    }
    return this.inferMealType(value)
  }

  private computeTotals(items: StructuredMealItem[]) {
    // Implementation similar to existing computeTotals
    return null
  }

  private segmentMealText(text: string): string[] {
    // Clean conversational prefixes
    let cleaned = text
      .replace(/^[^:]+:\s*/, '') // Remove "Meal: ..."
      .replace(/^(?:for\s+|at\s+|during\s+|my\s+)?(?:breakfast|lunch|dinner|snack)\s*(?:was|is|=|,)?\s*/i, '')
      .replace(/^(?:i\s+(?:had|ate|was\s+eating|just\s+had))\s*/i, '')
      .replace(/^(?:today\s+)?(?:i\s+)?(?:just\s+|also\s+)?(?:consumed|enjoyed|grabbed)\s*/i, '')
      .trim()

    return cleaned
      .split(/(?:\s+and\s+|,\s*|\+\s*|\s*&\s*)/)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  private deriveItemName(part: string): string {
    return part.trim().replace(/^[0-9./\s]+/, '')
  }

  private extractQuantityInfo(text: string) {
    const quantityRegex = /(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)(?:\s*)(cups?|cup|c|tablespoons?|tbsp|tbsps?|teaspoons?|tsp|tsps?|ounces?|oz|oz_fl|grams?|g|servings?|serving|pieces?|piece|slices?|slice)\b/i
    const match = quantityRegex.exec(text)

    if (match) {
      return {
        value: this.parseQuantityValue(match[1]),
        unit: match[2].toLowerCase(),
        display: match[0],
      }
    }

    const leadingMatch = text.match(/^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/)
    if (leadingMatch) {
      return {
        value: this.parseQuantityValue(leadingMatch[1]),
        unit: null,
        display: leadingMatch[0],
      }
    }

    return null
  }

  private parseQuantityValue(raw: string): number {
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

  private inferMealType(text: string): MealType {
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
}

export const mealParserAgent = new MealParserAgent()
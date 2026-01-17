/**
 * USDA FoodData Central API Client
 * https://fdc.nal.usda.gov/api-guide.html
 *
 * Free API - no key required for basic lookups
 */

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1'

export interface USDAFoodItem {
  fdcId: number
  description: string
  dataType: string
  brandOwner?: string
  ingredients?: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients: USDANutrient[]
}

export interface USDANutrient {
  nutrientId: number
  nutrientName: string
  nutrientNumber: string
  unitName: string
  value: number
}

export interface USDASearchResult {
  totalHits: number
  foods: USDAFoodItem[]
}

export interface NormalizedNutrition {
  fdcId: number
  name: string
  brand?: string
  servingSize: number
  servingSizeUnit: string
  per100g: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber?: number
  }
  source: 'usda'
}

// USDA nutrient IDs
const NUTRIENT_IDS = {
  ENERGY: 1008,      // kcal
  PROTEIN: 1003,     // g
  CARBS: 1005,       // g (total carbohydrate)
  FAT: 1004,         // g (total fat)
  FIBER: 1079,       // g (dietary fiber)
}

export async function searchFoods(query: string, limit = 5): Promise<USDAFoodItem[]> {
  const params = new URLSearchParams({
    query,
    dataType: 'Foundation,SR Legacy',
    pageSize: String(limit),
  })

  const response = await fetch(`${BASE_URL}/foods/search?${params}`)

  if (!response.ok) {
    console.error('[USDA] Search failed:', response.status, response.statusText)
    return []
  }

  const data: USDASearchResult = await response.json()
  return data.foods || []
}

export async function getFoodDetails(fdcId: number): Promise<USDAFoodItem | null> {
  const response = await fetch(`${BASE_URL}/food/${fdcId}`)

  if (!response.ok) {
    console.error('[USDA] Get food failed:', response.status, response.statusText)
    return null
  }

  return response.json()
}

function extractNutrientValue(nutrients: USDANutrient[], nutrientId: number): number {
  const nutrient = nutrients.find(n => n.nutrientId === nutrientId)
  return nutrient?.value ?? 0
}

export function normalizeUSDAFood(food: USDAFoodItem): NormalizedNutrition {
  const nutrients = food.foodNutrients || []

  return {
    fdcId: food.fdcId,
    name: food.description,
    brand: food.brandOwner,
    servingSize: food.servingSize ?? 100,
    servingSizeUnit: food.servingSizeUnit ?? 'g',
    per100g: {
      calories: extractNutrientValue(nutrients, NUTRIENT_IDS.ENERGY),
      protein: extractNutrientValue(nutrients, NUTRIENT_IDS.PROTEIN),
      carbs: extractNutrientValue(nutrients, NUTRIENT_IDS.CARBS),
      fat: extractNutrientValue(nutrients, NUTRIENT_IDS.FAT),
      fiber: extractNutrientValue(nutrients, NUTRIENT_IDS.FIBER) || undefined,
    },
    source: 'usda',
  }
}

export async function lookupFood(query: string): Promise<NormalizedNutrition | null> {
  const results = await searchFoods(query, 1)

  if (results.length === 0) {
    return null
  }

  const food = results[0]

  // If the search result doesn't have full nutrient data, fetch details
  if (!food.foodNutrients || food.foodNutrients.length === 0) {
    const detailed = await getFoodDetails(food.fdcId)
    if (!detailed) return null
    return normalizeUSDAFood(detailed)
  }

  return normalizeUSDAFood(food)
}

export function scaleNutritionToServing(
  nutrition: NormalizedNutrition,
  servingGrams: number
): {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
} {
  const scale = servingGrams / 100

  return {
    calories: Math.round(nutrition.per100g.calories * scale),
    protein: Math.round(nutrition.per100g.protein * scale * 10) / 10,
    carbs: Math.round(nutrition.per100g.carbs * scale * 10) / 10,
    fat: Math.round(nutrition.per100g.fat * scale * 10) / 10,
    fiber: nutrition.per100g.fiber
      ? Math.round(nutrition.per100g.fiber * scale * 10) / 10
      : undefined,
  }
}

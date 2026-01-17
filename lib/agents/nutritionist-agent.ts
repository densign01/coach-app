import type {
  CoachState,
  UserProfile,
  MealLog,
  WorkoutLog,
  MacroBreakdown,
  CoachMessage
} from '@/lib/types'

export interface NutritionistAgentInput {
  type: 'meal_analysis' | 'progress_review' | 'recommendation' | 'plan_adjustment'
  state: CoachState
  context?: {
    recentMeals?: MealLog[]
    todaysMeals?: MealLog[]
    weeklyStats?: any
    userGoals?: string
    specificQuestion?: string
  }
}

export interface NutritionistAgentOutput {
  analysis: string
  recommendations: string[]
  insights: string[]
  confidence: 'low' | 'medium' | 'high'
  actionItems?: string[]
}

/**
 * Nutritionist Agent - Expert registered dietitian and sports nutritionist
 *
 * Role: Provides specialized nutritional analysis and recommendations
 * Responsibilities:
 * - Analyze meal patterns against user goals
 * - Provide evidence-based nutritional guidance
 * - Generate personalized meal recommendations
 * - Track progress toward nutritional objectives
 * - Handle special dietary considerations
 */
export class NutritionistAgent {
  private readonly systemPrompt = `You are an expert registered dietitian and sports nutritionist with advanced knowledge in performance nutrition, body composition, and metabolic health. Your role is to analyze eating patterns, provide evidence-based nutritional guidance, and create personalized recommendations for athletic performance and health optimization. You understand macro and micronutrient requirements, meal timing, supplementation, and how nutrition impacts training, recovery, and body composition goals. Provide actionable, science-backed advice while considering individual preferences, lifestyle constraints, and specific performance objectives. Always prioritize sustainable, healthy eating patterns over extreme approaches.`

  async analyzeNutrition(input: NutritionistAgentInput): Promise<NutritionistAgentOutput> {
    console.log('[NutritionistAgent] Analyzing nutrition for type:', input.type)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return this.getFallbackAnalysis(input)
    }

    try {
      switch (input.type) {
        case 'meal_analysis':
          return await this.analyzeMealPattern(apiKey, input)
        case 'progress_review':
          return await this.reviewProgress(apiKey, input)
        case 'recommendation':
          return await this.generateRecommendations(apiKey, input)
        case 'plan_adjustment':
          return await this.adjustPlan(apiKey, input)
        default:
          return this.getFallbackAnalysis(input)
      }
    } catch (error) {
      console.error('[NutritionistAgent] Analysis failed:', error)
      return this.getFallbackAnalysis(input)
    }
  }

  private async analyzeMealPattern(apiKey: string, input: NutritionistAgentInput): Promise<NutritionistAgentOutput> {
    const prompt = this.buildMealAnalysisPrompt(input)
    const response = await this.callNutritionistAPI(apiKey, prompt)

    return this.parseNutritionistResponse(response, 'meal_analysis')
  }

  private async reviewProgress(apiKey: string, input: NutritionistAgentInput): Promise<NutritionistAgentOutput> {
    const prompt = this.buildProgressReviewPrompt(input)
    const response = await this.callNutritionistAPI(apiKey, prompt)

    return this.parseNutritionistResponse(response, 'progress_review')
  }

  private async generateRecommendations(apiKey: string, input: NutritionistAgentInput): Promise<NutritionistAgentOutput> {
    const prompt = this.buildRecommendationPrompt(input)
    const response = await this.callNutritionistAPI(apiKey, prompt)

    return this.parseNutritionistResponse(response, 'recommendation')
  }

  private async adjustPlan(apiKey: string, input: NutritionistAgentInput): Promise<NutritionistAgentOutput> {
    const prompt = this.buildPlanAdjustmentPrompt(input)
    const response = await this.callNutritionistAPI(apiKey, prompt)

    return this.parseNutritionistResponse(response, 'plan_adjustment')
  }

  private async callNutritionistAPI(apiKey: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    })

    if (!response.ok) {
      throw new Error(`Nutritionist API failed with status ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  }

  private buildMealAnalysisPrompt(input: NutritionistAgentInput): string {
    const profile = input.state.profile
    const todaysMeals = input.context?.todaysMeals || []
    const totalMacros = this.calculateDailyTotals(todaysMeals)

    return `Analyze today's nutrition intake for this user:

PROFILE:
- Goals: ${profile?.goals || 'Not specified'}
- Age: ${profile?.age || 'Unknown'}, Gender: ${profile?.gender || 'Unknown'}
- Height: ${profile?.heightCm || 'Unknown'}cm, Weight: ${profile?.weightKg || 'Unknown'}kg
- Activity Level: Based on workout pattern

TODAY'S INTAKE:
- Total Calories: ${totalMacros.calories}
- Protein: ${totalMacros.protein}g
- Carbs: ${totalMacros.carbs}g
- Fat: ${totalMacros.fat}g
- Meals: ${todaysMeals.map(m => `${m.type}: ${m.items.join(', ')}`).join(' | ')}

ANALYSIS REQUEST:
Provide a nutritional analysis focusing on:
1. Macro balance appropriateness for their goals
2. Meal timing and distribution
3. Nutrient density assessment
4. Areas for improvement

Format your response as:
ANALYSIS: [2-3 sentences]
RECOMMENDATIONS: [3-4 specific actionable items]
INSIGHTS: [2-3 key observations]
CONFIDENCE: [high/medium/low]`
  }

  private buildProgressReviewPrompt(input: NutritionistAgentInput): string {
    const profile = input.state.profile
    const insights = profile?.insights || []

    return `Review nutritional progress for this user:

PROFILE & GOALS:
- Goals: ${profile?.goals || 'Not specified'}
- Current insights: ${insights.join('; ') || 'None recorded'}

RECENT PATTERNS:
${this.summarizeRecentPatterns(input)}

PROGRESS REVIEW REQUEST:
Assess their nutritional progress and adherence to goals:
1. How well are they meeting their stated goals?
2. What patterns indicate progress or areas of concern?
3. What adjustments might optimize their results?

Format your response as:
ANALYSIS: [Progress assessment]
RECOMMENDATIONS: [Adjustments needed]
INSIGHTS: [Key patterns observed]
CONFIDENCE: [high/medium/low]`
  }

  private buildRecommendationPrompt(input: NutritionistAgentInput): string {
    const question = input.context?.specificQuestion || 'General nutrition recommendations'
    const profile = input.state.profile

    return `Provide nutritional recommendations:

USER PROFILE:
- Goals: ${profile?.goals || 'Not specified'}
- Current status: ${this.summarizeCurrentStatus(input)}

SPECIFIC QUESTION/CONTEXT:
${question}

RECOMMENDATION REQUEST:
Provide evidence-based nutritional recommendations that are:
1. Specific and actionable
2. Aligned with their goals
3. Practical for their lifestyle
4. Based on current nutrition science

Format your response as:
ANALYSIS: [Assessment of current situation]
RECOMMENDATIONS: [Specific actionable recommendations]
INSIGHTS: [Key principles to remember]
CONFIDENCE: [high/medium/low]`
  }

  private buildPlanAdjustmentPrompt(input: NutritionistAgentInput): string {
    return `Suggest plan adjustments based on current patterns:

CURRENT SITUATION:
${this.summarizeCurrentStatus(input)}

ADJUSTMENT REQUEST:
Based on their patterns and feedback, suggest specific adjustments to:
1. Macro targets
2. Meal timing
3. Food choices
4. Portion sizes

Format your response as:
ANALYSIS: [Why adjustments are needed]
RECOMMENDATIONS: [Specific plan modifications]
INSIGHTS: [Expected outcomes]
CONFIDENCE: [high/medium/low]`
  }

  private parseNutritionistResponse(response: string, type: string): NutritionistAgentOutput {
    const lines = response.split('\n').filter(line => line.trim())

    let analysis = ''
    let recommendations: string[] = []
    let insights: string[] = []
    let confidence: 'low' | 'medium' | 'high' = 'medium'

    let currentSection = ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('ANALYSIS:')) {
        currentSection = 'analysis'
        analysis = trimmed.replace('ANALYSIS:', '').trim()
      } else if (trimmed.startsWith('RECOMMENDATIONS:')) {
        currentSection = 'recommendations'
        const rec = trimmed.replace('RECOMMENDATIONS:', '').trim()
        if (rec) recommendations.push(rec)
      } else if (trimmed.startsWith('INSIGHTS:')) {
        currentSection = 'insights'
        const insight = trimmed.replace('INSIGHTS:', '').trim()
        if (insight) insights.push(insight)
      } else if (trimmed.startsWith('CONFIDENCE:')) {
        const conf = trimmed.replace('CONFIDENCE:', '').trim().toLowerCase()
        if (conf === 'high' || conf === 'medium' || conf === 'low') {
          confidence = conf
        }
      } else if (trimmed && currentSection) {
        // Continue previous section
        if (currentSection === 'analysis') {
          analysis += ' ' + trimmed
        } else if (currentSection === 'recommendations') {
          recommendations.push(trimmed)
        } else if (currentSection === 'insights') {
          insights.push(trimmed)
        }
      }
    }

    // Fallback parsing if structured format wasn't used
    if (!analysis && !recommendations.length && !insights.length) {
      const sentences = response.split('.').filter(s => s.trim())
      analysis = sentences.slice(0, 2).join('.') + '.'
      recommendations = sentences.slice(2, 5).map(s => s.trim()).filter(Boolean)
      insights = sentences.slice(5).map(s => s.trim()).filter(Boolean)
    }

    return {
      analysis: analysis || 'Analysis completed.',
      recommendations: recommendations.length ? recommendations : ['Continue current approach.'],
      insights: insights.length ? insights : ['Monitor progress.'],
      confidence,
    }
  }

  private getFallbackAnalysis(input: NutritionistAgentInput): NutritionistAgentOutput {
    return {
      analysis: 'Basic nutritional assessment completed based on available data.',
      recommendations: [
        'Continue tracking your meals consistently',
        'Focus on balanced macro distribution',
        'Stay hydrated throughout the day'
      ],
      insights: [
        'Consistent tracking helps identify patterns',
        'Small adjustments can lead to significant improvements'
      ],
      confidence: 'low'
    }
  }

  private calculateDailyTotals(meals: MealLog[]): MacroBreakdown {
    return meals.reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.macros.calories,
        protein: acc.protein + meal.macros.protein,
        fat: acc.fat + meal.macros.fat,
        carbs: acc.carbs + meal.macros.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    )
  }

  private summarizeRecentPatterns(input: NutritionistAgentInput): string {
    const recentMeals = input.context?.recentMeals || []
    if (recentMeals.length === 0) {
      return 'No recent meal data available.'
    }

    const totalMacros = this.calculateDailyTotals(recentMeals)
    const avgCalories = Math.round(totalMacros.calories / Math.max(1, recentMeals.length))

    return `Recent ${recentMeals.length} meals averaged ${avgCalories} calories with ${Math.round(totalMacros.protein / recentMeals.length)}g protein per meal.`
  }

  private summarizeCurrentStatus(input: NutritionistAgentInput): string {
    const profile = input.state.profile
    const todaysMeals = input.context?.todaysMeals || []
    const totalMacros = this.calculateDailyTotals(todaysMeals)

    return `User has logged ${todaysMeals.length} meals today (${totalMacros.calories} cal, ${totalMacros.protein}g protein). Goals: ${profile?.goals || 'Not specified'}.`
  }
}

export const nutritionistAgent = new NutritionistAgent()
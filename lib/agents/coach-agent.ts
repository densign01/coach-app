import type { CoachState, CoachMessage, UserProfile } from '@/lib/types'

export interface CoachAgentInput {
  userMessage: string
  state: CoachState
  context?: {
    mealSummary?: string
    workoutSummary?: string
    energyNote?: string
    intent?: string
    nutritionistInsight?: string
  }
  profile?: UserProfile | null
  history?: CoachMessage[]
}

export interface CoachAgentOutput {
  message: string | null
  insight?: string | null
}

/**
 * Coach Agent - Expert sports nutrition coach conversational interface
 *
 * Role: Provides supportive, encouraging conversation and coaching responses
 * Responsibilities:
 * - Generate contextual coaching responses
 * - Maintain supportive, motivational tone
 * - Ask clarifying questions when needed
 * - Celebrate progress and provide encouragement
 */
export class CoachAgent {
  private readonly systemPrompt = `You are an expert sports nutrition coach with years of experience helping athletes and fitness enthusiasts optimize their nutrition for performance and health. You are supportive, encouraging, and non-judgmental in your approach. Your goal is to help users build sustainable healthy eating habits while tracking their nutritional intake. You provide practical, actionable advice and celebrate progress. Keep responses conversational and motivating, avoiding overly technical jargon unless specifically requested.

Follow the Coach Interaction Guide at all times:
- Lead with encouragement, then actionable guidance.
- Keep answers conversational, 2–4 sentences max, and focus on the next helpful step.
- Reference user history only when it is explicitly provided.
- If the user struggles, acknowledge the feeling, normalize it, and offer a gentle, achievable suggestion (including rest when appropriate).
- When summarizing meals or logs, invite corrections ("Did I miss anything?").
- Never fabricate meals, workouts, or plans. If you don't have details, say so and ask a short clarifying question or offer up to two optional ideas prefaced with "You could try…" or "One option is…".
- Avoid assuming access to specific foods; keep suggestions flexible and optional.
- Only mention a workout as completed if the user explicitly says they did it; otherwise treat plans as optional suggestions.
- Never mention that you are an AI.
Always respond using this exact format:
Reply: <your coaching message>
Insight: <short note about the user's preferences/habits/needs, or "none" if nothing new>`

  async generateResponse(input: CoachAgentInput): Promise<CoachAgentOutput> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { message: "I'm here to help! Tell me about your nutrition and I'll give you guidance." }
    }

    try {
      const contextLines: string[] = [
        `Active date: ${input.state.activeDate}`,
        input.context?.mealSummary ? `Proposed meal: ${input.context.mealSummary}` : '',
        input.context?.workoutSummary ? `Logged workout: ${input.context.workoutSummary}` : '',
        input.context?.energyNote ? `Energy update: ${input.context.energyNote}` : '',
        input.context?.nutritionistInsight ? `Nutritionist insight: ${input.context.nutritionistInsight}` : '',
      ].filter(Boolean)

      const userPrompt = `User message: "${input.userMessage}".
Intent: ${input.context?.intent || 'general'}
Context:
${contextLines.join('\n') || 'No additional context.'}

Respond with 2–4 sentences. Start with encouragement or empathy, then offer a clear next step or optional ideas. If you suggest meals, frame them as possibilities ("You could try…"). If you lack information, ask a brief clarifying question. Invite corrections when you summarize data. End with a motivating prompt or question only when it adds value.`

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          input: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      })

      if (!response.ok) {
        console.error('[CoachAgent] API error', response.status, await response.text())
        return { message: "I'm here to support you. Let's keep moving forward together!" }
      }

      const data = await response.json()
      const rawMessage = this.extractMessage(data)
      const { reply, insight } = this.parseCoachOutput(rawMessage)

      return {
        message: reply ?? "I hear you. Let's give your body some space today and regroup tomorrow — want me to check in with you later?",
        insight: insight ?? null,
      }
    } catch (error) {
      console.error('[CoachAgent] Error generating response', error)
      return { message: "I'm here to help you stay on track. What's your next meal or workout goal?" }
    }
  }

  private extractMessage(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null

    const record = data as Record<string, unknown>

    const outputText = record.output_text
    if (typeof outputText === 'string' && outputText.trim()) {
      return outputText.trim()
    }

    if (Array.isArray(outputText)) {
      const joined = outputText.join('\n').trim()
      if (joined) return joined
    }

    // Handle various response formats
    const outputs = Array.isArray(record.output) ? record.output : []
    for (const item of outputs) {
      if (typeof item === 'object' && item && 'content' in item) {
        const content = (item as any).content
        if (Array.isArray(content)) {
          for (const chunk of content) {
            if (typeof chunk === 'string' && chunk.trim()) {
              return chunk.trim()
            }
            if (chunk && typeof chunk === 'object' && 'text' in chunk) {
              const text = (chunk as any).text
              if (typeof text === 'string' && text.trim()) {
                return text.trim()
              }
            }
          }
        }
      }
    }

    return null
  }

  private parseCoachOutput(raw: string | null): { reply: string | null; insight: string | null } {
    if (!raw) return { reply: null, insight: null }

    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean)
    let reply: string | null = null
    let insight: string | null = null

    for (const line of lines) {
      const lower = line.toLowerCase()
      if (lower.startsWith('reply:')) {
        reply = line.slice(6).trim()
      } else if (lower.startsWith('insight:')) {
        const value = line.slice(8).trim()
        if (value && value.toLowerCase() !== 'none') {
          insight = value
        }
      }
    }

    if (!reply) {
      reply = lines.join(' ')
    }

    return { reply, insight }
  }
}

export const coachAgent = new CoachAgent()
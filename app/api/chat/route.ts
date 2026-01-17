import { NextResponse } from 'next/server'

const OPENAI_URL = 'https://api.openai.com/v1/responses'

interface ChatContextPayload {
  userMessage: string
  activeDate: string
  intent: string
  mealSummary?: string
  workoutSummary?: string
  energyNote?: string
  macroTotals?: {
    calories: number
    protein: number
    fat: number
    carbs: number
  }
  upcomingPlan?: string
  recentMeals?: string[]
  recentWorkouts?: string[]
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as ChatContextPayload | null

  if (!payload?.userMessage) {
    return NextResponse.json({ error: 'Missing userMessage' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key missing' }, { status: 500 })
  }

  const contextLines: string[] = [
    `Active date: ${payload.activeDate}`,
    payload.macroTotals
      ? `Current totals -> ${Math.round(payload.macroTotals.protein)}g protein / ${Math.round(payload.macroTotals.calories)} cal / ${Math.round(payload.macroTotals.fat)}g fat / ${Math.round(payload.macroTotals.carbs)}g carbs.`
      : '',
    payload.recentWorkouts?.length
      ? `Workouts logged today: ${payload.recentWorkouts.join(' | ')}`
      : 'No workouts logged yet today.',
    payload.upcomingPlan ? `Upcoming plan (optional): ${payload.upcomingPlan}` : '',
    payload.mealSummary ? `Proposed meal: ${payload.mealSummary}` : '',
    payload.workoutSummary ? `Logged workout: ${payload.workoutSummary}` : '',
    payload.energyNote ? `Energy update: ${payload.energyNote}` : '',
    payload.recentMeals?.length ? `Recent meals: ${payload.recentMeals.join(' | ')}` : '',
  ].filter(Boolean)

  const systemPrompt = `You are an expert sports nutrition coach with years of experience helping athletes and fitness enthusiasts optimize their nutrition for performance and health. You are supportive, encouraging, and non-judgmental in your approach. Your goal is to help users build sustainable healthy eating habits while tracking their nutritional intake. You provide practical, actionable advice and celebrate progress. Keep responses conversational and motivating, avoiding overly technical jargon unless specifically requested.

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

  const userPrompt = `User message: "${payload.userMessage}".
Intent: ${payload.intent}
Context:
${contextLines.join('\n') || 'No additional context.'}

Respond with 2–4 sentences. Start with encouragement or empathy, then offer a clear next step or optional ideas. If you suggest meals, frame them as possibilities (“You could try…”). If you lack information, ask a brief clarifying question. Invite corrections when you summarize data. End with a motivating prompt or question only when it adds value.`

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[api/chat] OpenAI error', response.status, errorBody)
      return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
    }

    const data = await response.json()
    const rawMessage = extractMessage(data)
    const { reply, insight } = parseCoachOutput(rawMessage)

    return NextResponse.json({
      message: reply ?? 'I hear you. Let’s give your body some space today and regroup tomorrow — want me to check in with you later?',
      insight: insight ?? null,
    })
  } catch (error) {
    console.error('[api/chat] Unexpected error', error)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}

type ResponseContentBlock = {
  type?: string
  text?: string
} & Record<string, unknown>

type ResponseOutputItem = {
  content?: ResponseContentBlock[] | string[]
} & Record<string, unknown>

function extractMessage(data: unknown): string | null {
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

  const outputs = Array.isArray(record.output) ? (record.output as ResponseOutputItem[]) : []
  for (const item of outputs) {
    const content = Array.isArray(item.content) ? item.content : []
    for (const chunk of content) {
      if (typeof chunk === 'string' && chunk.trim()) {
        return chunk.trim()
      }

      if (chunk && typeof chunk === 'object') {
        const text = typeof (chunk as ResponseContentBlock).text === 'string' ? (chunk as ResponseContentBlock).text?.trim() : ''
        const type = (chunk as ResponseContentBlock).type
        if (text) {
          return text
        }
        if (type && typeof (chunk as ResponseContentBlock)[type] === 'string') {
          const potential = ((chunk as ResponseContentBlock)[type] as string).trim()
          if (potential) return potential
        }
      }
    }
  }

  const choices = record.choices
  if (Array.isArray(choices)) {
    const first = choices[0]
    if (first && typeof first === 'object') {
      const message = (first as Record<string, unknown>).message
      if (message && typeof message === 'object' && typeof (message as Record<string, unknown>).content === 'string') {
        const text = ((message as Record<string, unknown>).content as string).trim()
        if (text) return text
      }
    }
  }

  return null
}

function parseCoachOutput(raw: string | null): { reply: string | null; insight: string | null } {
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

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
    payload.upcomingPlan ? `Today plan: ${payload.upcomingPlan}` : '',
    payload.mealSummary ? `Proposed meal: ${payload.mealSummary}` : '',
    payload.workoutSummary ? `Logged workout: ${payload.workoutSummary}` : '',
    payload.energyNote ? `Energy update: ${payload.energyNote}` : '',
    payload.recentMeals?.length ? `Recent meals: ${payload.recentMeals.join(' | ')}` : '',
    payload.recentWorkouts?.length ? `Recent workouts: ${payload.recentWorkouts.join(' | ')}` : '',
  ].filter(Boolean)

const systemPrompt = `You are Coach, a compassionate, practical fitness + nutrition mentor.

Follow the Coach Interaction Guide at all times:
- Lead with encouragement, then actionable guidance.
- Keep answers conversational, 2–4 sentences max, and focus on the next helpful step.
- Reference user history only when it is explicitly provided.
- If the user struggles, acknowledge the feeling, normalize it, and offer a gentle, achievable suggestion (including rest when appropriate).
- When summarizing meals or logs, invite corrections ("Did I miss anything?").
- Never fabricate meals, workouts, or plans. If you don’t have details, say so and ask a short clarifying question or offer up to two optional ideas prefaced with “You could try…” or “One option is…”.
- Avoid assuming access to specific foods; keep suggestions flexible and optional.
- Never mention that you are an AI.`

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
        model: 'gpt-4o-mini',
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
    const message = extractMessage(data)

    return NextResponse.json({
      message: message ?? 'I hear you. Let’s give your body some space today and regroup tomorrow — want me to check in with you later?'
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

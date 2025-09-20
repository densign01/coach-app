import type { CoachMessage, UserProfile } from '@/lib/types'

export async function generateOnboardingResponse(
  userResponse: string,
  currentStep: OnboardingStep,
  nextStep: OnboardingStep | null,
  collectedData: Record<string, unknown>,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    // Fallback to simple acknowledgment if no API key
    return buildFallbackOnboardingReply(userResponse, nextStep)
  }

  try {
    const historySummary = summarizeCollectedData(collectedData)
    const systemPrompt = `You are a friendly, encouraging fitness coach conducting onboarding.
Your job is to acknowledge what the user just shared and then ask the next question.

Current context:
- Just asked: "${currentStep.question}"
- User responded: "${userResponse}"
- Next question: ${nextStep ? `"${nextStep.question}"` : "This completes onboarding"}
- Previous answers:
${historySummary || 'None yet.'}

Instructions:
1. Warmly acknowledge their response (1-2 sentences max) and, when relevant, connect it to earlier answers.
2. ${nextStep ? 'Ask the next question in a natural, conversational way.' : 'Wrap up warmly and let them know you are ready to help.'}
3. Be encouraging, concise, and personal—use their name when known.
4. Do not simply repeat their exact words; paraphrase or build on them.
5. Keep it concise but warm (no more than 3 sentences total).

Examples:
- "Great! That helps me understand your routine. Now, how tall are you?"
- "Perfect - I'll keep that in mind. What's your current weight?"
- "Thanks for sharing that. How many hours of sleep do you typically get?"`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userResponse }
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error('OpenAI API request failed')
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message?.content?.trim()

    if (message) {
      return message
    }
  } catch (error) {
    console.error('Error generating onboarding response:', error)
  }

  return buildFallbackOnboardingReply(userResponse, nextStep)
}

function buildFallbackOnboardingReply(userResponse: string, nextStep: OnboardingStep | null) {
  if (nextStep) {
    return `Thanks for sharing! ${nextStep.question}`
  }

  return "Perfect! That gives me everything I need to get started."
}

function summarizeCollectedData(data: Record<string, unknown>): string {
  const entries = Object.entries(data)
    .filter(([key, value]) => key !== 'insights' && value !== undefined && value !== null && String(value).trim().length > 0)
    .slice(-6)

  if (entries.length === 0) {
    return ''
  }

  return entries
    .map(([key, value]) => `- ${formatSummaryLabel(key)}: ${String(value).trim()}`)
    .join('\n')
}

function formatSummaryLabel(key: string): string {
  const labelMap: Record<string, string> = {
    firstName: 'First name',
    lastName: 'Last name',
    age: 'Age',
    heightCm: 'Height',
    weightKg: 'Weight',
    gender: 'Gender',
    goals: 'Goal',
    onboardingDepth: 'Detail preference',
    healthConditions: 'Health notes',
    currentExercise: 'Current exercise',
    typicalEating: 'Typical eating',
    dietaryRestrictions: 'Dietary preferences',
    motivation: 'Motivation',
  }

  if (labelMap[key]) return labelMap[key]

  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

export async function generateProfileSummary(
  profile: UserProfile,
  onboardingData: Record<string, unknown>
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return generateFallbackSummary(profile, onboardingData)
  }

  try {
    const profileInfo = `
Age: ${profile.age || 'Not specified'}
Gender: ${profile.gender || 'Not specified'}
Height: ${profile.heightCm ? `${profile.heightCm}cm` : 'Not specified'}
Weight: ${profile.weightKg ? `${profile.weightKg}kg` : 'Not specified'}
Goals: ${profile.goals || 'Not specified'}

Additional Information:
${Object.entries(onboardingData)
  .filter(([, value]) => value && typeof value === 'string' && value.trim())
  .map(([key, value]) => `${formatSummaryLabel(key)}: ${value}`)
  .join('\n')}
`

    const systemPrompt = `You are a fitness coach creating a personalized summary after onboarding.

Create a warm, encouraging 2-3 paragraph summary that:
1. Acknowledges their goals and current situation
2. Highlights key insights from their responses
3. Sets expectations for their journey ahead
4. Sounds personal and motivating

Keep it conversational, specific to their details, and under 200 words.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please create a profile summary for this user:\n\n${profileInfo}` }
        ],
        max_tokens: 250,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error('OpenAI API request failed')
    }

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content?.trim()

    if (summary) {
      return summary
    }
  } catch (error) {
    console.error('Error generating profile summary:', error)
  }

  return generateFallbackSummary(profile, onboardingData)
}

function generateFallbackSummary(profile: UserProfile, onboardingData: Record<string, unknown>): string {
  const age = profile.age ? `${profile.age}-year-old` : ''
  const goals = profile.goals || 'health and fitness goals'
  const highlights = Object.entries(onboardingData)
    .filter(([, value]) => value && String(value).trim().length > 0)
    .map(([key, value]) => `${formatSummaryLabel(key)}: ${String(value).trim()}`)
    .slice(0, 4)
    .join('\n')

  return `Welcome to your personalized coaching journey${age ? `, ${age}` : ''}! Based on what you've shared, I understand you're focused on ${goals}.
${highlights ? `\n\nA few quick notes I captured:\n${highlights}` : ''}

I'll be here to support you with tailored nutrition guidance and workout recommendations that fit your lifestyle. We'll take things step by step, building sustainable habits that work for you.

Ready to get started? Tell me about your day - whether it's a meal, workout, or how you're feeling - and I'll help guide you toward your goals!`
}

export interface OnboardingStep {
  id: number
  section: string
  question: string
  field?: keyof UserProfile | 'custom'
  customField?: string
  type: 'text' | 'number' | 'select' | 'multi-line'
  options?: string[]
  required?: boolean
  skipCondition?: (data: Record<string, unknown>) => boolean
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    section: 'welcome',
    question: "Welcome! I’ll ask a few quick questions so I can tailor everything for you.",
    type: 'text',
    required: false,
  },
  {
    id: 2,
    section: 'basics',
    question: "What first name should I use when I cheer you on?",
    field: 'firstName',
    type: 'text',
    required: true,
  },
  {
    id: 3,
    section: 'basics',
    question: 'Great! And your last name?',
    field: 'lastName',
    type: 'text',
    required: false,
  },
  {
    id: 4,
    section: 'basics',
    question: 'How old are you?',
    field: 'age',
    type: 'number',
    required: true,
  },
  {
    id: 5,
    section: 'basics',
    question: 'How tall are you? (feet and inches)',
    field: 'heightCm',
    type: 'text',
    required: true,
  },
  {
    id: 6,
    section: 'basics',
    question: 'What do you currently weigh? (pounds)',
    field: 'weightKg',
    type: 'text',
    required: true,
  },
  {
    id: 7,
    section: 'basics',
    question: 'How do you describe your gender?',
    field: 'gender',
    type: 'select',
    options: ['female', 'male', 'non-binary', 'prefer not to say', 'other'],
    required: false,
  },
  {
    id: 8,
    section: 'goals',
    question: 'What’s the main goal you want us to focus on first?',
    field: 'goals',
    type: 'select',
    options: ['weight loss', 'muscle gain', 'eating healthier', 'overall health', 'performance', 'not sure yet'],
    required: true,
  },
  {
    id: 9,
    section: 'flow',
    question: 'Want to dive into a few more questions now, or should I learn as we go?',
    customField: 'onboardingDepth',
    type: 'select',
    options: ['Let’s answer a few more now', 'Learn as we go'],
    required: true,
  },
  {
    id: 10,
    section: 'health',
    question: 'Any injuries or health considerations I should keep in mind?',
    customField: 'healthConditions',
    type: 'multi-line',
    required: false,
    skipCondition: (data) => data.onboardingDepth === 'learn',
  },
  {
    id: 11,
    section: 'habits',
    question: 'How many days a week do you currently exercise, and what do you usually do?',
    customField: 'currentExercise',
    type: 'multi-line',
    required: false,
    skipCondition: (data) => data.onboardingDepth === 'learn',
  },
  {
    id: 12,
    section: 'habits',
    question: 'Walk me through a typical day of eating (meals and snacks).',
    customField: 'typicalEating',
    type: 'multi-line',
    required: false,
    skipCondition: (data) => data.onboardingDepth === 'learn',
  },
  {
    id: 13,
    section: 'preferences',
    question: 'Any dietary preferences or foods you avoid?',
    customField: 'dietaryRestrictions',
    type: 'multi-line',
    required: false,
    skipCondition: (data) => data.onboardingDepth === 'learn',
  },
  {
    id: 14,
    section: 'motivation',
    question: 'What’s motivating you right now? Any specific wins you’re chasing?',
    customField: 'motivation',
    type: 'multi-line',
    required: false,
    skipCondition: (data) => data.onboardingDepth === 'learn',
  },
  {
    id: 15,
    section: 'wrap-up',
    question: 'Awesome! Anything else you’d like me to know before we get rolling?',
    type: 'multi-line',
    required: false,
  },
]

export function getNextOnboardingStep(currentStep: number, data: Record<string, unknown> = {}): OnboardingStep | null {
  const nextStep = ONBOARDING_STEPS.find(step => step.id === currentStep + 1)

  if (!nextStep) return null

  // Check skip conditions
  if (nextStep.skipCondition && nextStep.skipCondition(data)) {
    return getNextOnboardingStep(currentStep + 1, data)
  }

  return nextStep
}

export function getOnboardingStep(stepId: number): OnboardingStep | null {
  return ONBOARDING_STEPS.find(step => step.id === stepId) ?? null
}

export function isOnboardingComplete(stepId: number): boolean {
  return stepId >= ONBOARDING_STEPS.length
}

export function parseOnboardingResponse(step: OnboardingStep, response: string, currentData: Record<string, unknown> = {}): Record<string, unknown> {
  const newData = { ...currentData }

  if (step.field && step.field !== 'custom') {
    // Handle standard profile fields
    if (step.type === 'number') {
      const num = parseNumber(response)
      if (num !== null) {
        newData[step.field] = num
      }
    } else {
      newData[step.field] = response.trim()
    }
  } else if (step.customField) {
    // Handle custom onboarding data fields
    if (step.customField === 'onboardingDepth') {
      const normalized = response.toLowerCase()
      newData[step.customField] = normalized.includes('learn') ? 'learn' : 'more'
      return newData
    }
    if (step.type === 'number') {
      const num = parseNumber(response)
      if (num !== null) {
        newData[step.customField] = num
      }
    } else {
      newData[step.customField] = response.trim()
    }
  }

  return newData
}

function parseNumber(input: string): number | null {
  const num = parseFloat(input.replace(/[^\d.-]/g, ''))
  return isNaN(num) ? null : num
}

export function parseHeightToCm(input: string): number | null {
  const cleaned = input.toLowerCase().trim()

  // Already in cm
  if (cleaned.includes('cm') || /^\d+$/.test(cleaned)) {
    return parseNumber(cleaned)
  }

  // Feet and inches
  const feetInchesMatch = cleaned.match(/(\d+)['"]?\s*(\d+)['"]?/)
  if (feetInchesMatch) {
    const feet = parseInt(feetInchesMatch[1])
    const inches = parseInt(feetInchesMatch[2])
    return Math.round((feet * 12 + inches) * 2.54)
  }

  // Just feet
  const feetMatch = cleaned.match(/(\d+(?:\.\d+)?)['"]?\s*feet?/)
  if (feetMatch) {
    const feet = parseFloat(feetMatch[1])
    return Math.round(feet * 30.48)
  }

  return parseNumber(cleaned)
}

export function parseWeightToKg(input: string): number | null {
  const cleaned = input.toLowerCase().trim()

  // Already in kg
  if (cleaned.includes('kg') || (!cleaned.includes('lb') && !cleaned.includes('pound'))) {
    return parseNumber(cleaned)
  }

  // Convert from lbs
  if (cleaned.includes('lb') || cleaned.includes('pound')) {
    const lbs = parseNumber(cleaned)
    return lbs ? Math.round(lbs * 0.453592 * 10) / 10 : null
  }

  return parseNumber(cleaned)
}

export function createOnboardingMessage(step: OnboardingStep): CoachMessage {
  return {
    id: `onboarding-${step.id}`,
    role: 'coach',
    content: step.question,
    createdAt: new Date().toISOString(),
    metadata: {
      onboardingStep: step.id,
      onboardingSection: step.section,
    }
  }
}

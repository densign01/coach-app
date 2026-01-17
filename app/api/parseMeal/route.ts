import { NextResponse } from 'next/server'

import { mealParserAgent } from '@/lib/agents'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.text) {
    return NextResponse.json({ error: 'Missing meal text payload' }, { status: 400 })
  }

  const { result, source } = await mealParserAgent.parsemeal({
    text: body.text,
    mealType: body.mealType,
  })

  return NextResponse.json({
    draft: result,
    source,
  })
}

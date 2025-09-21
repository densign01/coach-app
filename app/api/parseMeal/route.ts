import { NextResponse } from 'next/server'

import { parseMealFromText } from '@/lib/ai/parsers'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.text) {
    return NextResponse.json({ error: 'Missing meal text payload' }, { status: 400 })
  }

  const result = await parseMealFromText(body.text)

  return NextResponse.json({
    draft: result,
  })
}

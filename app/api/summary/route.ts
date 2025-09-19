import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body?.summary) {
    return NextResponse.json({ error: 'Missing summary payload' }, { status: 400 })
  }

  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'Missing date query parameter' }, { status: 400 })
  }

  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Image parsing is a post-MVP feature' }, { status: 501 })
}
